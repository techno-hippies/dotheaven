use std::sync::Arc;

use futures::StreamExt;
use prost::Message;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex, RwLock, oneshot};

use xmtp_api_d14n::MessageBackendBuilder;
use xmtp_content_types::{ContentCodec, text::TextCodec};
use xmtp_db::{
    EncryptedMessageStore, NativeDb, StorageOption,
    consent_record::ConsentState,
    encrypted_store::group::ConversationType,
    encrypted_store::group_message::{GroupMessageKind, MsgQueryArgs, StoredGroupMessage},
};
use xmtp_id::associations::{
    Identifier,
    ident,
    unverified::UnverifiedSignature,
};
use xmtp_mls::{
    Client, MlsContext,
    cursor_store::SqliteCursorStore,
    groups::send_message_opts::SendMessageOpts,
    identity::IdentityStrategy,
};
use xmtp_proto::xmtp::mls::message_contents::EncodedContent;

// ---------------------------------------------------------------------------
// Type alias – matches what the node bindings use
// ---------------------------------------------------------------------------

type XmtpClient = Client<MlsContext>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct XmtpState {
    client: RwLock<Option<Arc<XmtpClient>>>,
    /// Pending signature request: the frontend resolves this via `xmtp_resolve_signature`.
    pending_signature: Mutex<Option<oneshot::Sender<Vec<u8>>>>,
}

impl Default for XmtpState {
    fn default() -> Self {
        Self {
            client: RwLock::new(None),
            pending_signature: Mutex::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// JSON payloads (match the TypeScript transport interface)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConversationInfo {
    pub id: String,
    pub peer_address: String,
    pub last_message: Option<String>,
    pub last_message_at: Option<i64>,
    pub last_message_sender: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct XmtpMessage {
    pub id: String,
    pub conversation_id: String,
    pub sender_address: String,
    pub content: String,
    pub sent_at_ns: String,
    pub kind: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IS_DEV: bool = cfg!(debug_assertions);
const XMTP_HOST: &str = "https://grpc.dev.xmtp.network:443";
const XMTP_HOST_PROD: &str = "https://grpc.production.xmtp.network:443";

fn xmtp_host() -> &'static str {
    if IS_DEV { XMTP_HOST } else { XMTP_HOST_PROD }
}

fn decode_text(msg: &StoredGroupMessage) -> Option<String> {
    if msg.kind != GroupMessageKind::Application {
        return None;
    }
    let encoded = EncodedContent::decode(msg.decrypted_message_bytes.as_slice()).ok()?;
    let type_id = encoded.r#type.as_ref()?.type_id.as_str();
    if type_id != "text" && type_id != "markdown" {
        return None;
    }
    TextCodec::decode(encoded).ok()
}

fn msg_to_json(msg: &StoredGroupMessage, conversation_id: &str) -> Option<XmtpMessage> {
    let content = decode_text(msg)?;
    Some(XmtpMessage {
        id: hex::encode(&msg.id),
        conversation_id: conversation_id.to_string(),
        sender_address: msg.sender_inbox_id.clone(),
        content,
        sent_at_ns: msg.sent_at_ns.to_string(),
        kind: "application".to_string(),
    })
}

fn get_client(client: &Option<Arc<XmtpClient>>) -> Result<Arc<XmtpClient>, String> {
    client.as_ref().cloned().ok_or_else(|| "Not connected".to_string())
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Initialize the XMTP client for the given Ethereum address.
///
/// The flow:
/// 1. Build client with `IdentityStrategy::CreateIfNotFound`
/// 2. If the identity needs registration, emit `xmtp://sign-request` with the
///    signature text, then wait for the frontend to call `xmtp_resolve_signature`.
/// 3. Apply the signature and register the identity.
#[tauri::command]
pub async fn xmtp_init(
    app: AppHandle,
    state: State<'_, XmtpState>,
    address: String,
) -> Result<String, String> {
    // Already connected?
    {
        let guard = state.client.read().await;
        if let Some(ref c) = *guard {
            return Ok(c.inbox_id().to_string());
        }
    }

    let address_lower = address.to_lowercase();

    // 1. Create store
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("mkdir: {e}"))?;
    let db_path = app_dir
        .join(format!("xmtp-{}.db", &address_lower))
        .to_string_lossy()
        .to_string();

    let storage = StorageOption::Persistent(db_path);
    let db = NativeDb::new_unencrypted(&storage).map_err(|e| format!("db: {e}"))?;
    let store = EncryptedMessageStore::new(db).map_err(|e| format!("store: {e}"))?;

    // 2. Build API clients
    let cursor_store = SqliteCursorStore::new(store.db());
    let mut backend = MessageBackendBuilder::default();
    backend
        .v3_host(xmtp_host())
        .is_secure(true)
        .app_version("heaven/0.1.0".to_string())
        .cursor_store(cursor_store);

    let api_client = backend.clone().build().map_err(|e| format!("api: {e}"))?;
    let sync_api_client = backend.build().map_err(|e| format!("sync_api: {e}"))?;

    // 3. Create identity strategy
    let identifier = Identifier::Ethereum(ident::Ethereum(address_lower.clone()));
    let nonce: u64 = 1;
    let inbox_id = identifier
        .inbox_id(nonce)
        .map_err(|e| format!("inbox_id: {e}"))?;

    let identity_strategy = IdentityStrategy::new(
        inbox_id.clone(),
        identifier,
        nonce,
        None,
    );

    // 4. Build the XMTP client
    let xmtp_client = Client::builder(identity_strategy)
        .api_clients(api_client, sync_api_client)
        .enable_api_stats()
        .map_err(|e| format!("api_stats: {e}"))?
        .enable_api_debug_wrapper()
        .map_err(|e| format!("debug_wrapper: {e}"))?
        .with_remote_verifier()
        .map_err(|e| format!("verifier: {e}"))?
        .store(store)
        .default_mls_store()
        .map_err(|e| format!("mls_store: {e}"))?
        .build()
        .await
        .map_err(|e| format!("build: {e}"))?;

    // 5. Handle identity registration if needed
    if let Some(signature_request) = xmtp_client.identity().signature_request() {
        let sig_text = signature_request.signature_text();
        log::info!(
            "[XMTP/Rust] Identity needs signing: {}",
            &sig_text[..80.min(sig_text.len())]
        );

        // Create a oneshot channel for the frontend to resolve
        let (tx, rx) = oneshot::channel::<Vec<u8>>();
        {
            let mut pending = state.pending_signature.lock().await;
            *pending = Some(tx);
        }

        // Emit event to frontend
        app.emit("xmtp://sign-request", &sig_text)
            .map_err(|e| format!("emit: {e}"))?;

        // Wait for the frontend to sign (with timeout)
        let sig_bytes = tokio::time::timeout(std::time::Duration::from_secs(60), rx)
            .await
            .map_err(|_| "Signature request timed out after 60s".to_string())?
            .map_err(|_| "Signature channel closed".to_string())?;

        // Apply the ECDSA signature
        let unverified = UnverifiedSignature::new_recoverable_ecdsa(sig_bytes);
        let mut sig_req = signature_request;
        sig_req
            .add_signature(unverified, xmtp_client.scw_verifier().as_ref())
            .await
            .map_err(|e| format!("add_sig: {e}"))?;

        xmtp_client
            .register_identity(sig_req)
            .await
            .map_err(|e| format!("register: {e}"))?;

        log::info!("[XMTP/Rust] Identity registered successfully");
    }

    let result_inbox_id = xmtp_client.inbox_id().to_string();
    {
        let mut guard = state.client.write().await;
        *guard = Some(Arc::new(xmtp_client));
    }

    log::info!("[XMTP/Rust] Connected with inbox_id={}", &result_inbox_id);
    Ok(result_inbox_id)
}

/// Called by the frontend after signing the message text.
#[tauri::command]
pub async fn xmtp_resolve_signature(
    state: State<'_, XmtpState>,
    signature_hex: String,
) -> Result<(), String> {
    let clean = signature_hex.strip_prefix("0x").unwrap_or(&signature_hex);
    let bytes = hex::decode(clean).map_err(|e| format!("hex decode: {e}"))?;

    let mut pending = state.pending_signature.lock().await;
    if let Some(tx) = pending.take() {
        tx.send(bytes).map_err(|_| "Receiver dropped".to_string())?;
        Ok(())
    } else {
        Err("No pending signature request".to_string())
    }
}

/// Disconnect the XMTP client.
#[tauri::command]
pub async fn xmtp_disconnect(state: State<'_, XmtpState>) -> Result<(), String> {
    let mut guard = state.client.write().await;
    *guard = None;
    Ok(())
}

/// Check if the XMTP client is connected.
#[tauri::command]
pub async fn xmtp_is_connected(state: State<'_, XmtpState>) -> Result<bool, String> {
    let guard = state.client.read().await;
    Ok(guard.is_some())
}

/// Get the current inbox ID.
#[tauri::command]
pub async fn xmtp_get_inbox_id(state: State<'_, XmtpState>) -> Result<Option<String>, String> {
    let guard = state.client.read().await;
    Ok(guard.as_ref().map(|c| c.inbox_id().to_string()))
}

/// List DM conversations.
#[tauri::command]
pub async fn xmtp_list_conversations(
    state: State<'_, XmtpState>,
) -> Result<Vec<ConversationInfo>, String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    // Sync welcomes first to discover new conversations
    client
        .sync_welcomes()
        .await
        .map_err(|e| format!("sync_welcomes: {e}"))?;

    let args = xmtp_db::encrypted_store::group::GroupQueryArgs {
        conversation_type: Some(ConversationType::Dm),
        ..Default::default()
    };

    let conversations = client
        .list_conversations(args)
        .map_err(|e| format!("list: {e}"))?;

    let my_inbox_id = client.inbox_id().to_string();
    let mut results = Vec::new();

    for conv in conversations {
        let group_id_hex = hex::encode(&conv.group.group_id);

        // Resolve peer's Ethereum address from group members
        let peer_address = match conv.group.members().await {
            Ok(members) => {
                // Find the member that isn't us
                let peer = members.iter().find(|m| m.inbox_id != my_inbox_id);
                if let Some(peer) = peer {
                    // Extract Ethereum address from account_identifiers
                    peer.account_identifiers
                        .iter()
                        .find_map(|id| match id {
                            Identifier::Ethereum(eth) => Some(eth.0.clone()),
                            _ => None,
                        })
                        .unwrap_or_else(|| {
                            eprintln!("[XMTP] No Ethereum identifier for peer inbox {}", peer.inbox_id);
                            conv.group.dm_id.clone().unwrap_or_else(|| group_id_hex.clone())
                        })
                } else {
                    eprintln!("[XMTP] No peer member found in DM {group_id_hex}, members: {}", members.len());
                    conv.group.dm_id.clone().unwrap_or_else(|| group_id_hex.clone())
                }
            }
            Err(e) => {
                eprintln!("[XMTP] Failed to load members for {group_id_hex}: {e}");
                conv.group.dm_id.clone().unwrap_or_else(|| group_id_hex.clone())
            }
        };

        // Extract last message info
        let (last_message, last_message_at, last_message_sender) =
            if let Some(ref msg) = conv.last_message {
                let text = decode_text(msg);
                (
                    text,
                    Some(msg.sent_at_ns / 1_000_000),
                    Some(msg.sender_inbox_id.clone()),
                )
            } else {
                (None, None, None)
            };

        results.push(ConversationInfo {
            id: group_id_hex,
            peer_address,
            last_message,
            last_message_at,
            last_message_sender,
        });
    }

    Ok(results)
}

/// Get or create a DM conversation with a peer.
/// `peer_address` can be an Ethereum address (0x...) or an inbox ID.
#[tauri::command]
pub async fn xmtp_get_or_create_conversation(
    state: State<'_, XmtpState>,
    peer_address: String,
) -> Result<String, String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    let dm = if peer_address.starts_with("0x") {
        let identifier = Identifier::Ethereum(ident::Ethereum(peer_address.to_lowercase()));
        client
            .find_or_create_dm_by_identity(identifier, None)
            .await
            .map_err(|e| format!("create_dm_by_identity: {e}"))?
    } else {
        client
            .find_or_create_dm(&peer_address, None)
            .await
            .map_err(|e| format!("create_dm: {e}"))?
    };

    Ok(hex::encode(&dm.group_id))
}

/// Send a text message to a conversation.
#[tauri::command]
pub async fn xmtp_send_message(
    state: State<'_, XmtpState>,
    conversation_id: String,
    content: String,
) -> Result<(), String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    let group_id = hex::decode(&conversation_id).map_err(|e| format!("hex: {e}"))?;
    let group = client
        .group(&group_id)
        .map_err(|e| format!("group: {e}"))?;

    let encoded = TextCodec::encode(content).map_err(|e| format!("encode: {e}"))?;
    let bytes = encoded.encode_to_vec();

    group
        .send_message(&bytes, SendMessageOpts::default())
        .await
        .map_err(|e| format!("send: {e}"))?;

    Ok(())
}

/// Load messages from a conversation.
#[tauri::command]
pub async fn xmtp_load_messages(
    state: State<'_, XmtpState>,
    conversation_id: String,
    limit: Option<i64>,
    sent_after_ns: Option<String>,
) -> Result<Vec<XmtpMessage>, String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    let group_id = hex::decode(&conversation_id).map_err(|e| format!("hex: {e}"))?;
    let group = client
        .group(&group_id)
        .map_err(|e| format!("group: {e}"))?;

    // Sync to get latest messages
    group.sync().await.map_err(|e| format!("sync: {e}"))?;

    let args = MsgQueryArgs {
        kind: Some(GroupMessageKind::Application),
        limit,
        sent_after_ns: sent_after_ns.and_then(|s| s.parse::<i64>().ok()),
        ..Default::default()
    };

    let messages = group
        .find_messages(&args)
        .map_err(|e| format!("find: {e}"))?;

    let results: Vec<XmtpMessage> = messages
        .iter()
        .filter_map(|m| msg_to_json(m, &conversation_id))
        .collect();

    Ok(results)
}

/// Start streaming messages for a conversation.
/// Messages are emitted as `xmtp://message` events.
#[tauri::command]
pub async fn xmtp_stream_messages(
    app: AppHandle,
    state: State<'_, XmtpState>,
    conversation_id: String,
) -> Result<(), String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    let group_id = hex::decode(&conversation_id).map_err(|e| format!("hex: {e}"))?;
    let group = client
        .group(&group_id)
        .map_err(|e| format!("group: {e}"))?;

    let conv_id = conversation_id.clone();
    let app_handle = app.clone();

    // Use stream_owned() which doesn't borrow self — suitable for spawned tasks
    let mut stream = group
        .stream_owned()
        .await
        .map_err(|e| format!("stream: {e}"))?;

    tokio::spawn(async move {
        while let Some(result) = stream.next().await {
            match result {
                Ok(msg) => {
                    if let Some(json_msg) = msg_to_json(&msg, &conv_id) {
                        if let Err(e) = app_handle.emit("xmtp://message", &json_msg) {
                            log::error!("[XMTP/Rust] Failed to emit message: {e}");
                            break;
                        }
                    }
                }
                Err(e) => {
                    log::error!("[XMTP/Rust] Stream error: {e}");
                    break;
                }
            }
        }
    });

    Ok(())
}

/// Update consent state for a conversation.
#[tauri::command]
pub async fn xmtp_update_consent(
    state: State<'_, XmtpState>,
    conversation_id: String,
    consent: String,
) -> Result<(), String> {
    let client = {
        let guard = state.client.read().await;
        get_client(&guard)?
    };

    let group_id = hex::decode(&conversation_id).map_err(|e| format!("hex: {e}"))?;
    let group = client
        .group(&group_id)
        .map_err(|e| format!("group: {e}"))?;

    let consent_state = match consent.as_str() {
        "allowed" => ConsentState::Allowed,
        "denied" => ConsentState::Denied,
        _ => ConsentState::Unknown,
    };

    group
        .update_consent_state(consent_state)
        .map_err(|e| format!("consent: {e}"))?;

    Ok(())
}
