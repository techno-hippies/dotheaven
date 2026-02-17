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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthProviderKind {
    TempoPasskey,
    LitLegacy,
    Unknown,
}

impl AuthProviderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TempoPasskey => "tempo-passkey",
            Self::LitLegacy => "lit-legacy",
            Self::Unknown => "unknown",
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct TempoAuthContext {
    pub wallet_address: String,
    pub credential_id: String,
    pub public_key: String,
    pub rp_id: Option<String>,
    pub key_manager_url: Option<String>,
    pub fee_payer_url: Option<String>,
    pub chain_id: Option<u64>,
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
        self.persisted.as_ref()?.primary_wallet_address()
    }
}

impl AuthResult {
    pub fn primary_wallet_address(&self) -> Option<&str> {
        self.wallet_address
            .as_deref()
            .or(self.pkp_address.as_deref())
            .or(self.eoa_address.as_deref())
    }
}

impl PersistedAuth {
    pub fn provider_kind(&self) -> AuthProviderKind {
        provider_kind(self.provider.as_deref())
    }

    pub fn primary_wallet_address(&self) -> Option<&str> {
        self.wallet_address
            .as_deref()
            .or(self.pkp_address.as_deref())
            .or(self.eoa_address.as_deref())
    }

    pub fn has_lit_auth_material(&self) -> bool {
        has_lit_auth_material(
            self.pkp_public_key.is_some(),
            self.pkp_address.is_some(),
            self.lit_session_key_pair.is_some(),
            self.lit_delegation_auth_sig.is_some(),
            self.auth_method_id.is_some(),
            self.auth_method_type.is_some(),
            self.access_token.is_some(),
        )
    }

    pub fn tempo_auth_context(&self) -> Option<TempoAuthContext> {
        Some(TempoAuthContext {
            wallet_address: self.primary_wallet_address()?.to_string(),
            credential_id: self.tempo_credential_id.clone()?,
            public_key: self.tempo_public_key.clone()?,
            rp_id: self.tempo_rp_id.clone(),
            key_manager_url: self.tempo_key_manager_url.clone(),
            fee_payer_url: self.tempo_fee_payer_url.clone(),
            chain_id: self.tempo_chain_id,
        })
    }

    pub fn require_lit_auth(&self, feature: &str) -> Result<(), String> {
        if self.has_lit_auth_material() {
            return Ok(());
        }

        if self.provider_kind() == AuthProviderKind::TempoPasskey {
            let wallet = self.primary_wallet_address().unwrap_or("(unknown wallet)");
            return Err(format!(
                "{feature} currently requires Lit PKP auth. Active provider is tempo-passkey for wallet {wallet}.",
            ));
        }

        Err(format!(
            "{feature} requires Lit auth material (pkpPublicKey/pkpAddress plus delegation auth or authData).",
        ))
    }
}

fn has_lit_auth_material(
    has_pkp_public_key: bool,
    has_pkp_address: bool,
    has_session_key_pair: bool,
    has_delegation_auth_sig: bool,
    has_auth_method_id: bool,
    has_auth_method_type: bool,
    has_access_token: bool,
) -> bool {
    if !has_pkp_public_key || !has_pkp_address {
        return false;
    }
    let has_pre_generated = has_session_key_pair && has_delegation_auth_sig;
    let has_auth_data = has_auth_method_id && has_auth_method_type && has_access_token;
    has_pre_generated || has_auth_data
}

fn provider_kind(provider: Option<&str>) -> AuthProviderKind {
    match provider
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "tempo-passkey" => AuthProviderKind::TempoPasskey,
        "lit-legacy" => AuthProviderKind::LitLegacy,
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
        "[Auth] {}: version={:?}, provider={:?}, wallet_address={:?}, tempo_credential_id={:?}, tempo_public_key={}, pkp_address={:?}, pkp_public_key={}, pkp_token_id={:?}, eoa_address={:?}, auth_method_type={:?}, is_new_user={:?}",
        context,
        result.version,
        result.provider,
        result.primary_wallet_address(),
        result.tempo_credential_id,
        result
            .tempo_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
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
        "[Auth] {}: version={:?}, provider={:?}, wallet_address={:?}, tempo_credential_id={:?}, tempo_public_key={}, pkp_address={:?}, pkp_public_key={}, pkp_token_id={:?}, eoa_address={:?}, auth_method_type={:?}",
        context,
        auth.version,
        auth.provider,
        auth.primary_wallet_address(),
        auth.tempo_credential_id,
        auth.tempo_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
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
