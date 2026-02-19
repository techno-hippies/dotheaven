//! Browser-based WebAuthn authentication for GPUI
//!
//! Flow:
//! 1. Start local HTTP server for callback on random port
//! 2. Open system browser to auth page with callback URL
//! 3. Auth page handles WebAuthn, POSTs result back
//! 4. Parse result, update global AuthState, persist to disk
//!
//! Ported from the legacy desktop auth module (tokio → smol)

mod callback_flow;
mod persistence;

pub use callback_flow::run_auth_callback_server;
pub use persistence::{delete_from_disk, load_from_disk, save_to_disk, to_persisted};
use serde::{Deserialize, Serialize};

// Auth page URL
#[cfg(debug_assertions)]
const AUTH_PAGE_URL: &str = "http://localhost:5173/#/auth";
#[cfg(not(debug_assertions))]
const AUTH_PAGE_URL: &str = "https://dotheaven.org/#/auth";

const AUTH_FILE: &str = "heaven-auth.json";

// =============================================================================
// Types
// =============================================================================

/// Auth result from browser callback
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub wallet_address: Option<String>,
    #[serde(default, alias = "state")]
    pub callback_state: Option<String>,
    #[serde(default)]
    pub tempo_credential_id: Option<String>,
    #[serde(default)]
    pub tempo_public_key: Option<String>,
    #[serde(default)]
    pub tempo_rp_id: Option<String>,
    #[serde(default)]
    pub tempo_key_manager_url: Option<String>,
    #[serde(default)]
    pub tempo_fee_payer_url: Option<String>,
    #[serde(default)]
    pub tempo_chain_id: Option<u64>,
    #[serde(default)]
    pub tempo_session_private_key: Option<String>,
    #[serde(default)]
    pub tempo_session_address: Option<String>,
    #[serde(default)]
    pub tempo_session_expires_at: Option<u64>,
    #[serde(default)]
    pub tempo_session_key_authorization: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
    pub is_new_user: Option<bool>,
    pub error: Option<String>,
}

/// Persisted auth data (stored on disk)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAuth {
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub wallet_address: Option<String>,
    #[serde(default)]
    pub tempo_credential_id: Option<String>,
    #[serde(default)]
    pub tempo_public_key: Option<String>,
    #[serde(default)]
    pub tempo_rp_id: Option<String>,
    #[serde(default)]
    pub tempo_key_manager_url: Option<String>,
    #[serde(default)]
    pub tempo_fee_payer_url: Option<String>,
    #[serde(default)]
    pub tempo_chain_id: Option<u64>,
    #[serde(default)]
    pub tempo_session_private_key: Option<String>,
    #[serde(default)]
    pub tempo_session_address: Option<String>,
    #[serde(default)]
    pub tempo_session_expires_at: Option<u64>,
    #[serde(default)]
    pub tempo_session_key_authorization: Option<String>,
    #[serde(default)]
    pub access_token: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthProviderKind {
    TempoPasskey,
    Unknown,
}

impl AuthProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TempoPasskey => "tempo-passkey",
            Self::Unknown => "unknown",
        }
    }
}

/// Global auth state observable by UI
#[derive(Clone, Default)]
pub struct AuthState {
    /// True while browser auth flow is in progress
    pub authing: bool,
    /// Set after successful auth (or loaded from disk)
    pub persisted: Option<PersistedAuth>,
}

impl gpui::Global for AuthState {}

impl AuthState {
    pub fn is_authenticated(&self) -> bool {
        self.persisted.is_some()
    }

    pub fn display_address(&self) -> Option<&str> {
        self.persisted.as_ref()?.wallet_address()
    }
}

impl AuthResult {
    pub fn wallet_address(&self) -> Option<&str> {
        self.wallet_address.as_deref()
    }
}

impl PersistedAuth {
    pub fn provider_kind(&self) -> AuthProviderKind {
        provider_kind(self.provider.as_deref())
    }

    pub fn wallet_address(&self) -> Option<&str> {
        self.wallet_address.as_deref()
    }
}

fn provider_kind(provider: Option<&str>) -> AuthProviderKind {
    match provider
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "tempo-passkey" => AuthProviderKind::TempoPasskey,
        _ => AuthProviderKind::Unknown,
    }
}

fn short_hex(value: &str) -> String {
    if value.len() <= 14 {
        value.to_string()
    } else {
        format!("{}...{}", &value[..8], &value[value.len() - 6..])
    }
}

pub fn log_auth_result(context: &str, result: &AuthResult) {
    log::info!(
        "[Auth] {}: version={:?}, provider={:?}, wallet={:?}, tempo_credential_id={:?}, tempo_public_key={}, is_new_user={:?}",
        context,
        result.version,
        result.provider,
        result.wallet_address(),
        result.tempo_credential_id,
        result
            .tempo_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
        result.is_new_user
    );
}

pub fn log_persisted_auth(context: &str, auth: &PersistedAuth) {
    log::debug!(
        "[Auth] {}: version={:?}, provider={:?}, wallet={:?}, tempo_credential_id={:?}, tempo_public_key={}",
        context,
        auth.version,
        auth.provider,
        auth.wallet_address(),
        auth.tempo_credential_id,
        auth.tempo_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
    );
}
