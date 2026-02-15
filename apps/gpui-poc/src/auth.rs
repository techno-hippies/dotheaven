//! Browser-based WebAuthn authentication for GPUI
//!
//! Flow:
//! 1. Start local HTTP server for callback on random port
//! 2. Open system browser to auth page with callback URL
//! 3. Auth page handles WebAuthn, POSTs result back
//! 4. Parse result, update global AuthState, persist to disk
//!
//! Ported from apps/frontend/src-tauri/src/auth.rs (tokio → smol)

mod callback_flow;
mod persistence;

pub use callback_flow::run_auth_callback_server;
pub use persistence::{
    delegation_has_lit_action_execution, delete_from_disk, load_from_disk, save_to_disk,
    to_persisted,
};

use lit_rust_sdk::{AuthSig as LitAuthSig, SessionKeyPair};
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
    pub pkp_public_key: Option<String>,
    pub pkp_address: Option<String>,
    pub pkp_token_id: Option<String>,
    pub auth_method_type: Option<u32>,
    pub auth_method_id: Option<String>,
    pub access_token: Option<String>,
    pub is_new_user: Option<bool>,
    pub error: Option<String>,
    #[serde(default)]
    pub eoa_address: Option<String>,
    #[serde(default)]
    pub lit_session_key_pair: Option<SessionKeyPair>,
    #[serde(default)]
    pub lit_delegation_auth_sig: Option<LitAuthSig>,
}

/// Persisted auth data (stored on disk)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAuth {
    pub pkp_address: Option<String>,
    pub pkp_public_key: Option<String>,
    pub pkp_token_id: Option<String>,
    pub auth_method_type: Option<u32>,
    pub auth_method_id: Option<String>,
    pub access_token: Option<String>,
    #[serde(default)]
    pub eoa_address: Option<String>,
    #[serde(default)]
    pub lit_session_key_pair: Option<SessionKeyPair>,
    #[serde(default)]
    pub lit_delegation_auth_sig: Option<LitAuthSig>,
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
        self.persisted.as_ref()?.pkp_address.as_deref()
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
        "[Auth] {}: pkp_address={:?}, pkp_public_key={}, pkp_token_id={:?}, eoa_address={:?}, auth_method_type={:?}, is_new_user={:?}",
        context,
        result.pkp_address,
        result
            .pkp_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
        result.pkp_token_id,
        result.eoa_address,
        result.auth_method_type,
        result.is_new_user
    );
}

pub fn log_persisted_auth(context: &str, auth: &PersistedAuth) {
    log::debug!(
        "[Auth] {}: pkp_address={:?}, pkp_public_key={}, pkp_token_id={:?}, eoa_address={:?}, auth_method_type={:?}",
        context,
        auth.pkp_address,
        auth.pkp_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
        auth.pkp_token_id,
        auth.eoa_address,
        auth.auth_method_type
    );
}
