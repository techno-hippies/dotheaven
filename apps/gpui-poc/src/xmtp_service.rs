//! XMTP messaging service for GPUI.
//!
//! Port of `apps/frontend/src-tauri/src/xmtp.rs` adapted for GPUI:
//! - No Tauri commands/events — plain struct with sync methods
//! - Own tokio runtime (same pattern as LitWalletService)
//! - Direct PKP signing via lit_wallet.rs (no event round-trip)

use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::voice::transport::VoiceSignalEnvelope;
use futures::StreamExt;
use prost::Message;
use serde::{Deserialize, Serialize};

use xmtp_api::ApiClientWrapper;
use xmtp_api_d14n::MessageBackendBuilder;
use xmtp_common::Retry;
use xmtp_content_types::{text::TextCodec, ContentCodec};
use xmtp_db::{
    encrypted_store::consent_record::ConsentState,
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

const XMTP_HOST: &str = "https://grpc.dev.xmtp.network:443";
const XMTP_HOST_PROD: &str = "https://grpc.production.xmtp.network:443";
const VOICE_SIGNAL_PREFIX: &str = "[heaven-voice-v1]";

#[derive(Copy, Clone, Debug)]
enum XmtpEnv {
    Dev,
    Production,
}

fn xmtp_env() -> XmtpEnv {
    let raw = std::env::var("HEAVEN_XMTP_ENV")
        .or_else(|_| std::env::var("XMTP_ENV"))
        .unwrap_or_else(|_| "dev".to_string());

    match raw.trim().to_ascii_lowercase().as_str() {
        "prod" | "production" => XmtpEnv::Production,
        _ => XmtpEnv::Dev,
    }
}

fn xmtp_env_name() -> &'static str {
    match xmtp_env() {
        XmtpEnv::Dev => "dev",
        XmtpEnv::Production => "production",
    }
}

fn xmtp_host() -> &'static str {
    match xmtp_env() {
        XmtpEnv::Dev => XMTP_HOST,
        XmtpEnv::Production => XMTP_HOST_PROD,
    }
}

fn xmtp_nonce_override() -> Option<u64> {
    let raw = std::env::var("HEAVEN_XMTP_NONCE")
        .or_else(|_| std::env::var("XMTP_NONCE"))
        .ok()?;
    match raw.trim().parse::<u64>() {
        Ok(value) => Some(value),
        Err(e) => {
            log::warn!("[XMTP] Invalid XMTP nonce override '{raw}': {e}");
            None
        }
    }
}

fn is_evm_address(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.len() != 42 || !trimmed.starts_with("0x") {
        return false;
    }
    trimmed
        .as_bytes()
        .iter()
        .skip(2)
        .all(|b| char::from(*b).is_ascii_hexdigit())
}

fn dm_consent_states() -> Vec<ConsentState> {
    vec![ConsentState::Allowed, ConsentState::Unknown]
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

fn encode_voice_signal_text(signal: &VoiceSignalEnvelope) -> Result<String, String> {
    let json = signal.to_json()?;
    Ok(format!("{VOICE_SIGNAL_PREFIX}{json}"))
}

fn parse_voice_signal_text(content: &str) -> Option<VoiceSignalEnvelope> {
    let trimmed = content.trim();
    if !trimmed.starts_with(VOICE_SIGNAL_PREFIX) {
        return None;
    }
    let payload = &trimmed[VOICE_SIGNAL_PREFIX.len()..];
    VoiceSignalEnvelope::from_json(payload).ok()
}

fn msg_to_json(msg: &StoredGroupMessage, conversation_id: &str) -> Option<XmtpMessage> {
    let content = decode_text(msg)?;
    if parse_voice_signal_text(&content).is_some() {
        return None;
    }
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
    last_dm_sync_at: std::sync::Mutex<Option<Instant>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::transport::{VoiceCapabilities, VoicePlatform, VoiceTransport};

    #[test]
    fn voice_signal_text_round_trips() {
        let envelope = VoiceSignalEnvelope::offer(
            "session-123",
            VoiceCapabilities::new(
                VoicePlatform::Desktop,
                vec![VoiceTransport::Jacktrip, VoiceTransport::Agora],
            ),
        );

        let encoded = encode_voice_signal_text(&envelope).expect("encode voice signal");
        let decoded = parse_voice_signal_text(&encoded).expect("decode voice signal");

        assert_eq!(decoded, envelope);
    }

    #[test]
    fn plain_text_is_not_parsed_as_voice_signal() {
        assert!(parse_voice_signal_text("hello world").is_none());
    }
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
            last_dm_sync_at: std::sync::Mutex::new(None),
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
        let identifier = Identifier::Ethereum(ident::Ethereum(address_lower.clone()));
        let nonce_override = xmtp_nonce_override();
        let inbox_id_nonce_0 = identifier.inbox_id(0).ok();
        let inbox_id_nonce_1 = identifier.inbox_id(1).ok();
        let nonce: u64 = nonce_override.unwrap_or(1);
        let inbox_id = identifier
            .inbox_id(nonce)
            .map_err(|e| format!("inbox_id: {e}"))?;
        log::info!(
            "[XMTP] Inbox selection: addr={}, nonce={}, override={:?}, nonce0_inbox={:?}, nonce1_inbox={:?}",
            address_lower,
            nonce,
            nonce_override,
            inbox_id_nonce_0,
            inbox_id_nonce_1
        );

        // 1. Create store
        let data_dir = app_data_dir();
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir: {e}"))?;
        let db_file = if nonce == 1 {
            // Keep legacy filename for nonce=1 to preserve existing local data.
            format!("xmtp-{}.db", &address_lower)
        } else {
            format!("xmtp-{}-n{}.db", &address_lower, nonce)
        };
        let db_path = data_dir.join(db_file).to_string_lossy().to_string();

        log::info!(
            "[XMTP] Connecting for {address_lower}, env={}, host={}, db={db_path}",
            xmtp_env_name(),
            xmtp_host()
        );

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
        if let Ok(mut last_sync_at) = self.last_dm_sync_at.lock() {
            *last_sync_at = None;
        }
        log::info!("[XMTP] Disconnected");
    }

    /// Clear local XMTP DB state for a wallet address (db + wal/shm/journal side files).
    ///
    /// This is a last-resort recovery path when local DM state gets stuck in an
    /// unrecoverable inactive/validation loop.
    pub fn reset_local_state_for_address(&mut self, address: &str) -> Result<String, String> {
        let address_lower = address.to_lowercase();
        self.disconnect();

        let base = app_data_dir().join(format!("xmtp-{}.db", address_lower));
        let sidecar = |suffix: &str| {
            std::path::PathBuf::from(format!("{}{}", base.to_string_lossy(), suffix))
        };
        let candidates = vec![
            base.clone(),
            sidecar("-wal"),
            sidecar("-shm"),
            sidecar("-journal"),
        ];

        let mut removed = Vec::new();
        for path in candidates {
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("remove {}: {e}", path.display()))?;
                removed.push(path.display().to_string());
            }
        }

        if removed.is_empty() {
            Ok(format!(
                "No local XMTP files found to reset for {}",
                address_lower
            ))
        } else {
            Ok(format!(
                "Removed {} local XMTP file(s) for {}",
                removed.len(),
                address_lower
            ))
        }
    }

    /// List DM conversations.
    pub fn list_conversations(&self) -> Result<Vec<ConversationInfo>, String> {
        let client = get_client(&self.client)?;
        let my_inbox_id = self.my_inbox_id.as_deref().unwrap_or_default().to_string();
        let consent_states = dm_consent_states();
        let should_sync = {
            let mut last_sync_at = self
                .last_dm_sync_at
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            let sync_needed = last_sync_at
                .map(|last| now.saturating_duration_since(last) >= Duration::from_secs(20))
                .unwrap_or(true);
            if sync_needed {
                *last_sync_at = Some(now);
            }
            sync_needed
        };

        self.runtime.block_on(async {
            if should_sync {
                // Keep this aligned with web transport: sync all first, then list DMs.
                // If network sync fails, still return the local DB snapshot.
                match client
                    .sync_all_welcomes_and_groups(Some(consent_states.clone()))
                    .await
                {
                    Ok(summary) => {
                        log::debug!("[XMTP] list sync summary: {summary:?}");
                    }
                    Err(e) => {
                        log::warn!(
                            "[XMTP] sync_all_welcomes_and_groups during list failed; using local state: {e}"
                        );
                    }
                }
            } else {
                log::debug!("[XMTP] Skipping full DM sync (throttled)");
            }

            let args = xmtp_db::encrypted_store::group::GroupQueryArgs {
                conversation_type: Some(ConversationType::Dm),
                consent_states: Some(consent_states.clone()),
                include_duplicate_dms: true,
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
                        let text = decode_text(msg).and_then(|decoded| {
                            parse_voice_signal_text(&decoded)
                                .is_none()
                                .then_some(decoded)
                        });
                        (
                            text,
                            Some(msg.sent_at_ns / 1_000_000),
                            Some(msg.sender_inbox_id.clone()),
                        )
                    } else {
                        (None, None, None)
                    };

                let info = ConversationInfo {
                    id: group_id_hex,
                    peer_address,
                    last_message,
                    last_message_at,
                    last_message_sender,
                };
                results.push(info);
            }

            results.sort_by(|a, b| {
                b.last_message_at
                    .unwrap_or(0)
                    .cmp(&a.last_message_at.unwrap_or(0))
                    .then_with(|| a.id.cmp(&b.id))
            });
            Ok(results)
        })
    }

    /// Get or create a DM conversation with a peer.
    pub fn get_or_create_dm(&self, peer_address: &str) -> Result<String, String> {
        self.get_or_create_dm_with_timeout(peer_address, Duration::from_secs(20))
    }

    /// Get or create a DM conversation with a timeout.
    pub fn get_or_create_dm_with_timeout(
        &self,
        peer_address: &str,
        timeout: Duration,
    ) -> Result<String, String> {
        self.refresh_dm_for_peer(peer_address, timeout)
    }

    /// Refresh DM state from the network and return the current DM conversation id for a peer.
    ///
    /// This intentionally resolves by peer identity rather than trusting a previously cached
    /// conversation id, because DM group ids can change after stitching/sync.
    pub fn refresh_dm_for_peer(
        &self,
        peer_address: &str,
        timeout: Duration,
    ) -> Result<String, String> {
        let client = get_client(&self.client)?;
        let peer = peer_address.trim().to_string();
        if !is_evm_address(&peer) {
            return Err(format!(
                "refresh_dm_for_peer expects an EVM address, got: {peer}"
            ));
        }

        self.runtime.block_on(async {
            let dm_future = async {
                match client
                    .sync_all_welcomes_and_groups(Some(dm_consent_states()))
                    .await
                {
                    Ok(summary) => {
                        log::info!(
                            "[XMTP] Refreshed welcomes/groups before DM lookup for {peer}: {summary:?}"
                        );
                    }
                    Err(e) => {
                        log::warn!("[XMTP] sync_all_welcomes_and_groups before DM lookup failed: {e}");
                    }
                }

                let identifier = Identifier::Ethereum(ident::Ethereum(peer.to_lowercase()));
                let dm = client
                    .find_or_create_dm_by_identity(identifier, None)
                    .await
                    .map_err(|e| format!("create_dm_by_identity: {e} | debug={e:?}"))?;

                if !dm.is_active().map_err(|e| format!("dm_is_active: {e}"))? {
                    return Err(format!(
                        "resolved DM is inactive after sync (peer={peer}); cannot send on stale DM"
                    ));
                }

                Ok::<String, String>(hex::encode(&dm.group_id))
            };

            tokio::time::timeout(timeout, dm_future)
                .await
                .map_err(|_| format!("refresh_dm timed out after {}s", timeout.as_secs()))?
        })
    }

    /// Send a text message to a conversation.
    pub fn send_message(&self, conversation_id: &str, content: &str) -> Result<(), String> {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let content = content.to_string();

        self.runtime.block_on(async {
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            let encoded = TextCodec::encode(content).map_err(|e| format!("encode: {e}"))?;
            let bytes = encoded.encode_to_vec();

            group
                .send_message(&bytes, SendMessageOpts::default())
                .await
                .map(|_| ())
                .map_err(|e| format!("send: {e}"))
        })
    }

    /// Send a session signaling message (offer/accept/reject) over XMTP.
    /// Media is not transported via XMTP; this is metadata signaling only.
    pub fn send_voice_signal(
        &self,
        conversation_id: &str,
        signal: &VoiceSignalEnvelope,
    ) -> Result<(), String> {
        let content = encode_voice_signal_text(signal)?;
        self.send_message(conversation_id, &content)
    }

    pub fn parse_voice_signal_payload(content: &str) -> Option<VoiceSignalEnvelope> {
        parse_voice_signal_text(content)
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
            let group = match client.stitched_group(&group_id) {
                Ok(group) => group,
                Err(stitched_err) => {
                    log::warn!(
                        "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                    );
                    client.group(&group_id).map_err(|e| format!("group: {e}"))?
                }
            };

            // Sync to get latest messages
            if let Err(e) = group.sync().await {
                let sync_err = e.to_string();
                if sync_err.to_ascii_lowercase().contains("inactive") {
                    log::warn!(
                        "[XMTP] sync failed for inactive group {conv_id}; loading local messages only"
                    );
                } else {
                    return Err(format!("sync: {e}"));
                }
            }

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

        let group = match client.stitched_group(&group_id) {
            Ok(group) => group,
            Err(stitched_err) => {
                log::warn!(
                    "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                );
                client.group(&group_id).map_err(|e| format!("group: {e}"))?
            }
        };

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

    /// Stream only session signaling messages for a specific conversation.
    pub fn stream_voice_signals<F>(&self, conversation_id: &str, callback: F) -> Result<(), String>
    where
        F: Fn(VoiceSignalEnvelope) + Send + 'static,
    {
        let client = get_client(&self.client)?;
        let group_id = hex::decode(conversation_id).map_err(|e| format!("hex: {e}"))?;
        let group = match client.stitched_group(&group_id) {
            Ok(group) => group,
            Err(stitched_err) => {
                log::warn!(
                    "[XMTP] stitched_group failed for {conversation_id}: {stitched_err}; falling back to group()"
                );
                client.group(&group_id).map_err(|e| format!("group: {e}"))?
            }
        };

        self.runtime.spawn(async move {
            match group.stream_owned().await {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(msg) => {
                                if let Some(content) = decode_text(&msg) {
                                    if let Some(signal) = parse_voice_signal_text(&content) {
                                        callback(signal);
                                    }
                                }
                            }
                            Err(e) => {
                                log::error!("[XMTP] Voice signal stream error: {e}");
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start voice signal stream: {e}");
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
        log::info!("[XMTP] Starting stream_all_messages");

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

    /// Stream DM conversation updates (including newly discovered welcomes/groups).
    pub fn stream_dm_conversations<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(String) + Send + 'static,
    {
        let client = get_client(&self.client)?;
        log::info!("[XMTP] Starting stream_dm_conversations");

        self.runtime.spawn(async move {
            match client
                .stream_conversations_owned(Some(ConversationType::Dm), true)
                .await
            {
                Ok(mut stream) => {
                    while let Some(result) = stream.next().await {
                        match result {
                            Ok(group) => {
                                callback(hex::encode(&group.group_id));
                            }
                            Err(e) => {
                                log::error!("[XMTP] Conversation stream error: {e}");
                                break;
                            }
                        }
                    }
                    log::info!("[XMTP] stream_dm_conversations ended");
                }
                Err(e) => {
                    log::error!("[XMTP] Failed to start DM conversation stream: {e}");
                }
            }
        });

        Ok(())
    }
}
