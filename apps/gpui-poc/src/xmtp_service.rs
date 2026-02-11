//! XMTP messaging service for GPUI.
//!
//! Port of `apps/frontend/src-tauri/src/xmtp.rs` adapted for GPUI:
//! - No Tauri commands/events — plain struct with sync methods
//! - Own tokio runtime (same pattern as LitWalletService)
//! - Direct PKP signing via lit_wallet.rs (no event round-trip)

use std::collections::HashSet;
use std::sync::Arc;

use futures::StreamExt;
use prost::Message;
use serde::{Deserialize, Serialize};

use xmtp_api::ApiClientWrapper;
use xmtp_api_d14n::MessageBackendBuilder;
use xmtp_common::Retry;
use xmtp_content_types::{text::TextCodec, ContentCodec};
use xmtp_db::{
    encrypted_store::group::ConversationType,
    encrypted_store::group_message::{GroupMessageKind, MsgQueryArgs, StoredGroupMessage},
    EncryptedMessageStore, NativeDb, StorageOption,
};
use xmtp_id::associations::{ident, unverified::UnverifiedSignature, Identifier};
use xmtp_mls::{
    builder::ClientBuilderError,
    client::ClientError,
    cursor_store::SqliteCursorStore,
    groups::send_message_opts::SendMessageOpts,
    identity::IdentityError,
    identity::IdentityStrategy,
    identity_updates::{
        apply_signature_request_with_verifier, get_association_state_with_verifier,
        load_identity_updates, revoke_installations_with_verifier,
    },
    Client, MlsContext,
};
use xmtp_proto::xmtp::mls::message_contents::EncodedContent;

// ---------------------------------------------------------------------------
// Type alias
// ---------------------------------------------------------------------------

type XmtpClient = Client<MlsContext>;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationInfo {
    pub id: String,
    pub peer_address: String,
    pub last_message: Option<String>,
    pub last_message_at: Option<i64>,
    pub last_message_sender: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
    if IS_DEV {
        XMTP_HOST
    } else {
        XMTP_HOST_PROD
    }
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
    client
        .as_ref()
        .cloned()
        .ok_or_else(|| "XMTP not connected".to_string())
}

fn app_data_dir() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("heaven-gpui")
}

#[derive(Debug)]
enum ConnectBuildError {
    TooManyInstallations {
        inbox_id: String,
        count: usize,
        max: usize,
    },
    Other(String),
}

fn map_builder_error(err: ClientBuilderError) -> ConnectBuildError {
    match err {
        ClientBuilderError::Identity(IdentityError::TooManyInstallations {
            inbox_id,
            count,
            max,
        }) => ConnectBuildError::TooManyInstallations {
            inbox_id,
            count,
            max,
        },
        ClientBuilderError::ClientError(ClientError::Identity(
            IdentityError::TooManyInstallations {
                inbox_id,
                count,
                max,
            },
        )) => ConnectBuildError::TooManyInstallations {
            inbox_id,
            count,
            max,
        },
        other => ConnectBuildError::Other(format!("build: {other}")),
    }
}

// ---------------------------------------------------------------------------
// XmtpService
// ---------------------------------------------------------------------------

pub struct XmtpService {
    runtime: tokio::runtime::Runtime,
    client: Option<Arc<XmtpClient>>,
    my_inbox_id: Option<String>,
    my_address: Option<String>,
}

impl XmtpService {
    pub fn new() -> Result<Self, String> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create tokio runtime: {e}"))?;

        Ok(Self {
            runtime,
            client: None,
            my_inbox_id: None,
            my_address: None,
        })
    }

    pub fn is_connected(&self) -> bool {
        self.client.is_some()
    }

    #[allow(dead_code)]
    pub fn my_inbox_id(&self) -> Option<&str> {
        self.my_inbox_id.as_deref()
    }

    #[allow(dead_code)]
    pub fn my_address(&self) -> Option<&str> {
        self.my_address.as_deref()
    }

    /// Connect to XMTP for the given Ethereum address.
    ///
    /// `sign_fn` is called if the identity needs registration — it receives the
    /// signature text as bytes and must return the ECDSA signature bytes.
    /// In GPUI this is `LitWalletService::pkp_personal_sign()`.
    pub fn connect<F>(&mut self, address: &str, mut sign_fn: F) -> Result<String, String>
    where
        F: FnMut(&[u8]) -> Result<Vec<u8>, String>,
    {
        // Already connected?
        if let Some(ref c) = self.client {
            return Ok(c.inbox_id().to_string());
        }

        let address_lower = address.to_lowercase();

        // 1. Create store
        let data_dir = app_data_dir();
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir: {e}"))?;
        let db_path = data_dir
            .join(format!("xmtp-{}.db", &address_lower))
            .to_string_lossy()
            .to_string();

        log::info!("[XMTP] Connecting for {address_lower}, db={db_path}");

        let identifier = Identifier::Ethereum(ident::Ethereum(address_lower.clone()));
        let nonce: u64 = 1;
        let inbox_id = identifier
            .inbox_id(nonce)
            .map_err(|e| format!("inbox_id: {e}"))?;

        let identity_strategy = IdentityStrategy::new(inbox_id.clone(), identifier, nonce, None);

        let xmtp_client = match self.build_client(&identity_strategy, &db_path) {
            Ok(client) => client,
            Err(ConnectBuildError::TooManyInstallations {
                inbox_id,
                count,
                max,
            }) => {
                log::warn!(
                    "[XMTP] Installation limit reached ({count}/{max}) for inbox {inbox_id}. \
Attempting automatic revocation of stale installations..."
                );

                self.recover_installation_limit(&db_path, &inbox_id, count, max, &mut sign_fn)?;

                match self.build_client(&identity_strategy, &db_path) {
                    Ok(client) => client,
                    Err(ConnectBuildError::TooManyInstallations {
                        inbox_id,
                        count,
                        max,
                    }) => {
                        return Err(format!(
                            "build: Cannot register a new installation because the InboxID \
{inbox_id} still has {count}/{max} installations after attempted recovery."
                        ));
                    }
                    Err(ConnectBuildError::Other(err)) => return Err(err),
                }
            }
            Err(ConnectBuildError::Other(err)) => return Err(err),
        };

        // 5. Handle identity registration if needed
        if let Some(signature_request) = xmtp_client.identity().signature_request() {
            let sig_text = signature_request.signature_text();
            log::info!(
                "[XMTP] Identity needs signing: {}...",
                &sig_text[..80.min(sig_text.len())]
            );

            // Sign directly via PKP (no event round-trip like Tauri!)
            let sig_bytes = sign_fn(sig_text.as_bytes())?;
            if sig_bytes.len() != 65 {
                return Err(format!(
                    "Signer returned invalid XMTP signature length: expected 65, got {}",
                    sig_bytes.len()
                ));
            }

            // Apply the ECDSA signature
            let unverified = UnverifiedSignature::new_recoverable_ecdsa(sig_bytes);
            let mut sig_req = signature_request;

            self.runtime.block_on(async {
                sig_req
                    .add_signature(unverified, xmtp_client.scw_verifier().as_ref())
                    .await
                    .map_err(|e| format!("add_sig: {e}"))?;

                xmtp_client
                    .register_identity(sig_req)
                    .await
                    .map_err(|e| format!("register: {e}"))
            })?;

            log::info!("[XMTP] Identity registered successfully");
        }

        let result_inbox_id = xmtp_client.inbox_id().to_string();
        self.client = Some(Arc::new(xmtp_client));
        self.my_inbox_id = Some(result_inbox_id.clone());
        self.my_address = Some(address_lower);

        log::info!("[XMTP] Connected with inbox_id={result_inbox_id}");
        Ok(result_inbox_id)
    }

    fn build_client(
        &self,
        identity_strategy: &IdentityStrategy,
        db_path: &str,
    ) -> Result<XmtpClient, ConnectBuildError> {
        let storage = StorageOption::Persistent(db_path.to_string());
        let db = NativeDb::new_unencrypted(&storage)
            .map_err(|e| ConnectBuildError::Other(format!("db: {e}")))?;
        let store = EncryptedMessageStore::new(db)
            .map_err(|e| ConnectBuildError::Other(format!("store: {e}")))?;

        let cursor_store = SqliteCursorStore::new(store.db());
        let mut backend = MessageBackendBuilder::default();
        backend
            .v3_host(xmtp_host())
            .is_secure(true)
            .app_version("heaven-gpui/0.1.0".to_string())
            .cursor_store(cursor_store);

        self.runtime.block_on(async {
            let api_client = backend
                .clone()
                .build()
                .map_err(|e| ConnectBuildError::Other(format!("api: {e}")))?;
            let sync_api_client = backend
                .build()
                .map_err(|e| ConnectBuildError::Other(format!("sync_api: {e}")))?;

            let builder = Client::builder(identity_strategy.clone())
                .api_clients(api_client, sync_api_client)
                .enable_api_stats()
                .map_err(|e| ConnectBuildError::Other(format!("api_stats: {e}")))?
                .enable_api_debug_wrapper()
                .map_err(|e| ConnectBuildError::Other(format!("debug_wrapper: {e}")))?
                .with_remote_verifier()
                .map_err(|e| ConnectBuildError::Other(format!("verifier: {e}")))?
                .store(store)
                .default_mls_store()
                .map_err(|e| ConnectBuildError::Other(format!("mls_store: {e}")))?;

            builder.build().await.map_err(map_builder_error)
        })
    }

    fn recover_installation_limit<F>(
        &self,
        db_path: &str,
        inbox_id: &str,
        count: usize,
        max: usize,
        sign_fn: &mut F,
    ) -> Result<(), String>
    where
        F: FnMut(&[u8]) -> Result<Vec<u8>, String>,
    {
        let max_before_new_install = max.saturating_sub(1);
        let revoke_needed = count.saturating_sub(max_before_new_install);
        if revoke_needed == 0 {
            return Ok(());
        }

        log::info!(
            "[XMTP] Revoking {revoke_needed} installation(s) for inbox {inbox_id} \
to get below the {max} installation cap..."
        );

        // Phase 1: build revocation signature request in async context.
        let (mut signature_request, revoked_count) = self.runtime.block_on(async {
            let storage = StorageOption::Persistent(db_path.to_string());
            let db = NativeDb::new_unencrypted(&storage).map_err(|e| format!("db: {e}"))?;
            let store = EncryptedMessageStore::new(db).map_err(|e| format!("store: {e}"))?;
            let cursor_store = SqliteCursorStore::new(store.db());

            let mut backend = MessageBackendBuilder::default();
            backend
                .v3_host(xmtp_host())
                .is_secure(true)
                .app_version("heaven-gpui/0.1.0".to_string())
                .cursor_store(cursor_store);

            let api_client = backend.build().map_err(|e| format!("api: {e}"))?;
            let verifier = ApiClientWrapper::new(api_client, Retry::default());
            let conn = store.db();

            load_identity_updates(&verifier, &conn, &[inbox_id])
                .await
                .map_err(|e| format!("load_identity_updates: {e}"))?;

            let state = get_association_state_with_verifier(&conn, inbox_id, None, &verifier)
                .await
                .map_err(|e| format!("get_association_state: {e}"))?;

            // Revoke the oldest installations first and only as many as required.
            let mut seen = HashSet::new();
            let mut installation_ids_to_revoke = Vec::new();
            for installation in state.installations() {
                if seen.insert(installation.id.clone()) {
                    installation_ids_to_revoke.push(installation.id);
                }
                if installation_ids_to_revoke.len() >= revoke_needed {
                    break;
                }
            }

            if installation_ids_to_revoke.len() < revoke_needed {
                return Err(format!(
                    "Not enough revocable installations: needed {revoke_needed}, found {}",
                    installation_ids_to_revoke.len()
                ));
            }

            let signature_request = revoke_installations_with_verifier(
                state.recovery_identifier(),
                inbox_id,
                installation_ids_to_revoke.clone(),
            )
            .map_err(|e| format!("revoke_installations request: {e}"))?;

            Ok::<_, String>((signature_request, installation_ids_to_revoke.len()))
        })?;

        // Phase 2: sign outside tokio runtime threads to avoid nested-runtime panics.
        let sig_text = signature_request.signature_text().to_string();
        let sig_bytes = sign_fn(sig_text.as_bytes())?;
        if sig_bytes.len() != 65 {
            return Err(format!(
                "Signer returned invalid revocation signature length: expected 65, got {}",
                sig_bytes.len()
            ));
        }

        // Phase 3: apply signed revocation in async context.
        let unverified = UnverifiedSignature::new_recoverable_ecdsa(sig_bytes);
        self.runtime.block_on(async {
            let mut backend = MessageBackendBuilder::default();
            backend
                .v3_host(xmtp_host())
                .is_secure(true)
                .app_version("heaven-gpui/0.1.0".to_string());

            let api_client = backend.build().map_err(|e| format!("api: {e}"))?;
            let verifier = ApiClientWrapper::new(api_client, Retry::default());

            signature_request
                .add_signature(unverified, &verifier)
                .await
                .map_err(|e| format!("revoke_installations add_signature: {e}"))?;

            apply_signature_request_with_verifier(&verifier, signature_request, &verifier)
                .await
                .map_err(|e| format!("revoke_installations apply: {e}"))
        })?;

        log::info!(
            "[XMTP] Revoked {} installation(s) for inbox {}",
            revoked_count,
            inbox_id
        );

        Ok(())
    }

    pub fn disconnect(&mut self) {
        self.client = None;
        self.my_inbox_id = None;
        self.my_address = None;
        log::info!("[XMTP] Disconnected");
    }

    /// List DM conversations.
    pub fn list_conversations(&self) -> Result<Vec<ConversationInfo>, String> {
        let client = get_client(&self.client)?;
        let my_inbox_id = self.my_inbox_id.as_deref().unwrap_or_default().to_string();

        self.runtime.block_on(async {
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

            let mut results = Vec::new();

            for conv in conversations {
                let group_id_hex = hex::encode(&conv.group.group_id);

                // Resolve peer's Ethereum address from group members
                let peer_address = match conv.group.members().await {
                    Ok(members) => {
                        let peer = members.iter().find(|m| m.inbox_id != my_inbox_id);
                        if let Some(peer) = peer {
                            peer.account_identifiers
                                .iter()
                                .find_map(|id| match id {
                                    Identifier::Ethereum(eth) => Some(eth.0.clone()),
                                    _ => None,
                                })
                                .unwrap_or_else(|| {
                                    conv.group
                                        .dm_id
                                        .clone()
                                        .unwrap_or_else(|| group_id_hex.clone())
                                })
                        } else {
                            conv.group
                                .dm_id
                                .clone()
                                .unwrap_or_else(|| group_id_hex.clone())
                        }
                    }
                    Err(e) => {
                        log::warn!("[XMTP] Failed to load members for {group_id_hex}: {e}");
                        conv.group
                            .dm_id
                            .clone()
                            .unwrap_or_else(|| group_id_hex.clone())
                    }
                };

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
        })
    }

    /// Get or create a DM conversation with a peer.
    pub fn get_or_create_dm(&self, peer_address: &str) -> Result<String, String> {
        let client = get_client(&self.client)?;
        let peer = peer_address.to_string();

        self.runtime.block_on(async {
            let dm = if peer.starts_with("0x") {
                let identifier = Identifier::Ethereum(ident::Ethereum(peer.to_lowercase()));
                client
                    .find_or_create_dm_by_identity(identifier, None)
                    .await
                    .map_err(|e| format!("create_dm_by_identity: {e}"))?
            } else {
                client
                    .find_or_create_dm(&peer, None)
                    .await
                    .map_err(|e| format!("create_dm: {e}"))?
            };

            Ok(hex::encode(&dm.group_id))
        })
    }

    /// Send a text message to a conversation.
    pub fn send_message(&self, conversation_id: &str, content: &str) -> Result<(), String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let content = content.to_string();

        self.runtime.block_on(async {
            let group = client.group(&group_id).map_err(|e| format!("group: {e}"))?;

            let encoded = TextCodec::encode(content).map_err(|e| format!("encode: {e}"))?;
            let bytes = encoded.encode_to_vec();

            group
                .send_message(&bytes, SendMessageOpts::default())
                .await
                .map(|_| ())
                .map_err(|e| format!("send: {e}"))
        })
    }

    /// Load messages from a conversation.
    pub fn load_messages(
        &self,
        conversation_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<XmtpMessage>, String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let conv_id = conversation_id.to_string();

        self.runtime.block_on(async {
            let group = client.group(&group_id).map_err(|e| format!("group: {e}"))?;

            // Sync to get latest messages
            group.sync().await.map_err(|e| format!("sync: {e}"))?;

            let args = MsgQueryArgs {
                kind: Some(GroupMessageKind::Application),
                limit,
                ..Default::default()
            };

            let messages = group
                .find_messages(&args)
                .map_err(|e| format!("find: {e}"))?;

            let results: Vec<XmtpMessage> = messages
                .iter()
                .filter_map(|m| msg_to_json(m, &conv_id))
                .collect();

            Ok(results)
        })
    }

    /// Start streaming messages for a specific conversation.
    /// The callback is invoked on the tokio runtime for each new message.
    pub fn stream_messages<F>(&self, conversation_id: &str, callback: F) -> Result<(), String>
    where
        F: Fn(XmtpMessage) + Send + 'static,
    {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let conv_id = conversation_id.to_string();

        let group = client.group(&group_id).map_err(|e| format!("group: {e}"))?;

        self.runtime.spawn(async move {
            match group.stream_owned().await {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(msg) => {
                                if let Some(json_msg) = msg_to_json(&msg, &conv_id) {
                                    callback(json_msg);
                                }
                            }
                            Err(e) => {
                                log::error!("[XMTP] Stream error: {e}");
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start stream: {e}");
                }
            }
        });

        Ok(())
    }

    /// Start streaming ALL messages across all DM conversations.
    /// Used for unread indicators when the user isn't viewing a specific chat.
    pub fn stream_all_messages<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(XmtpMessage) + Send + 'static,
    {
        let client = get_client(&self.client)?;

        self.runtime.spawn(async move {
            match client
                .stream_all_messages_owned(Some(ConversationType::Dm), None)
                .await
            {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(msg) => {
                                let conv_id = hex::encode(&msg.group_id);
                                if let Some(json_msg) = msg_to_json(&msg, &conv_id) {
                                    callback(json_msg);
                                }
                            }
                            Err(e) => {
                                log::error!("[XMTP] Stream-all error: {e}");
                                break;
                            }
                        }
                    }
                    log::info!("[XMTP] stream_all_messages ended");
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start stream-all: {e}");
                }
            }
        });

        Ok(())
    }
}
