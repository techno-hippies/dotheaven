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
use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use ethers::abi::{decode as abi_decode, ParamType, Token};
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::auth::PersistedAuth;
use crate::shared::rpc::{http_get_bytes, http_post_json, read_json_or_text};
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
    _private: (),
}

impl Default for LoadStorageService {
    fn default() -> Self {
        Self::new()
    }
}

impl LoadStorageService {
    pub fn new() -> Self {
        Self { _private: () }
    }

    pub fn health(&mut self) -> Result<Value, String> {
        Ok(json!({
            "ok": true,
            "component": "load-native",
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
        _auth: &PersistedAuth,
        amount_hint: &str,
    ) -> Result<Value, String> {
        if !load_user_pays_enabled() {
            return Ok(json!({
                "ok": true,
                "txHash": Value::Null,
                "message": "Offchain Load upload mode has no in-app deposit step.",
                "uploadMode": load_upload_mode_label(),
                "uploadToken": load_turbo_upload_token(),
                "amountHint": amount_hint,
                "turboFundingEnabled": false,
            }));
        }
        Err("Turbo user-pays funding is not yet available for Tempo sessions.".to_string())
    }

    fn fetch_turbo_balance(&self, auth: &PersistedAuth) -> Result<Value, String> {
        let user_address = auth
            .wallet_address()
            .ok_or("Missing wallet address in auth")?;
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
}
