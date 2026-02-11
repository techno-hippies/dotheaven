//! Native Load storage service for GPUI.
//!
//! This replaces legacy sidecar/backend upload paths with direct Rust uploads
//! to Load's Turbo-compatible offchain endpoint.

use std::env;
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
use rand::RngCore;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::auth::PersistedAuth;
use crate::lit_wallet::LitWalletService;

const DEFAULT_SPONSOR_PKP_PUBLIC_KEY: &str =
    "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const DEFAULT_CONTENT_ACCESS_MIRROR: &str = "0x4dD375b09160d09d4C33312406dFFAFb3f8A5035";
const DEFAULT_LIT_CHAIN: &str = "baseSepolia";
const DEFAULT_LOAD_TURBO_UPLOAD_URL: &str = "https://loaded-turbo-api.load.network";
const DEFAULT_LOAD_TURBO_TOKEN: &str = "ethereum";
const DEFAULT_LOAD_GATEWAY_URL: &str = "https://gateway.s3-node-1.load.network";
const DEFAULT_TURBO_FUNDING_PROXY_URL: &str = "http://127.0.0.1:8788";
const DEFAULT_TURBO_FUNDING_TOKEN: &str = "base-eth";
const DEFAULT_BASE_SEPOLIA_RPC_URL: &str = "https://sepolia.base.org";
const BASE_SEPOLIA_CHAIN_ID: u64 = 84532;
const DEFAULT_MIN_UPLOAD_CREDIT: f64 = 0.00000001;
const MAX_UPLOAD_BYTES: usize = 500 * 1024 * 1024;
const ALGO_AES_GCM_256: u8 = 1;

const CONTENT_REGISTER_V2_LOCAL_PATHS: [&str; 2] = [
    "../../lit-actions/features/music/content-register-v2.js",
    "lit-actions/features/music/content-register-v2.js",
];

fn content_register_v1_cid_for_network(network: &str) -> Option<&'static str> {
    match network {
        "naga-dev" => Some("QmcyVkadHqJnFDhkrAPu4UjyPtYBbcLKqfMuYoHJnaQvde"),
        "naga-test" => Some("QmdPHymWEbh4H8zBEhup9vWpCPwR5hTLK2Kb3H8hcjDga1"),
        _ => None,
    }
}

#[derive(Debug, Clone, Default)]
pub struct TrackMetaInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
}

#[derive(Debug, Clone)]
struct LoadHealthResult {
    ok: bool,
    endpoint: String,
    status: Option<u16>,
    reason: Option<String>,
    info: Option<Value>,
}

#[derive(Debug, Clone)]
struct UploadResult {
    id: String,
    gateway_url: String,
    winc: Option<String>,
}

#[derive(Debug, Clone)]
enum ContentRegisterAction {
    Ipfs { id: String, source: String },
    Code { code: String, source: String },
}

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

        let mut balance_display = "n/a".to_string();
        let mut balance_raw = Value::Null;
        let mut storage_info_error = Value::Null;
        let mut credit_ready = true;

        if user_pays {
            match self.fetch_turbo_balance(auth) {
                Ok(balance_payload) => {
                    let parsed = extract_balance_hint(&balance_payload);
                    if let Some(amount) = parsed {
                        balance_display = format!("{amount:.8}");
                    } else {
                        balance_display = "unknown".to_string();
                    }
                    credit_ready = parsed.map(|v| v >= min_upload_credit()).unwrap_or(false);
                    balance_raw = balance_payload;
                }
                Err(err) => {
                    credit_ready = false;
                    storage_info_error = json!(err);
                }
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

    pub fn content_encrypt_upload_register(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        _with_cdn: bool,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let source_bytes = fs::read(file_path)
            .map_err(|e| format!("Failed to read file for upload ({}): {e}", file_path))?;

        let fallback = infer_title_artist_album(file_path);
        let title = track
            .title
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&fallback.0)
            .to_string();
        let artist = track
            .artist
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&fallback.1)
            .to_string();
        let album = track
            .album
            .as_deref()
            .map(str::trim)
            .unwrap_or(&fallback.2)
            .to_string();

        let mbid = track
            .mbid
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let ip_id = track
            .ip_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);

        let owner = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let track_id = build_track_id(&title, &artist, &album, mbid.as_deref(), ip_id.as_deref())?;
        let content_id = compute_content_id(track_id, owner)?;

        let encrypted_blob = self.encrypt_for_upload(&source_bytes, &content_id)?;

        let ready = self.ensure_upload_ready(Some(auth), Some(encrypted_blob.len()));
        if !ready.0 {
            return Err(ready
                .1
                .unwrap_or_else(|| "Load upload endpoint unavailable".to_string()));
        }

        let upload_result = self.upload_to_load(
            auth,
            &encrypted_blob,
            Some(&format!("{file_path}.enc")),
            vec![
                json!({"name": "App-Name", "value": "Heaven Desktop"}),
                json!({"name": "Content-Id", "value": to_hex_prefixed(track_id.as_slice())}),
            ],
        )?;

        let register_response = self.register_content(
            auth,
            to_hex_prefixed(track_id.as_slice()),
            &upload_result.id,
            &title,
            &artist,
            &album,
        )?;

        Ok(json!({
            "trackId": to_hex_prefixed(track_id.as_slice()),
            "ipId": ip_id,
            "contentId": to_hex_prefixed(content_id.as_slice()),
            "pieceCid": upload_result.id,
            "blobSize": encrypted_blob.len(),
            "uploadSize": encrypted_blob.len(),
            "gatewayUrl": upload_result.gateway_url,
            "winc": upload_result.winc,
            "registerVersion": register_response.get("version").cloned().unwrap_or(Value::Null),
            "txHash": register_response.get("txHash").cloned().unwrap_or(Value::Null),
            "blockNumber": register_response.get("blockNumber").cloned().unwrap_or(Value::Null),
        }))
    }

    fn register_content(
        &mut self,
        auth: &PersistedAuth,
        track_id_hex: String,
        piece_cid: &str,
        title: &str,
        artist: &str,
        album: &str,
    ) -> Result<Value, String> {
        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );
        let piece_cid_hash = sha256_hex(&bytes_from_piece_cid(piece_cid)?);
        let register_message = format!(
            "heaven:content:register:{track_id_hex}:{piece_cid_hash}:{}:{ALGO_AES_GCM_256}:{timestamp}:{nonce}",
            user_address.to_lowercase()
        );

        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&register_message)
            .map_err(|e| format!("Failed to sign content register message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content registration",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = get_content_register_action(&network)?;

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "trackId": track_id_hex,
            "pieceCid": piece_cid,
            "datasetOwner": user_address,
            "signature": signature_hex,
            "algo": ALGO_AES_GCM_256,
            "title": title,
            "artist": artist,
            "album": album,
            "timestamp": timestamp,
            "nonce": nonce,
        });

        let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) =
            match action {
                ContentRegisterAction::Ipfs { id, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        None,
                        Some(id),
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source)),
                ContentRegisterAction::Code { code, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        Some(code),
                        None,
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source)),
            }
            .map_err(|e| format!("Content registration executeJs failed: {e}"))?;

        let mut payload = normalize_execute_response(execute_result.response)?;
        if let Value::Object(obj) = &mut payload {
            obj.entry("actionSource".to_string())
                .or_insert(Value::String(action_source.clone()));
        }
        let success = payload
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !success {
            let msg = payload
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            let version = payload
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let content_id = payload
                .get("contentId")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content register failed: {msg} (version={version}, contentId={content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }

    fn encrypt_for_upload(
        &mut self,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to initialize AES key: {e}"))?;
        let encrypted_audio = cipher
            .encrypt(Nonce::from_slice(&iv), source_bytes)
            .map_err(|e| format!("Failed to encrypt audio payload: {e}"))?;

        let key_base64 = base64::engine::general_purpose::STANDARD.encode(key);
        key.fill(0);

        let payload = json!({
            "contentId": to_hex_prefixed(content_id.as_slice()).to_lowercase(),
            "key": key_base64,
        });

        let unified_access_control_conditions = json!([
            {
                "conditionType": "evmContract",
                "contractAddress": content_access_mirror(),
                "chain": lit_chain(),
                "functionName": "canAccess",
                "functionParams": [":userAddress", to_hex_prefixed(content_id.as_slice()).to_lowercase()],
                "functionAbi": {
                    "type": "function",
                    "name": "canAccess",
                    "stateMutability": "view",
                    "inputs": [
                        { "type": "address", "name": "user", "internalType": "address" },
                        { "type": "bytes32", "name": "contentId", "internalType": "bytes32" }
                    ],
                    "outputs": [{ "type": "bool", "name": "", "internalType": "bool" }]
                },
                "returnValueTest": { "key": "", "comparator": "=", "value": "true" }
            }
        ]);

        let encrypt_response = self
            .lit_mut()?
            .encrypt_with_access_control(
                serde_json::to_vec(&payload)
                    .map_err(|e| format!("Failed to encode content key payload: {e}"))?,
                unified_access_control_conditions,
            )
            .map_err(|e| format!("Failed to Lit-encrypt content key payload: {e}"))?;

        Ok(build_blob(
            encrypt_response.ciphertext_base64.as_bytes(),
            encrypt_response.data_to_encrypt_hash_hex.as_bytes(),
            &iv,
            &encrypted_audio,
        ))
    }

    fn ensure_upload_ready(
        &mut self,
        auth: Option<&PersistedAuth>,
        size_bytes: Option<usize>,
    ) -> (bool, Option<String>) {
        if let Some(size) = size_bytes {
            if size > MAX_UPLOAD_BYTES {
                return (
                    false,
                    Some(format!(
                        "File exceeds current desktop upload limit ({} bytes)",
                        MAX_UPLOAD_BYTES
                    )),
                );
            }
        }

        let health = self.load_health_check();
        if !health.ok {
            return (false, health.reason);
        }

        if load_user_pays_enabled() {
            let auth = match auth {
                Some(v) => v,
                None => {
                    return (
                        false,
                        Some(
                            "Missing auth context required for Turbo user-pays balance checks"
                                .to_string(),
                        ),
                    );
                }
            };
            match self.fetch_turbo_balance(auth) {
                Ok(balance_payload) => {
                    let parsed = extract_balance_hint(&balance_payload);
                    let min_credit = min_upload_credit();
                    let has_credit = parsed.map(|v| v >= min_credit).unwrap_or(false);
                    if !has_credit {
                        return (
                            false,
                            Some(format!(
                                "Turbo credit is below minimum ({min_credit:.8}). Use Add Funds to submit a Base Sepolia PKP payment first."
                            )),
                        );
                    }
                }
                Err(err) => {
                    return (
                        false,
                        Some(format!("Turbo balance check failed before upload: {err}")),
                    );
                }
            }
        }

        (true, None)
    }

    fn run_turbo_user_pays_funding(
        &mut self,
        auth: &PersistedAuth,
        amount_hint: &str,
    ) -> Result<Value, String> {
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;
        let token = turbo_funding_token();
        if token != "base-eth" {
            return Err(format!(
                "Unsupported HEAVEN_TURBO_FUNDING_TOKEN={token}. Current GPUI user-pays implementation supports only base-eth (native Base Sepolia transfer)."
            ));
        }
        let amount_hint = amount_hint.trim();
        if amount_hint.is_empty() {
            return Err("Missing funding amount (ETH) for Base Sepolia transfer".to_string());
        }

        let proxy_url = turbo_funding_proxy_url();
        let wallets_url = format!("{proxy_url}/turbo/wallets");
        let wallets_payload = http_get_json(&wallets_url)?;
        let deposit_address =
            extract_turbo_deposit_address(&wallets_payload, &token).ok_or_else(|| {
                format!(
                    "Unable to resolve Turbo deposit address for token={token} from /turbo/wallets response"
                )
            })?;

        let tx_result = self.lit_mut()?.pkp_send_native_transaction(
            &base_sepolia_rpc_url(),
            BASE_SEPOLIA_CHAIN_ID,
            &deposit_address,
            amount_hint,
            true,
        )?;
        let tx_hash = tx_result
            .get("txHash")
            .and_then(Value::as_str)
            .ok_or("PKP send transaction response missing txHash")?
            .to_string();

        let submit_url = format!("{proxy_url}/turbo/submit-fund");
        let submit_input = json!({
            "token": token,
            "txId": tx_hash,
            "userAddress": user_address,
        });

        let mut submit_payload = None;
        let mut submit_last_err = None;
        for attempt in 1..=5 {
            match http_post_json(&submit_url, submit_input.clone()) {
                Ok(payload) => {
                    submit_payload = Some(payload);
                    break;
                }
                Err(err) => {
                    submit_last_err = Some(err);
                    if attempt < 5 {
                        std::thread::sleep(Duration::from_secs(3));
                    }
                }
            }
        }
        let submit_payload = submit_payload.ok_or_else(|| {
            format!(
                "submit-fund failed after retries: {}",
                submit_last_err.unwrap_or_else(|| "unknown error".to_string())
            )
        })?;

        let balance_payload = self.fetch_turbo_balance(auth)?;
        let balance_hint = extract_balance_hint(&balance_payload);

        Ok(json!({
            "ok": true,
            "txHash": tx_result.get("txHash").cloned().unwrap_or(Value::Null),
            "blockNumber": tx_result.get("blockNumber").cloned().unwrap_or(Value::Null),
            "txStatus": tx_result.get("status").cloned().unwrap_or(Value::Null),
            "gasUsed": tx_result.get("gasUsed").cloned().unwrap_or(Value::Null),
            "message": "Base Sepolia PKP funding submitted and Turbo credit refresh attempted.",
            "uploadMode": load_upload_mode_label(),
            "uploadToken": load_turbo_upload_token(),
            "amountHint": amount_hint,
            "fundingToken": token,
            "depositAddress": deposit_address,
            "submitFund": submit_payload,
            "balanceRaw": balance_payload,
            "balanceHint": balance_hint,
            "turboFundingEnabled": true,
            "turboFundingProxyUrl": proxy_url,
            "baseSepoliaRpcUrl": base_sepolia_rpc_url(),
        }))
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

    fn upload_to_load(
        &mut self,
        auth: &PersistedAuth,
        payload: &[u8],
        file_path: Option<&str>,
        tags: Vec<Value>,
    ) -> Result<UploadResult, String> {
        let signed_dataitem = self.build_signed_dataitem(auth, payload, file_path, &tags)?;
        upload_signed_dataitem(&signed_dataitem)
    }

    fn build_signed_dataitem(
        &mut self,
        auth: &PersistedAuth,
        payload: &[u8],
        file_path: Option<&str>,
        tags: &[Value],
    ) -> Result<Vec<u8>, String> {
        let mut ans_tags = convert_tags(tags);
        if !ans_tags
            .iter()
            .any(|tag| tag.name.eq_ignore_ascii_case("Content-Type"))
        {
            ans_tags.insert(0, Tag::new("Content-Type", infer_content_type(file_path)));
        }

        let owner = parse_pkp_public_key(auth)?;

        let mut item = DataItem::new(None, None, ans_tags, payload.to_vec())
            .map_err(|e| format!("Failed to build dataitem payload: {e}"))?;
        item.signature_type = SignatureType::Ethereum;
        item.owner = owner;

        let signing_message = item.signing_message();
        let signature = self
            .lit_mut()?
            .pkp_sign_ethereum_message(&signing_message)
            .map_err(|e| format!("Failed to PKP-sign dataitem: {e}"))?;

        if signature.len() != 65 {
            return Err(format!(
                "PKP returned invalid signature length for dataitem: {}",
                signature.len()
            ));
        }

        item.signature = signature;
        item.to_bytes()
            .map_err(|e| format!("Failed to encode signed dataitem bytes: {e}"))
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

fn convert_tags(tags: &[Value]) -> Vec<Tag> {
    let mut out = Vec::new();
    for tag in tags {
        let name = tag
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");
        let value = tag
            .get("value")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");
        if name.is_empty() || value.is_empty() {
            continue;
        }
        out.push(Tag::new(name, value));
    }
    out
}

fn parse_pkp_public_key(auth: &PersistedAuth) -> Result<Vec<u8>, String> {
    let raw = auth
        .pkp_public_key
        .as_deref()
        .ok_or("Missing PKP public key in auth")?
        .trim();
    let raw = raw.strip_prefix("0x").unwrap_or(raw);

    let mut decoded =
        hex::decode(raw).map_err(|e| format!("Invalid PKP public key hex in auth: {e}"))?;
    if decoded.len() == 64 {
        decoded.insert(0, 0x04);
    }
    if decoded.len() != 65 {
        return Err(format!(
            "Invalid PKP public key length: expected 64 or 65 bytes, got {}",
            decoded.len()
        ));
    }
    if decoded[0] != 0x04 {
        return Err("PKP public key must be uncompressed secp256k1 (0x04 prefix)".to_string());
    }
    Ok(decoded)
}

fn upload_signed_dataitem(signed_dataitem: &[u8]) -> Result<UploadResult, String> {
    let token = load_turbo_upload_token();
    let endpoint = format!("{}/v1/tx/{}", load_turbo_upload_url(), token);

    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .send(signed_dataitem)
        .map_err(|e| format!("Load upload request failed: {e}"))?;

    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        let message = body
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Load upload failed with status {status}"));
        return Err(format!("{message}; endpoint={endpoint}"));
    }

    let id = extract_upload_id(&body).ok_or("Upload succeeded but no dataitem id was returned")?;
    let gateway_base = extract_gateway_base(&body).unwrap_or_else(load_gateway_url);

    Ok(UploadResult {
        id: id.clone(),
        gateway_url: format!("{}/resolve/{}", gateway_base.trim_end_matches('/'), id),
        winc: body.get("winc").and_then(Value::as_str).map(str::to_string),
    })
}

fn extract_gateway_base(payload: &Value) -> Option<String> {
    let direct = payload
        .get("dataCaches")
        .or_else(|| payload.get("data_caches"))
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);

    if direct.is_some() {
        return direct;
    }

    payload
        .get("gateway")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

fn build_blob(
    lit_ciphertext_bytes: &[u8],
    data_to_encrypt_hash_bytes: &[u8],
    iv: &[u8; 12],
    encrypted_audio: &[u8],
) -> Vec<u8> {
    let header_size = 4
        + lit_ciphertext_bytes.len()
        + 4
        + data_to_encrypt_hash_bytes.len()
        + 1
        + 1
        + iv.len()
        + 4;

    let mut out = Vec::with_capacity(header_size + encrypted_audio.len());
    out.extend_from_slice(&(lit_ciphertext_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(lit_ciphertext_bytes);

    out.extend_from_slice(&(data_to_encrypt_hash_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(data_to_encrypt_hash_bytes);

    out.push(ALGO_AES_GCM_256);
    out.push(iv.len() as u8);
    out.extend_from_slice(iv);

    out.extend_from_slice(&(encrypted_audio.len() as u32).to_be_bytes());
    out.extend_from_slice(encrypted_audio);
    out
}

fn normalize_execute_response(raw: Value) -> Result<Value, String> {
    match raw {
        Value::String(s) => serde_json::from_str::<Value>(&s)
            .map_err(|e| format!("Failed to parse content register response JSON: {e}")),
        Value::Object(_) => Ok(raw),
        other => Err(format!(
            "Unexpected content register response type: {other}"
        )),
    }
}

fn get_content_register_action(network: &str) -> Result<ContentRegisterAction, String> {
    // Prefer local/explicit code for faster iteration and deterministic diagnostics.

    if let Ok(code_path_raw) = env::var("HEAVEN_CONTENT_REGISTER_V2_CODE_PATH") {
        let code_path = code_path_raw.trim();
        if !code_path.is_empty() {
            let code = fs::read_to_string(code_path).map_err(|e| {
                format!("Failed reading HEAVEN_CONTENT_REGISTER_V2_CODE_PATH ({code_path}): {e}")
            })?;
            if !code.trim().is_empty() {
                return Ok(ContentRegisterAction::Code {
                    code,
                    source: format!("env:HEAVEN_CONTENT_REGISTER_V2_CODE_PATH:{code_path}"),
                });
            }
        }
    }

    for rel in CONTENT_REGISTER_V2_LOCAL_PATHS {
        let path = PathBuf::from(rel);
        if let Ok(code) = fs::read_to_string(&path) {
            if !code.trim().is_empty() {
                return Ok(ContentRegisterAction::Code {
                    code,
                    source: format!("local:{rel}"),
                });
            }
        }
    }

    // V2 map intentionally empty for now, keep for future parity with JS flow.
    if let Ok(v) = env::var("HEAVEN_CONTENT_REGISTER_V2_CID") {
        let cid = v.trim();
        if !cid.is_empty() {
            return Ok(ContentRegisterAction::Ipfs {
                id: cid.to_string(),
                source: "env:HEAVEN_CONTENT_REGISTER_V2_CID".to_string(),
            });
        }
    }

    if let Ok(v) = env::var("HEAVEN_CONTENT_REGISTER_V1_CID") {
        let cid = v.trim();
        if !cid.is_empty() {
            return Ok(ContentRegisterAction::Ipfs {
                id: cid.to_string(),
                source: "env:HEAVEN_CONTENT_REGISTER_V1_CID".to_string(),
            });
        }
    }

    if let Some(mapped) = content_register_v1_cid_for_network(network) {
        return Ok(ContentRegisterAction::Ipfs {
            id: mapped.to_string(),
            source: format!("network-map:{network}"),
        });
    }

    Err(format!(
        "Missing content-register action: set HEAVEN_CONTENT_REGISTER_V2_CID, HEAVEN_CONTENT_REGISTER_V2_CODE_PATH, or HEAVEN_CONTENT_REGISTER_V1_CID (network={network})"
    ))
}

fn require_sponsor_private_key() -> Result<String, String> {
    if let Ok(v) = env::var("HEAVEN_SPONSOR_PRIVATE_KEY") {
        let t = v.trim();
        if !t.is_empty() {
            return Ok(ensure_0x_prefixed(t));
        }
    }
    if let Ok(v) = env::var("PRIVATE_KEY") {
        let t = v.trim();
        if !t.is_empty() {
            return Ok(ensure_0x_prefixed(t));
        }
    }

    for path in ["../../lit-actions/.env", "../.env", ".env"] {
        if let Ok(contents) = fs::read_to_string(path) {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || !trimmed.starts_with("PRIVATE_KEY=") {
                    continue;
                }
                let raw = trimmed.trim_start_matches("PRIVATE_KEY=").trim();
                if !raw.is_empty() {
                    return Ok(ensure_0x_prefixed(raw));
                }
            }
        }
    }

    Err("Missing sponsor private key: set HEAVEN_SPONSOR_PRIVATE_KEY or PRIVATE_KEY".to_string())
}

fn sponsor_pkp_public_key_hex() -> String {
    let raw = env::var("HEAVEN_SPONSOR_PKP_PUBLIC_KEY")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SPONSOR_PKP_PUBLIC_KEY.to_string());
    ensure_0x_prefixed(&raw)
}

fn ensure_0x_prefixed(value: &str) -> String {
    if value.starts_with("0x") {
        value.to_string()
    } else {
        format!("0x{value}")
    }
}

fn content_access_mirror() -> String {
    env::var("HEAVEN_CONTENT_ACCESS_MIRROR")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CONTENT_ACCESS_MIRROR.to_string())
}

fn lit_chain() -> String {
    env::var("HEAVEN_LIT_CHAIN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LIT_CHAIN.to_string())
}

fn load_turbo_upload_url() -> String {
    env::var("HEAVEN_LOAD_TURBO_UPLOAD_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_TURBO_UPLOAD_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn load_turbo_upload_token() -> String {
    env::var("HEAVEN_LOAD_TURBO_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_TURBO_TOKEN.to_string())
        .to_lowercase()
}

fn load_gateway_url() -> String {
    env::var("HEAVEN_LOAD_GATEWAY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_GATEWAY_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn load_user_pays_enabled() -> bool {
    env::var("HEAVEN_LOAD_USER_PAYS_ENABLED")
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
}

fn load_upload_mode_label() -> &'static str {
    if load_user_pays_enabled() {
        "turbo-user-pays"
    } else {
        "offchain"
    }
}

fn turbo_funding_proxy_url() -> String {
    env::var("HEAVEN_TURBO_FUNDING_PROXY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TURBO_FUNDING_PROXY_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn turbo_funding_token() -> String {
    env::var("HEAVEN_TURBO_FUNDING_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TURBO_FUNDING_TOKEN.to_string())
        .to_ascii_lowercase()
}

fn base_sepolia_rpc_url() -> String {
    env::var("HEAVEN_BASE_SEPOLIA_RPC_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_SEPOLIA_RPC_URL.to_string())
}

fn min_upload_credit() -> f64 {
    env::var("HEAVEN_LOAD_MIN_UPLOAD_CREDIT")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 0.0)
        .unwrap_or(DEFAULT_MIN_UPLOAD_CREDIT)
}

fn http_get_json(url: &str) -> Result<Value, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut resp = request
        .call()
        .map_err(|e| format!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);
    if status >= 400 {
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }
    Ok(body)
}

fn http_post_json(url: &str, payload: Value) -> Result<Value, String> {
    let request = ureq::post(url)
        .header("Content-Type", "application/json")
        .config()
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .send_json(payload)
        .map_err(|e| format!("HTTP POST failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);
    if status >= 400 {
        return Err(format!("HTTP POST {url} failed ({status}): {body}"));
    }
    Ok(body)
}

fn extract_turbo_deposit_address(payload: &Value, token: &str) -> Option<String> {
    let token = token.to_ascii_lowercase();
    let mut candidates = Vec::<(Option<String>, String)>::new();
    collect_wallet_candidates(payload, &mut candidates);
    if candidates.is_empty() {
        return None;
    }

    for (candidate_token, candidate_address) in &candidates {
        if let Some(t) = candidate_token {
            if t == &token {
                return Some(candidate_address.clone());
            }
        }
    }

    for (candidate_token, candidate_address) in &candidates {
        if let Some(t) = candidate_token {
            if token_match_loose(t, &token) {
                return Some(candidate_address.clone());
            }
        }
    }

    if candidates.len() == 1 {
        return Some(candidates[0].1.clone());
    }

    None
}

fn collect_wallet_candidates(value: &Value, out: &mut Vec<(Option<String>, String)>) {
    match value {
        Value::Object(map) => {
            let token_key = map
                .get("token")
                .or_else(|| map.get("symbol"))
                .or_else(|| map.get("ticker"))
                .or_else(|| map.get("network"))
                .or_else(|| map.get("chain"))
                .and_then(Value::as_str)
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty());

            let maybe_address = map
                .get("address")
                .or_else(|| map.get("walletAddress"))
                .or_else(|| map.get("depositAddress"))
                .or_else(|| map.get("wallet"))
                .or_else(|| map.get("to"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            if let Some(addr) = maybe_address {
                if addr.parse::<Address>().is_ok() {
                    out.push((token_key.clone(), addr));
                }
            }

            for nested in map.values() {
                collect_wallet_candidates(nested, out);
            }
        }
        Value::Array(arr) => {
            for item in arr {
                collect_wallet_candidates(item, out);
            }
        }
        _ => {}
    }
}

fn token_match_loose(candidate: &str, wanted: &str) -> bool {
    if candidate == wanted {
        return true;
    }
    let normalize = |v: &str| {
        v.to_ascii_lowercase()
            .replace('_', "-")
            .replace("ethereum", "eth")
    };
    let c = normalize(candidate);
    let w = normalize(wanted);
    c == w || c.contains(&w) || w.contains(&c)
}

fn extract_balance_hint(value: &Value) -> Option<f64> {
    let mut out = Vec::<f64>::new();
    collect_balance_candidates(value, &mut out);
    out.into_iter()
        .filter(|v| v.is_finite() && *v >= 0.0)
        .fold(None, |acc, v| Some(acc.map(|x| x.max(v)).unwrap_or(v)))
}

fn collect_balance_candidates(value: &Value, out: &mut Vec<f64>) {
    match value {
        Value::Number(n) => {
            if let Some(v) = n.as_f64() {
                out.push(v);
            }
        }
        Value::String(s) => {
            if let Ok(v) = s.trim().parse::<f64>() {
                out.push(v);
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                let key = k.to_ascii_lowercase();
                if key.contains("balance")
                    || key.contains("credit")
                    || key.contains("winc")
                    || key.contains("amount")
                {
                    collect_balance_candidates(v, out);
                    continue;
                }
                collect_balance_candidates(v, out);
            }
        }
        Value::Array(arr) => {
            for item in arr {
                collect_balance_candidates(item, out);
            }
        }
        _ => {}
    }
}

fn check_health() -> LoadHealthResult {
    let endpoint = format!("{}/health", load_turbo_upload_url());
    let request = ureq::get(&endpoint)
        .config()
        .http_status_as_error(false)
        .build();

    match request.call() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = (200..300).contains(&status);
            let info = if ok {
                fetch_info().ok().flatten()
            } else {
                None
            };
            LoadHealthResult {
                ok,
                endpoint,
                status: Some(status),
                reason: if ok {
                    None
                } else {
                    Some(format!("Health check failed: HTTP {status}"))
                },
                info,
            }
        }
        Err(err) => LoadHealthResult {
            ok: false,
            endpoint,
            status: None,
            reason: Some(err.to_string()),
            info: None,
        },
    }
}

fn fetch_info() -> Result<Option<Value>, String> {
    let endpoint = format!("{}/info", load_turbo_upload_url());
    let request = ureq::get(&endpoint)
        .config()
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .call()
        .map_err(|e| format!("Load info request failed: {e}"))?;
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        return Ok(None);
    }

    let body = read_json_or_text(&mut resp);
    if body.is_object() {
        Ok(Some(body))
    } else {
        Ok(None)
    }
}

fn infer_content_type(file_path: Option<&str>) -> &'static str {
    let lower = file_path.unwrap_or_default().to_ascii_lowercase();
    if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".m4a") {
        "audio/mp4"
    } else if lower.ends_with(".aac") {
        "audio/aac"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".ogg") || lower.ends_with(".opus") {
        "audio/ogg"
    } else {
        "application/octet-stream"
    }
}

fn read_json_or_text(resp: &mut ureq::http::Response<ureq::Body>) -> Value {
    let text = resp
        .body_mut()
        .read_to_string()
        .unwrap_or_else(|_| String::new());
    serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "raw": text }))
}

fn extract_upload_id(payload: &Value) -> Option<String> {
    let direct_keys = ["id", "dataitem_id", "dataitemId"];
    for key in direct_keys {
        if let Some(id) = payload.get(key).and_then(Value::as_str) {
            if !id.trim().is_empty() {
                return Some(id.trim().to_string());
            }
        }
    }

    if let Some(result) = payload.get("result") {
        for key in direct_keys {
            if let Some(id) = result.get(key).and_then(Value::as_str) {
                if !id.trim().is_empty() {
                    return Some(id.trim().to_string());
                }
            }
        }
    }

    None
}

fn infer_title_artist_album(file_path: &str) -> (String, String, String) {
    let base = Path::new(file_path)
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("Unknown Track");
    let stem = base.rsplit_once('.').map(|(s, _)| s).unwrap_or(base).trim();

    let parts: Vec<&str> = stem.split(" - ").collect();
    if parts.len() >= 2 {
        let artist = parts[0].trim();
        let title = parts[1..].join(" - ").trim().to_string();
        if !artist.is_empty() && !title.is_empty() {
            return (title, artist.to_string(), String::new());
        }
    }

    (
        if stem.is_empty() {
            "Unknown Track".to_string()
        } else {
            stem.to_string()
        },
        "Unknown Artist".to_string(),
        String::new(),
    )
}

fn normalize_string(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_track_id(
    title: &str,
    artist: &str,
    album: &str,
    mbid: Option<&str>,
    ip_id: Option<&str>,
) -> Result<B256, String> {
    let (kind, payload) = if let Some(mbid) = mbid {
        let cleaned = mbid.replace('-', "");
        let raw = hex::decode(cleaned).map_err(|e| format!("Invalid MBID hex: {e}"))?;
        if raw.len() != 16 {
            return Err(format!(
                "Invalid MBID length: expected 16 bytes, got {}",
                raw.len()
            ));
        }
        let mut payload = [0u8; 32];
        payload[..16].copy_from_slice(&raw);
        (1u8, B256::from(payload))
    } else if let Some(ip_id) = ip_id {
        let normalized = if ip_id.starts_with("0x") {
            ip_id.to_string()
        } else {
            format!("0x{ip_id}")
        };
        let addr = normalized
            .parse::<Address>()
            .map_err(|e| format!("Invalid ipId address: {e}"))?;
        let mut payload = [0u8; 32];
        payload[12..].copy_from_slice(addr.as_slice());
        (2u8, B256::from(payload))
    } else {
        let payload = keccak256(
            (
                normalize_string(title),
                normalize_string(artist),
                normalize_string(album),
            )
                .abi_encode(),
        );
        (3u8, payload)
    };

    let mut kind_word = [0u8; 32];
    kind_word[31] = kind;
    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(&kind_word);
    buf.extend_from_slice(payload.as_slice());
    Ok(keccak256(buf))
}

fn compute_content_id(track_id: B256, owner: &str) -> Result<B256, String> {
    let owner = owner
        .parse::<Address>()
        .map_err(|e| format!("Invalid owner address: {e}"))?;

    let mut owner_word = [0u8; 32];
    owner_word[12..].copy_from_slice(owner.as_slice());

    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(track_id.as_slice());
    buf.extend_from_slice(&owner_word);
    Ok(keccak256(buf))
}

fn bytes_from_piece_cid(value: &str) -> Result<Vec<u8>, String> {
    if value.starts_with("0x") {
        return hex::decode(value.trim_start_matches("0x"))
            .map_err(|e| format!("Invalid hex pieceCid: {e}"));
    }
    Ok(value.as_bytes().to_vec())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let out = hasher.finalize();
    hex::encode(out)
}

fn to_hex_prefixed(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn lit_network_name() -> String {
    env::var("HEAVEN_LIT_NETWORK")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var("LIT_NETWORK").ok())
        .unwrap_or_else(|| "naga-dev".to_string())
}
