//! Native Load storage service for GPUI.
//!
//! This replaces legacy sidecar/backend upload paths with direct Rust uploads
//! to Load's Turbo-compatible offchain endpoint.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use alloy_primitives::{keccak256, Address, B256};
use alloy_sol_types::SolValue;
use base64::Engine;
use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use ethers::abi::{decode as abi_decode, ParamType, Token};
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::auth::PersistedAuth;
use crate::lit_action_registry::{self as registry, ResolvedAction};
use crate::lit_wallet::LitWalletService;
use crate::shared::rpc::{
    http_get_bytes, http_get_bytes_range, http_get_json, http_post_json, read_json_or_text,
};
mod config;
mod content;
mod decrypt;
mod helpers;
mod model;
mod playlist;
mod upload;
use config::*;
use helpers::*;
use model::{ContentRegistryEntry, LoadHealthResult, ParsedContentBlob, UploadResult};
pub use model::{PlaylistCoverImageInput, PlaylistTrackInput, TrackMetaInput};

pub struct LoadStorageService {
    lit: Option<LitWalletService>,
    init_error: Option<String>,
}

impl Default for LoadStorageService {
    fn default() -> Self {
        Self::new()
    }
}

impl LoadStorageService {
    pub fn new() -> Self {
        match LitWalletService::new() {
            Ok(lit) => Self {
                lit: Some(lit),
                init_error: None,
            },
            Err(err) => Self {
                lit: None,
                init_error: Some(err),
            },
        }
    }

    pub fn health(&mut self) -> Result<Value, String> {
        if let Some(err) = &self.init_error {
            return Err(format!("Lit runtime unavailable: {err}"));
        }

        Ok(json!({
            "ok": true,
            "component": "load-native",
            "litNetwork": lit_network_name(),
            "loadUploadMode": load_upload_mode_label(),
            "loadUploadUrl": load_turbo_upload_url(),
            "loadUploadToken": load_turbo_upload_token(),
            "loadGatewayUrl": load_gateway_url(),
            "turboFundingEnabled": load_user_pays_enabled(),
            "turboFundingProxyUrl": turbo_funding_proxy_url(),
            "turboFundingToken": turbo_funding_token(),
            "baseSepoliaRpcUrl": base_sepolia_rpc_url(),
            "usesBun": false,
        }))
    }

    pub fn storage_status(&mut self, auth: &PersistedAuth) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;
        let user_pays = load_user_pays_enabled();
        let health = self.load_health_check();
        let free_limit = health
            .info
            .as_ref()
            .and_then(|v| v.get("freeUploadLimitBytes"))
            .and_then(Value::as_u64);
        let upload_mode = load_upload_mode_label();

        let mut balance_display = "0".to_string();
        let mut balance_raw = Value::Null;
        let mut storage_info_error = Value::Null;
        let mut credit_ready = true;

        match self.fetch_turbo_balance(auth) {
            Ok(balance_payload) => {
                let parsed = extract_balance_hint(&balance_payload);
                if let Some(amount) = parsed {
                    balance_display = format!("{amount:.8}");
                }
                if user_pays {
                    credit_ready = parsed.map(|v| v >= min_upload_credit()).unwrap_or(false);
                }
                balance_raw = balance_payload;
            }
            Err(err) => {
                if user_pays {
                    credit_ready = false;
                }
                storage_info_error = json!(err);
            }
        }

        let account_info_error = if health.ok {
            None
        } else {
            Some(
                health
                    .reason
                    .clone()
                    .unwrap_or_else(|| "Load health check failed".to_string()),
            )
        };

        Ok(json!({
            "balance": balance_display,
            "balanceRaw": balance_raw,
            "operatorApproved": health.ok,
            "monthlyCost": "n/a",
            "daysRemaining": Value::Null,
            "ready": health.ok && credit_ready,
            "accountInfoError": account_info_error,
            "storageInfoError": storage_info_error,
            "uploadMode": upload_mode,
            "endpoint": health.endpoint,
            "status": health.status,
            "gatewayUrl": load_gateway_url(),
            "loadUploadToken": load_turbo_upload_token(),
            "turboFundingEnabled": user_pays,
            "turboFundingProxyUrl": turbo_funding_proxy_url(),
            "turboFundingToken": turbo_funding_token(),
            "freeUploadLimitBytes": free_limit,
            "fallbackUsed": false,
        }))
    }

    pub fn storage_preflight(
        &mut self,
        auth: &PersistedAuth,
        size_bytes: u64,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;
        let ready = self.ensure_upload_ready(Some(auth), Some(size_bytes as usize));
        Ok(json!({
            "ready": ready.0,
            "reason": ready.1,
            "suggestedDeposit": Value::Null,
            "uploadMode": load_upload_mode_label(),
            "uploadToken": load_turbo_upload_token(),
            "turboFundingEnabled": load_user_pays_enabled(),
        }))
    }

    pub fn storage_deposit_and_approve(
        &mut self,
        auth: &PersistedAuth,
        amount_hint: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;
        if !load_user_pays_enabled() {
            return Ok(json!({
                "ok": true,
                "txHash": Value::Null,
                "message": "Offchain Load upload mode has no in-app deposit step. Set HEAVEN_LOAD_USER_PAYS_ENABLED=true to run Base Sepolia PKP funding.",
                "uploadMode": load_upload_mode_label(),
                "uploadToken": load_turbo_upload_token(),
                "amountHint": amount_hint,
                "turboFundingEnabled": false,
            }));
        }

        self.run_turbo_user_pays_funding(auth, amount_hint)
    }

    fn fetch_turbo_balance(&self, auth: &PersistedAuth) -> Result<Value, String> {
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;
        let proxy_url = turbo_funding_proxy_url();
        let balance_url = format!("{proxy_url}/turbo/balance");
        http_post_json(
            &balance_url,
            json!({
                "token": turbo_funding_token(),
                "userAddress": user_address,
            }),
        )
    }

    fn load_health_check(&self) -> LoadHealthResult {
        check_health()
    }

    fn ensure_lit_ready(&mut self, auth: &PersistedAuth) -> Result<(), String> {
        if let Some(err) = &self.init_error {
            return Err(format!("Lit runtime unavailable: {err}"));
        }
        self.lit_mut()?.initialize_from_auth(auth)?;
        Ok(())
    }

    fn lit_mut(&mut self) -> Result<&mut LitWalletService, String> {
        self.lit.as_mut().ok_or_else(|| {
            self.init_error
                .clone()
                .unwrap_or_else(|| "Lit runtime unavailable".to_string())
        })
    }
}
