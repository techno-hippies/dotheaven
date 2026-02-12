//! Native Load storage service for GPUI.
//!
//! This replaces legacy sidecar/backend upload paths with direct Rust uploads
//! to Load's Turbo-compatible offchain endpoint.

use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::Read;
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
use crate::lit_wallet::LitWalletService;

const DEFAULT_SPONSOR_PKP_PUBLIC_KEY: &str =
    "04fb425233a6b6c7628c42570d074d53fc7b4211464c9fc05f84a0f15f7d10cc2b149a2fca26f69539310b0ee129577b9d368015f207ce8719e5ef9040e340a0a5";
const DEFAULT_CONTENT_ACCESS_MIRROR: &str = "0x4dD375b09160d09d4C33312406dFFAFb3f8A5035";
const DEFAULT_CONTENT_REGISTRY: &str = "0x9ca08C2D2170A43ecfA12AB35e06F2E1cEEB4Ef2";
const DEFAULT_LIT_CHAIN: &str = "baseSepolia";
const DEFAULT_LOAD_TURBO_UPLOAD_URL: &str = "https://loaded-turbo-api.load.network";
const DEFAULT_LOAD_TURBO_TOKEN: &str = "ethereum";
const DEFAULT_LOAD_GATEWAY_URL: &str = "https://gateway.s3-node-1.load.network";
const DEFAULT_TURBO_FUNDING_PROXY_URL: &str = "http://127.0.0.1:8788";
const DEFAULT_TURBO_FUNDING_TOKEN: &str = "base-eth";
const DEFAULT_BASE_SEPOLIA_RPC_URL: &str = "https://sepolia.base.org";
const DEFAULT_MEGAETH_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_PLAYLIST_V1: &str = "0xF0337C4A335cbB3B31c981945d3bE5B914F7B329";
const DEFAULT_SCROBBLE_V4: &str = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1";
const DEFAULT_SUBGRAPH_ACTIVITY: &str =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn";
const DEFAULT_SUBGRAPH_PLAYLISTS: &str =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-playlists/1.0.0/gn";
const BASE_SEPOLIA_CHAIN_ID: u64 = 84532;
const DEFAULT_MIN_UPLOAD_CREDIT: f64 = 0.00000001;
const MAX_UPLOAD_BYTES: usize = 500 * 1024 * 1024;
const ALGO_AES_GCM_256: u8 = 1;
const FILEBASE_COVERS_ENCRYPTED_CIPHERTEXT: &str = "kmcO4LYNJN2N7qNXh3hlNeKJJRsyan3GH35TRzbkGAMZ6ohbujG+QenMouzYam4ByOsrPW0R+FLG/tBQ2jEv0gvsuIgbJA0NJgGkeK5TAD6GAcbBWuR9DndB61X8QyNdhrRvwiLE2jAmgmqRHSu0P4ozXj4hRUjmDMsr7RS/yvtT0/CaJG9rODkDPA2UJpCFNLfx47k7ghqPNztx8rE0xY7kOTTYPF4A3dO5zZfmLkd+horBfentydzBIGI+qHlx8O+OwZzR40SvWUD7XoV8VCo3Ckf28pWQAg==";
const FILEBASE_COVERS_ENCRYPTED_HASH: &str =
    "1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f";

// ---------------------------------------------------------------------------
// Canonical CID map — mirrors lit-actions/cids/dev.json and test.json.
// CID-based execution is the default; inline local code is only used when
// HEAVEN_FORCE_LOCAL_ACTIONS=1 is set (for dev iteration with un-deployed JS).
// ---------------------------------------------------------------------------

fn action_cid_for_network(network: &str, action: &str) -> Option<&'static str> {
    match (network, action) {
        // --- naga-dev (from lit-actions/cids/dev.json) ---
        ("naga-dev", "playlistV1") => Some("QmeajAFaBK9uk2YgE2jrxamMB3rhqRioyfLqXsmomyTkc5"),
        ("naga-dev", "contentRegisterV1") => Some("QmVbhvmjcwRPx47K7UuEg8RrxZuTCbYF5DrkYbJaehBbrd"),
        // contentRegisterV2 intentionally omitted — web defaults to v1; uncomment when v2 goes live
        // ("naga-dev", "contentRegisterV2") => Some("Qmf1UMPL2MTjC7JLGPgdtZ7nFj6X13ZDHGP71P1aYLwh8U"),
        ("naga-dev", "contentAccessV1") => Some("QmXhzbZqvfg7b29eY3CzyV9ep4kvL9QxibKDYqBYAiQoDT"),
        ("naga-dev", "contentDecryptV1") => Some("QmUmVkMxC57nAqUmJPZmoBKeBfiZS6ZR8qzYQJvWe4W12w"),
        ("naga-dev", "contentRegisterMegaethV1") => {
            Some("QmRFuAAYCmri8kTCmJupF9AZWhYmvKnhNhVyqr5trRfZhS")
        }

        // --- naga-test (from lit-actions/cids/test.json) ---
        ("naga-test", "playlistV1") => Some("QmUf2jSaquVXJZBaoq5WCjKZKJpW7zVZVWHKuGi68GYZqq"),
        ("naga-test", "contentRegisterV1") => {
            Some("QmdPHymWEbh4H8zBEhup9vWpCPwR5hTLK2Kb3H8hcjDga1")
        }
        ("naga-test", "contentAccessV1") => Some("QmcgN7ed4ePaCfpkzcwxiTG6WkvfgkPmNK26FZW67kbdau"),

        _ => None,
    }
}

/// Local JS paths for dev iteration (only used when HEAVEN_FORCE_LOCAL_ACTIONS=1).
fn local_code_path_for_action(action: &str) -> Option<&'static [&'static str]> {
    const PLAYLIST_V1: [&str; 2] = [
        "../../lit-actions/features/music/playlist-v1.js",
        "lit-actions/features/music/playlist-v1.js",
    ];
    const CONTENT_REGISTER_V2: [&str; 2] = [
        "../../lit-actions/features/music/content-register-v2.js",
        "lit-actions/features/music/content-register-v2.js",
    ];
    const CONTENT_ACCESS_V1: [&str; 2] = [
        "../../lit-actions/features/music/content-access-v1.js",
        "lit-actions/features/music/content-access-v1.js",
    ];
    match action {
        "playlistV1" => Some(&PLAYLIST_V1),
        "contentRegisterV2" => Some(&CONTENT_REGISTER_V2),
        "contentAccessV1" => Some(&CONTENT_ACCESS_V1),
        _ => None,
    }
}

fn force_local_actions() -> bool {
    env::var("HEAVEN_FORCE_LOCAL_ACTIONS")
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
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
pub struct PlaylistCoverImageInput {
    pub base64: String,
    pub content_type: String,
}

#[derive(Debug, Clone)]
pub struct PlaylistTrackInput {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
    pub cover_cid: Option<String>,
    pub cover_image: Option<PlaylistCoverImageInput>,
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

#[derive(Debug, Clone)]
enum ContentAccessAction {
    Ipfs { id: String, source: String },
    Code { code: String, source: String },
}

#[derive(Debug, Clone)]
enum PlaylistAction {
    Ipfs { id: String, source: String },
    Code { code: String, source: String },
}

#[derive(Debug, Clone)]
struct ContentRegistryEntry {
    owner: String,
    piece_cid: String,
    active: bool,
}

#[derive(Debug, Clone)]
struct ParsedContentBlob {
    lit_ciphertext_base64: String,
    data_to_encrypt_hash_hex: String,
    algo: u8,
    iv: Vec<u8>,
    encrypted_audio: Vec<u8>,
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

    pub fn content_grant_access(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        grantee_address: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let grantee = grantee_address
            .parse::<Address>()
            .map_err(|e| format!("Invalid grantee wallet address: {e}"))?;
        let grantee_hex = to_hex_prefixed(grantee.as_slice()).to_lowercase();

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );

        let grant_message = format!(
            "heaven:content:grant:{normalized_content_id}:{}:{timestamp}:{nonce}",
            grantee_hex.to_lowercase()
        );
        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&grant_message)
            .map_err(|e| format!("Failed to sign content access grant message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content access grant",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = get_content_access_action(&network)?;

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "operation": "grant",
            "contentId": normalized_content_id,
            "grantee": grantee_hex,
            "timestamp": timestamp,
            "nonce": nonce,
            "signature": signature_hex,
        });

        let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) =
            match action {
                ContentAccessAction::Ipfs { id, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        None,
                        Some(id),
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source)),
                ContentAccessAction::Code { code, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        Some(code),
                        None,
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source)),
            }
            .map_err(|e| format!("Content access executeJs failed: {e}"))?;

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
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content access grant failed: {msg} (version={version}, contentId={normalized_content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }

    pub fn resolve_registered_content_for_track(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

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
        let owner_norm = owner.to_lowercase();

        let track_id = build_track_id(&title, &artist, &album, mbid.as_deref(), ip_id.as_deref())?;
        let content_id = compute_content_id(track_id, owner)?;
        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();

        let entry = fetch_content_registry_entry(&content_id_hex)?;
        if !entry.active {
            return Err(format!(
                "Content is not active on ContentRegistry (contentId={content_id_hex})"
            ));
        }
        if entry.owner.to_lowercase() != owner_norm {
            return Err(format!(
                "Content owner mismatch for contentId={content_id_hex} (owner={}, expected={})",
                entry.owner, owner
            ));
        }
        if entry.piece_cid.is_empty() {
            return Err(format!(
                "Content found but pieceCid is empty (contentId={content_id_hex})"
            ));
        }

        Ok(json!({
            "trackId": to_hex_prefixed(track_id.as_slice()).to_lowercase(),
            "contentId": content_id_hex,
            "pieceCid": entry.piece_cid,
            "gatewayUrl": format!("{}/resolve/{}", load_gateway_url(), entry.piece_cid),
            "registerVersion": "onchain-recovered",
            "txHash": Value::Null,
            "blockNumber": Value::Null,
        }))
    }

    pub fn playlist_fetch_user_playlists(
        &mut self,
        owner_address: &str,
        max_entries: usize,
    ) -> Result<Value, String> {
        let owner = owner_address
            .parse::<Address>()
            .map_err(|e| format!("Invalid owner address ({owner_address}): {e}"))?;
        let owner_hex = format!("{:#x}", owner).to_lowercase();
        let limit = max_entries.clamp(1, 500);

        let query = format!(
            "{{ playlists(where: {{ owner: \"{owner_hex}\", exists: true }}, orderBy: updatedAt, orderDirection: desc, first: {limit}) {{ id owner name coverCid visibility trackCount version exists tracksHash createdAt updatedAt }} }}"
        );
        let payload = http_post_json(
            &subgraph_playlists_url(),
            json!({
                "query": query,
            }),
        )?;

        Ok(payload
            .get("data")
            .and_then(|v| v.get("playlists"))
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())))
    }

    pub fn playlist_fetch_track_ids(
        &mut self,
        playlist_id: &str,
        max_entries: usize,
    ) -> Result<Vec<String>, String> {
        let playlist_id_norm = normalize_bytes32_hex(playlist_id, "playlistId")?;
        let limit = max_entries.clamp(1, 1000);

        let query = format!(
            "{{ playlistTracks(where: {{ playlist: \"{playlist_id_norm}\" }}, orderBy: position, orderDirection: asc, first: {limit}) {{ trackId position }} }}"
        );
        let payload = http_post_json(
            &subgraph_playlists_url(),
            json!({
                "query": query,
            }),
        )?;

        let mut out = Vec::<String>::new();
        let entries = payload
            .get("data")
            .and_then(|v| v.get("playlistTracks"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in entries {
            if let Some(track_id) = entry.get("trackId").and_then(Value::as_str) {
                if let Ok(norm) = normalize_bytes32_hex(track_id, "trackId") {
                    out.push(norm);
                }
            }
        }
        Ok(out)
    }

    pub fn playlist_create(
        &mut self,
        auth: &PersistedAuth,
        name: &str,
        cover_cid: Option<&str>,
        visibility: u8,
        tracks: &[PlaylistTrackInput],
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Playlist name is required".to_string());
        }
        params.insert("name".to_string(), Value::String(trimmed_name.to_string()));
        params.insert(
            "coverCid".to_string(),
            Value::String(cover_cid.unwrap_or("").trim().to_string()),
        );
        params.insert("visibility".to_string(), json!(visibility));

        let mut track_values = Vec::<Value>::new();
        let mut needs_filebase_key = false;
        for track in tracks {
            if track.cover_image.is_some() {
                needs_filebase_key = true;
            }
            track_values.push(playlist_track_input_to_json(track)?);
        }
        params.insert("tracks".to_string(), Value::Array(track_values));

        self.execute_playlist_action(auth, "create", params, needs_filebase_key)
    }

    pub fn playlist_set_tracks(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
        tracks: &[PlaylistTrackInput],
        existing_track_ids: Option<&[String]>,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );

        let mut track_values = Vec::<Value>::new();
        let mut needs_filebase_key = false;
        for track in tracks {
            if track.cover_image.is_some() {
                needs_filebase_key = true;
            }
            track_values.push(playlist_track_input_to_json(track)?);
        }
        params.insert("tracks".to_string(), Value::Array(track_values));

        if let Some(existing) = existing_track_ids {
            let mut normalized = Vec::<Value>::new();
            for track_id in existing {
                normalized.push(Value::String(normalize_bytes32_hex(track_id, "trackId")?));
            }
            params.insert("existingTrackIds".to_string(), Value::Array(normalized));
        }

        self.execute_playlist_action(auth, "setTracks", params, needs_filebase_key)
    }

    pub fn playlist_update_meta(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
        name: &str,
        cover_cid: Option<&str>,
        visibility: u8,
        cover_image: Option<&PlaylistCoverImageInput>,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Playlist name is required".to_string());
        }

        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );
        params.insert("name".to_string(), Value::String(trimmed_name.to_string()));
        params.insert(
            "coverCid".to_string(),
            Value::String(cover_cid.unwrap_or("").trim().to_string()),
        );
        params.insert("visibility".to_string(), json!(visibility));

        let mut needs_filebase_key = false;
        if let Some(img) = cover_image {
            needs_filebase_key = true;
            params.insert(
                "coverImage".to_string(),
                json!({
                    "base64": img.base64.trim(),
                    "contentType": img.content_type.trim(),
                }),
            );
        }

        self.execute_playlist_action(auth, "updateMeta", params, needs_filebase_key)
    }

    pub fn playlist_delete(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );
        self.execute_playlist_action(auth, "delete", params, false)
    }

    pub fn resolve_shared_track_metadata(
        &mut self,
        content_id_hex: &str,
        track_id_hint: Option<&str>,
    ) -> Result<Value, String> {
        let content_id = normalize_content_id_hex(content_id_hex)?;
        let track_id = if let Some(hint) = track_id_hint.filter(|v| !v.trim().is_empty()) {
            normalize_bytes32_hex(hint, "trackId")?
        } else {
            fetch_track_id_for_content_subgraph(&content_id)?
                .ok_or_else(|| format!("No trackId found for contentId={content_id}"))?
        };

        if let Some((title, artist, album)) = fetch_track_metadata_subgraph(&track_id)? {
            return Ok(json!({
                "trackId": track_id,
                "contentId": content_id,
                "title": title,
                "artist": artist,
                "album": album,
                "source": "subgraph",
            }));
        }

        if let Some((title, artist, album)) = fetch_track_metadata_onchain(&track_id)? {
            return Ok(json!({
                "trackId": track_id,
                "contentId": content_id,
                "title": title,
                "artist": artist,
                "album": album,
                "source": "onchain",
            }));
        }

        Err(format!(
            "Track metadata unavailable for contentId={content_id} (trackId={track_id})"
        ))
    }

    fn execute_playlist_action(
        &mut self,
        auth: &PersistedAuth,
        operation: &str,
        mut params: serde_json::Map<String, Value>,
        needs_filebase_key: bool,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let timestamp = chrono::Utc::now().timestamp_millis();
        let nonce = fetch_playlist_user_nonce(user_address)?;
        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = get_playlist_action(&network)?;

        params.insert(
            "userPkpPublicKey".to_string(),
            Value::String(user_public_key.to_string()),
        );
        params.insert(
            "operation".to_string(),
            Value::String(operation.to_string()),
        );
        params.insert(
            "timestamp".to_string(),
            Value::String(timestamp.to_string()),
        );
        params.insert("nonce".to_string(), Value::String(nonce));

        if needs_filebase_key {
            if let Some(plaintext) = filebase_covers_plaintext_key() {
                params.insert("filebasePlaintextKey".to_string(), Value::String(plaintext));
            } else if let PlaylistAction::Ipfs { id, .. } = &action {
                params.insert(
                    "filebaseEncryptedKey".to_string(),
                    build_playlist_filebase_encrypted_key(id),
                );
            }
        }

        let mut retried_with_auth_data = false;
        let (mut payload, mut action_source) =
            execute_playlist_action_once(self, &action, &params)?;

        let first_error = payload
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        let first_success = payload
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        if !first_success {
            log::warn!(
                "[Playlist] first attempt failed: success=false, error={}, operation={}, source={}",
                first_error,
                operation,
                action_source
            );
        }

        if !first_success && is_lit_scope_too_limited_error(first_error) {
            retried_with_auth_data = true;
            log::warn!(
                "[Playlist] scope-limited auth context detected; retrying with authData context (operation={}, source={})",
                operation,
                action_source
            );
            match self.reinitialize_lit_with_auth_data(auth) {
                Ok(()) => match execute_playlist_action_once(self, &action, &params) {
                    Ok(retry) => {
                        payload = retry.0;
                        action_source = retry.1;
                    }
                    Err(err) => {
                        if is_lit_invalid_blockhash_error(&err) {
                            return Err(mark_needs_reauth_error(&err));
                        }
                        return Err(err);
                    }
                },
                Err(err) => {
                    if is_lit_invalid_blockhash_error(&err) {
                        return Err(mark_needs_reauth_error(&err));
                    }
                    return Err(err);
                }
            }
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
            if retried_with_auth_data && is_lit_invalid_blockhash_error(msg) {
                return Err(mark_needs_reauth_error(msg));
            }
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let retry_suffix = if retried_with_auth_data {
                ", retriedWithAuthData=true"
            } else {
                ""
            };
            return Err(format!(
                "Playlist operation failed: {msg} (operation={operation}, txHash={tx_hash}, actionSource={action_source}{retry_suffix})"
            ));
        }

        Ok(payload)
    }

    pub fn decrypt_shared_content_to_local_file(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        gateway_url_hint: Option<&str>,
        file_stem_hint: Option<&str>,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?
            .to_string();

        match check_content_access_on_base(&user_address, &normalized_content_id) {
            Ok(true) => {}
            Ok(false) => {
                return Err(format!(
                    "Access denied on ContentAccessMirror for wallet={} contentId={}. Ask the owner to share again or wait for mirror sync.",
                    user_address, normalized_content_id
                ));
            }
            Err(err) => {
                log::warn!(
                    "[LoadStorage] canAccess preflight failed (continuing to Lit decrypt): {}",
                    err
                );
            }
        }

        if let Some(existing) = find_cached_shared_audio_path(&normalized_content_id) {
            return Ok(json!({
                "contentId": normalized_content_id,
                "pieceCid": piece_cid,
                "localPath": existing.to_string_lossy().to_string(),
                "cacheHit": true,
            }));
        }

        let piece_cid = piece_cid.trim();
        if piece_cid.is_empty() {
            return Err("pieceCid is empty".to_string());
        }

        let mut blob = None;
        let mut fetched_from = None;
        let mut fetch_errors = Vec::new();
        for url in build_shared_gateway_urls(piece_cid, gateway_url_hint) {
            match http_get_bytes(&url) {
                Ok(bytes) => {
                    blob = Some(bytes);
                    fetched_from = Some(url);
                    break;
                }
                Err(err) => fetch_errors.push(format!("{url}: {err}")),
            }
        }
        let blob = blob.ok_or_else(|| {
            format!(
                "Failed to fetch encrypted content blob for pieceCid={piece_cid}: {}",
                fetch_errors.join(" | ")
            )
        })?;

        let parsed_blob = parse_content_blob(&blob)?;
        if parsed_blob.algo != ALGO_AES_GCM_256 {
            return Err(format!(
                "Unsupported encryption algorithm in content blob: {}",
                parsed_blob.algo
            ));
        }

        log::info!(
            "[LoadStorage] shared decrypt fetch ok: contentId={} pieceCid={} from={} blobBytes={} ctLen={} hashLen={} ivLen={} audioLen={}",
            normalized_content_id,
            piece_cid,
            fetched_from.clone().unwrap_or_else(|| "n/a".to_string()),
            blob.len(),
            parsed_blob.lit_ciphertext_base64.len(),
            parsed_blob.data_to_encrypt_hash_hex.len(),
            parsed_blob.iv.len(),
            parsed_blob.encrypted_audio.len(),
        );

        let (decrypted_key_payload_bytes, decrypt_chain) = self
            .decrypt_content_key_payload_with_chain_fallback(
                parsed_blob.lit_ciphertext_base64.clone(),
                parsed_blob.data_to_encrypt_hash_hex.clone(),
                &normalized_content_id,
            )?;

        let payload: Value = serde_json::from_slice(&decrypted_key_payload_bytes)
            .map_err(|e| format!("Failed to parse decrypted content key payload JSON: {e}"))?;

        if let Some(payload_content_id) = payload.get("contentId").and_then(Value::as_str) {
            if payload_content_id.to_lowercase() != normalized_content_id {
                return Err(format!(
                    "Decrypted payload contentId mismatch: expected {normalized_content_id}, got {payload_content_id}"
                ));
            }
        }

        let key_base64 = payload
            .get("key")
            .and_then(Value::as_str)
            .ok_or("Decrypted payload missing key")?;
        let mut key = base64::engine::general_purpose::STANDARD
            .decode(key_base64.as_bytes())
            .map_err(|e| format!("Invalid AES key base64 in decrypted payload: {e}"))?;
        if key.len() != 32 {
            return Err(format!(
                "Invalid AES key length in decrypted payload: expected 32 bytes, got {}",
                key.len()
            ));
        }

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to initialize AES key for shared decrypt: {e}"))?;
        let decrypted_audio = cipher
            .decrypt(
                Nonce::from_slice(&parsed_blob.iv),
                parsed_blob.encrypted_audio.as_slice(),
            )
            .map_err(|e| format!("Failed to decrypt shared audio payload: {e}"))?;
        key.fill(0);

        let ext = infer_audio_extension(&decrypted_audio);
        let local_path = shared_audio_cache_path(
            &normalized_content_id,
            file_stem_hint.unwrap_or("shared-track"),
            ext,
        );
        if let Some(parent) = local_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed creating shared audio cache dir ({}): {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&local_path, &decrypted_audio).map_err(|e| {
            format!(
                "Failed writing decrypted shared audio ({}): {e}",
                local_path.display()
            )
        })?;

        Ok(json!({
            "contentId": normalized_content_id,
            "pieceCid": piece_cid,
            "localPath": local_path.to_string_lossy().to_string(),
            "bytes": decrypted_audio.len(),
            "cacheHit": false,
            "fetchedFrom": fetched_from,
            "decryptChain": decrypt_chain,
        }))
    }

    fn decrypt_content_key_payload_with_chain_fallback(
        &mut self,
        ciphertext_base64: String,
        data_to_encrypt_hash_hex: String,
        content_id_hex: &str,
    ) -> Result<(Vec<u8>, String), String> {
        let primary_chain = lit_chain();
        let mut chains = vec![primary_chain.clone()];
        if !chains
            .iter()
            .any(|c| c.eq_ignore_ascii_case(DEFAULT_LIT_CHAIN))
        {
            chains.push(DEFAULT_LIT_CHAIN.to_string());
        }
        if !chains.iter().any(|c| c.eq_ignore_ascii_case("yellowstone")) {
            chains.push("yellowstone".to_string());
        }

        let mut errors = Vec::<String>::new();
        for chain in &chains {
            let conditions = build_content_access_conditions_for_chain(content_id_hex, chain);
            log::info!(
                "[LoadStorage] decrypt attempt: contentId={} chain={} dataToEncryptHash={} conditions={}",
                content_id_hex,
                chain,
                data_to_encrypt_hash_hex,
                serde_json::to_string(&conditions).unwrap_or_default(),
            );
            match self.lit_mut()?.decrypt_with_access_control(
                ciphertext_base64.clone(),
                data_to_encrypt_hash_hex.clone(),
                conditions,
                chain,
            ) {
                Ok(resp) => return Ok((resp.decrypted_data, chain.clone())),
                Err(err) => errors.push(format!("chain={chain}: {err}")),
            }
        }

        let joined = errors.join(" | ");
        let is_encrypted_payload_failure = !errors.is_empty()
            && errors.iter().all(|e| {
                e.contains("encrypted payload decryption failed") || e.contains("can't decrypt")
            });

        if is_encrypted_payload_failure {
            return Err(format!(
                "Unable to decrypt shared content key (contentId={content_id_hex}). The uploaded encrypted payload is incompatible with current Lit decryption context (likely legacy/invalid upload). Ask the owner to re-upload the track and share again. Details: {joined}"
            ));
        }

        Err(format!(
            "Failed to Lit-decrypt content key payload after chain fallback: {joined}"
        ))
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

        log::info!(
            "[LoadStorage] encrypt ACC: chain={} conditions={}",
            lit_chain(),
            serde_json::to_string(&unified_access_control_conditions).unwrap_or_default(),
        );

        let encrypt_response = self
            .lit_mut()?
            .encrypt_with_access_control(
                serde_json::to_vec(&payload)
                    .map_err(|e| format!("Failed to encode content key payload: {e}"))?,
                unified_access_control_conditions,
            )
            .map_err(|e| format!("Failed to Lit-encrypt content key payload: {e}"))?;

        log::info!(
            "[LoadStorage] encrypt result: dataToEncryptHash={}",
            encrypt_response.data_to_encrypt_hash_hex,
        );

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

    fn reinitialize_lit_with_auth_data(&mut self, auth: &PersistedAuth) -> Result<(), String> {
        let mut auth_data_only = auth.clone();
        auth_data_only.lit_session_key_pair = None;
        auth_data_only.lit_delegation_auth_sig = None;
        let lit = self.lit_mut()?;
        lit.clear();
        lit.initialize_from_auth(&auth_data_only)
            .map(|_| ())
            .map_err(|e| format!("Failed to reinitialize Lit auth context from authData: {e}"))
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

// ---------------------------------------------------------------------------
// Unified action resolver. Precedence:
//   1. Explicit env CID override (HEAVEN_{ACTION}_CID)
//   2. Network-mapped CID from canonical map
//   3. Local JS file (only when HEAVEN_FORCE_LOCAL_ACTIONS=1)
//   4. Explicit env code path (HEAVEN_{ACTION}_CODE_PATH) — always honoured
// ---------------------------------------------------------------------------

fn resolve_action(
    network: &str,
    action: &str,
    env_cid_keys: &[&str],
    env_code_path_key: Option<&str>,
) -> Result<(String, String, bool), String> {
    // 1. Explicit env CID override
    for key in env_cid_keys {
        if let Ok(v) = env::var(key) {
            let cid = v.trim().to_string();
            if !cid.is_empty() {
                return Ok((cid, format!("env:{key}"), true));
            }
        }
    }

    // 2. Network-mapped CID (default path)
    if let Some(cid) = action_cid_for_network(network, action) {
        return Ok((cid.to_string(), format!("cid-map:{network}:{action}"), true));
    }

    // 3. Local JS file (dev only)
    if force_local_actions() {
        if let Some(paths) = local_code_path_for_action(action) {
            for rel in paths {
                let path = PathBuf::from(rel);
                if let Ok(code) = fs::read_to_string(&path) {
                    if !code.trim().is_empty() {
                        return Ok((code, format!("local:{rel}"), false));
                    }
                }
            }
        }
    }

    // 4. Explicit code path env var (always honoured, even without FORCE_LOCAL)
    if let Some(key) = env_code_path_key {
        if let Ok(v) = env::var(key) {
            let code_path = v.trim().to_string();
            if !code_path.is_empty() {
                let code = fs::read_to_string(&code_path)
                    .map_err(|e| format!("Failed reading {key} ({code_path}): {e}"))?;
                if !code.trim().is_empty() {
                    return Ok((code, format!("env:{key}:{code_path}"), false));
                }
            }
        }
    }

    Err(format!(
        "No CID available for action '{action}' on network '{network}'. Deploy it or set an env override."
    ))
}

fn get_content_register_action(network: &str) -> Result<ContentRegisterAction, String> {
    let (content, source, is_cid) = resolve_action(
        network,
        "contentRegisterV2",
        &[
            "HEAVEN_CONTENT_REGISTER_V2_CID",
            "HEAVEN_CONTENT_REGISTER_V1_CID",
        ],
        Some("HEAVEN_CONTENT_REGISTER_V2_CODE_PATH"),
    )
    .or_else(|_| {
        resolve_action(
            network,
            "contentRegisterV1",
            &["HEAVEN_CONTENT_REGISTER_V1_CID"],
            None,
        )
    })?;
    if is_cid {
        Ok(ContentRegisterAction::Ipfs {
            id: content,
            source,
        })
    } else {
        Ok(ContentRegisterAction::Code {
            code: content,
            source,
        })
    }
}

fn get_content_access_action(network: &str) -> Result<ContentAccessAction, String> {
    let (content, source, is_cid) = resolve_action(
        network,
        "contentAccessV1",
        &["HEAVEN_CONTENT_ACCESS_V1_CID"],
        Some("HEAVEN_CONTENT_ACCESS_V1_CODE_PATH"),
    )?;
    if is_cid {
        Ok(ContentAccessAction::Ipfs {
            id: content,
            source,
        })
    } else {
        Ok(ContentAccessAction::Code {
            code: content,
            source,
        })
    }
}

fn get_playlist_action(network: &str) -> Result<PlaylistAction, String> {
    let (content, source, is_cid) = resolve_action(
        network,
        "playlistV1",
        &["HEAVEN_PLAYLIST_V1_CID"],
        Some("HEAVEN_PLAYLIST_V1_CODE_PATH"),
    )?;
    if is_cid {
        Ok(PlaylistAction::Ipfs {
            id: content,
            source,
        })
    } else {
        Ok(PlaylistAction::Code {
            code: content,
            source,
        })
    }
}

fn content_registry() -> String {
    env::var("HEAVEN_CONTENT_REGISTRY")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CONTENT_REGISTRY.to_string())
}

fn playlist_v1() -> String {
    env::var("HEAVEN_PLAYLIST_V1")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_PLAYLIST_V1.to_string())
}

fn scrobble_v4() -> String {
    env::var("HEAVEN_AA_SCROBBLE_V4")
        .ok()
        .or_else(|| env::var("AA_SCROBBLE_V4").ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
}

fn megaeth_rpc_url() -> String {
    env::var("HEAVEN_MEGAETH_RPC_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_MEGAETH_RPC_URL.to_string())
}

fn subgraph_activity_url() -> String {
    env::var("HEAVEN_SUBGRAPH_ACTIVITY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_ACTIVITY.to_string())
}

fn subgraph_playlists_url() -> String {
    env::var("HEAVEN_SUBGRAPH_PLAYLISTS_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_PLAYLISTS.to_string())
}

fn normalize_content_id_hex(content_id_hex: &str) -> Result<String, String> {
    let raw = content_id_hex.trim();
    if raw.is_empty() {
        return Err("contentId is empty".to_string());
    }
    let raw = raw.strip_prefix("0x").unwrap_or(raw);
    if raw.len() > 64 {
        return Err(format!(
            "contentId too long: expected <= 32 bytes, got {} bytes",
            raw.len() / 2
        ));
    }
    let decoded =
        hex::decode(raw).map_err(|e| format!("Invalid contentId hex ({content_id_hex}): {e}"))?;
    if decoded.is_empty() || decoded.len() > 32 {
        return Err(format!(
            "Invalid contentId byte length: expected 1..=32, got {}",
            decoded.len()
        ));
    }

    let mut out = [0u8; 32];
    let start = 32 - decoded.len();
    out[start..].copy_from_slice(&decoded);
    Ok(to_hex_prefixed(&out).to_lowercase())
}

fn decode_hex_32(content_id_hex: &str) -> Result<[u8; 32], String> {
    let normalized = normalize_content_id_hex(content_id_hex)?;
    let raw = normalized.trim_start_matches("0x");
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid contentId hex: {e}"))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid contentId byte length after normalization: {}",
            decoded.len()
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&decoded);
    Ok(out)
}

fn normalize_bytes32_hex(value: &str, label: &str) -> Result<String, String> {
    let raw = value.trim();
    if raw.is_empty() {
        return Err(format!("{label} is empty"));
    }
    let raw = raw.strip_prefix("0x").unwrap_or(raw);
    if raw.len() > 64 {
        return Err(format!(
            "{label} too long: expected <= 32 bytes, got {} bytes",
            raw.len() / 2
        ));
    }
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid {label} hex ({value}): {e}"))?;
    if decoded.is_empty() || decoded.len() > 32 {
        return Err(format!(
            "Invalid {label} byte length: expected 1..=32, got {}",
            decoded.len()
        ));
    }

    let mut out = [0u8; 32];
    let start = 32 - decoded.len();
    out[start..].copy_from_slice(&decoded);
    Ok(to_hex_prefixed(&out).to_lowercase())
}

fn decode_bytes32_hex(value: &str, label: &str) -> Result<[u8; 32], String> {
    let normalized = normalize_bytes32_hex(value, label)?;
    let raw = normalized.trim_start_matches("0x");
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid {label} hex: {e}"))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid {label} byte length after normalization: {}",
            decoded.len()
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&decoded);
    Ok(out)
}

fn decode_eth_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let trimmed = value.trim();
    let stripped = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    if stripped.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(stripped).map_err(|e| format!("Invalid hex bytes from RPC: {e}"))
}

fn eth_call_raw(rpc_url: &str, to: &str, data_hex: &str) -> Result<Vec<u8>, String> {
    let to_addr = to
        .parse::<Address>()
        .map_err(|e| format!("Invalid contract address ({to}): {e}"))?;
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to_hex_prefixed(to_addr.as_slice()),
                "data": data_hex,
            },
            "latest"
        ]
    });

    let response = http_post_json(rpc_url, payload)?;
    if let Some(err) = response.get("error") {
        return Err(format!("RPC eth_call error ({rpc_url}): {err}"));
    }
    let result_hex = response
        .get("result")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("RPC eth_call missing result ({rpc_url})"))?;
    decode_eth_hex_bytes(result_hex)
}

fn fetch_content_registry_entry(content_id_hex: &str) -> Result<ContentRegistryEntry, String> {
    let content_id = decode_hex_32(content_id_hex)?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"getContent(bytes32)")[..4]);
    call_data.extend_from_slice(&content_id);

    let output = eth_call_raw(
        &megaeth_rpc_url(),
        &content_registry(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Err(format!(
            "ContentRegistry returned empty response for contentId={}",
            normalize_content_id_hex(content_id_hex)?
        ));
    }

    let decoded = abi_decode(
        &[
            ParamType::Address,
            ParamType::Address,
            ParamType::Bytes,
            ParamType::Uint(8),
            ParamType::Uint(64),
            ParamType::Bool,
        ],
        &output,
    )
    .map_err(|e| format!("Failed decoding ContentRegistry getContent response: {e}"))?;
    if decoded.len() != 6 {
        return Err(format!(
            "Unexpected ContentRegistry getContent response size: {}",
            decoded.len()
        ));
    }

    let owner = match &decoded[0] {
        Token::Address(addr) => format!("{:#x}", addr),
        other => {
            return Err(format!(
                "Unexpected owner type in ContentRegistry response: {other:?}"
            ));
        }
    };

    let piece_cid = match &decoded[2] {
        Token::Bytes(bytes) => {
            String::from_utf8(bytes.clone()).unwrap_or_else(|_| to_hex_prefixed(bytes.as_slice()))
        }
        other => {
            return Err(format!(
                "Unexpected pieceCid type in ContentRegistry response: {other:?}"
            ));
        }
    };

    let active = match &decoded[5] {
        Token::Bool(v) => *v,
        other => {
            return Err(format!(
                "Unexpected active flag type in ContentRegistry response: {other:?}"
            ));
        }
    };

    Ok(ContentRegistryEntry {
        owner,
        piece_cid: piece_cid.trim().to_string(),
        active,
    })
}

fn playlist_track_input_to_json(track: &PlaylistTrackInput) -> Result<Value, String> {
    let title = track.title.trim();
    let artist = track.artist.trim();
    if title.is_empty() {
        return Err("Playlist track title is required".to_string());
    }
    if artist.is_empty() {
        return Err("Playlist track artist is required".to_string());
    }

    let mut obj = serde_json::Map::new();
    obj.insert("title".to_string(), Value::String(title.to_string()));
    obj.insert("artist".to_string(), Value::String(artist.to_string()));

    if let Some(album) = track
        .album
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        obj.insert("album".to_string(), Value::String(album.to_string()));
    }
    if let Some(mbid) = track
        .mbid
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        obj.insert("mbid".to_string(), Value::String(mbid.to_string()));
    }
    if let Some(ip_id) = track
        .ip_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        obj.insert("ipId".to_string(), Value::String(ip_id.to_string()));
    }
    if let Some(cover_cid) = track
        .cover_cid
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        obj.insert("coverCid".to_string(), Value::String(cover_cid.to_string()));
    }
    if let Some(cover_image) = track.cover_image.as_ref() {
        let base64 = cover_image.base64.trim();
        let content_type = cover_image.content_type.trim();
        if !base64.is_empty() && !content_type.is_empty() {
            obj.insert(
                "coverImage".to_string(),
                json!({
                    "base64": base64,
                    "contentType": content_type,
                }),
            );
        }
    }

    Ok(Value::Object(obj))
}

fn filebase_covers_plaintext_key() -> Option<String> {
    env::var("HEAVEN_FILEBASE_COVERS_KEY")
        .ok()
        .or_else(|| env::var("FILEBASE_COVERS_API_KEY").ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn build_playlist_filebase_encrypted_key(action_cid: &str) -> Value {
    json!({
        "ciphertext": FILEBASE_COVERS_ENCRYPTED_CIPHERTEXT,
        "dataToEncryptHash": FILEBASE_COVERS_ENCRYPTED_HASH,
        "accessControlConditions": [{
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "chain": "ethereum",
            "method": "",
            "parameters": [":currentActionIpfsId"],
            "returnValueTest": { "comparator": "=", "value": action_cid },
        }],
    })
}

fn normalize_lit_action_response(raw: Value, label: &str) -> Result<Value, String> {
    match raw {
        Value::Object(_) => Ok(raw),
        Value::String(s) => serde_json::from_str::<Value>(&s)
            .map_err(|e| format!("{label} response parse failed: {e}; raw={}", s)),
        other => Err(format!("Unexpected {label} response type: {other}")),
    }
}

fn execute_playlist_action_once(
    svc: &mut LoadStorageService,
    action: &PlaylistAction,
    params: &serde_json::Map<String, Value>,
) -> Result<(Value, String), String> {
    let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) = match action {
        PlaylistAction::Ipfs { id, source } => svc
            .lit_mut()?
            .execute_js_ipfs(id.clone(), Some(Value::Object(params.clone())))
            .map(|res| (res, source.clone())),
        PlaylistAction::Code { code, source } => svc
            .lit_mut()?
            .execute_js(code.clone(), Some(Value::Object(params.clone())))
            .map(|res| (res, source.clone())),
    }
    .map_err(|e| {
        let msg = format!("Playlist executeJs failed: {e}");
        log::error!("[Playlist] executeJs SDK error: {}", msg);
        msg
    })?;

    let mut payload = normalize_lit_action_response(execute_result.response, "playlist-v1")?;
    if let Value::Object(obj) = &mut payload {
        obj.entry("actionSource".to_string())
            .or_insert(Value::String(action_source.clone()));
    }

    Ok((payload, action_source))
}

fn is_lit_scope_too_limited_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("nodeauthsigscopetoolimited") || lower.contains("required scope [1]")
}

fn is_lit_invalid_blockhash_error(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains("invalid blockhash used as challenge")
}

fn mark_needs_reauth_error(detail: &str) -> String {
    format!("[NEEDS_REAUTH] Session expired — sign in again to continue. {detail}")
}

fn fetch_playlist_user_nonce(user_address: &str) -> Result<String, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;

    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"userNonces(address)")[..4]);
    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);

    let output = eth_call_raw(
        &megaeth_rpc_url(),
        &playlist_v1(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Err("PlaylistV1 userNonces returned empty response".to_string());
    }

    let decoded = abi_decode(&[ParamType::Uint(256)], &output)
        .map_err(|e| format!("Failed decoding PlaylistV1 userNonces response: {e}"))?;
    match decoded.first() {
        Some(Token::Uint(v)) => Ok(v.to_string()),
        other => Err(format!(
            "Unexpected PlaylistV1 userNonces response payload: {other:?}"
        )),
    }
}

fn fetch_track_id_for_content_subgraph(content_id_hex: &str) -> Result<Option<String>, String> {
    let content_id = normalize_content_id_hex(content_id_hex)?;
    let query = format!(
        "{{ contentEntries(where: {{ id: \"{content_id}\" }}, first: 1) {{ id trackId }} }}"
    );

    let payload = http_post_json(
        &subgraph_activity_url(),
        json!({
            "query": query,
        }),
    )?;

    let entries = payload
        .get("data")
        .and_then(|v| v.get("contentEntries"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(first) = entries.first() else {
        return Ok(None);
    };
    let Some(track_id) = first.get("trackId").and_then(Value::as_str) else {
        return Ok(None);
    };
    Ok(Some(normalize_bytes32_hex(track_id, "trackId")?))
}

fn fetch_track_metadata_subgraph(
    track_id_hex: &str,
) -> Result<Option<(String, String, String)>, String> {
    let track_id = normalize_bytes32_hex(track_id_hex, "trackId")?;
    let query = format!(
        "{{ tracks(where: {{ id_in: [\"{track_id}\"] }}, first: 1) {{ id title artist album }} }}"
    );
    let payload = http_post_json(
        &subgraph_activity_url(),
        json!({
            "query": query,
        }),
    )?;
    let entries = payload
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(first) = entries.first() else {
        return Ok(None);
    };

    let title = first
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let artist = first
        .get("artist")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    let album = first
        .get("album")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string();

    if title.is_empty() && artist.is_empty() {
        return Ok(None);
    }

    Ok(Some((title, artist, album)))
}

fn fetch_track_metadata_onchain(
    track_id_hex: &str,
) -> Result<Option<(String, String, String)>, String> {
    let track_id = decode_bytes32_hex(track_id_hex, "trackId")?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"getTrack(bytes32)")[..4]);
    call_data.extend_from_slice(&track_id);

    let output = eth_call_raw(
        &megaeth_rpc_url(),
        &scrobble_v4(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Ok(None);
    }

    let decoded = abi_decode(
        &[
            ParamType::String,
            ParamType::String,
            ParamType::String,
            ParamType::Uint(8),
            ParamType::FixedBytes(32),
            ParamType::Uint(64),
            ParamType::String,
            ParamType::Uint(32),
        ],
        &output,
    )
    .map_err(|e| format!("Failed decoding ScrobbleV4 getTrack response: {e}"))?;
    if decoded.len() != 8 {
        return Err(format!(
            "Unexpected ScrobbleV4 getTrack response size: {}",
            decoded.len()
        ));
    }

    let title = match &decoded[0] {
        Token::String(v) => v.trim().to_string(),
        _ => String::new(),
    };
    let artist = match &decoded[1] {
        Token::String(v) => v.trim().to_string(),
        _ => String::new(),
    };
    let album = match &decoded[2] {
        Token::String(v) => v.trim().to_string(),
        _ => String::new(),
    };

    if title.is_empty() && artist.is_empty() {
        return Ok(None);
    }
    Ok(Some((title, artist, album)))
}

fn check_content_access_on_base(user_address: &str, content_id_hex: &str) -> Result<bool, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;
    let content_id = decode_hex_32(content_id_hex)?;

    let mut call_data = Vec::with_capacity(4 + 32 + 32);
    call_data.extend_from_slice(&keccak256(b"canAccess(address,bytes32)")[..4]);

    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);
    call_data.extend_from_slice(&content_id);

    let output = eth_call_raw(
        &base_sepolia_rpc_url(),
        &content_access_mirror(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Ok(false);
    }

    let decoded = abi_decode(&[ParamType::Bool], &output)
        .map_err(|e| format!("Failed decoding canAccess response: {e}"))?;
    match decoded.first() {
        Some(Token::Bool(v)) => Ok(*v),
        other => Err(format!("Unexpected canAccess response payload: {other:?}")),
    }
}

fn build_content_access_conditions_for_chain(content_id_hex: &str, chain: &str) -> Value {
    let normalized = normalize_content_id_hex(content_id_hex)
        .unwrap_or_else(|_| content_id_hex.trim().to_lowercase());
    json!([
        {
            "conditionType": "evmContract",
            "contractAddress": content_access_mirror(),
            "chain": chain,
            "functionName": "canAccess",
            "functionParams": [":userAddress", normalized],
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
    ])
}

fn build_shared_gateway_urls(piece_cid: &str, gateway_url_hint: Option<&str>) -> Vec<String> {
    let mut out = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();
    let piece_cid = piece_cid.trim();

    let push = |seen: &mut HashSet<String>, out: &mut Vec<String>, candidate: String| {
        if candidate.is_empty() {
            return;
        }
        if seen.insert(candidate.clone()) {
            out.push(candidate);
        }
    };

    if let Some(hint) = gateway_url_hint {
        let hint = hint.trim();
        if !hint.is_empty() {
            if hint.contains("/resolve/") {
                push(&mut seen, &mut out, hint.to_string());
            } else if hint.starts_with("http://") || hint.starts_with("https://") {
                push(
                    &mut seen,
                    &mut out,
                    format!("{}/resolve/{piece_cid}", hint.trim_end_matches('/')),
                );
            }
        }
    }

    push(
        &mut seen,
        &mut out,
        format!("{}/resolve/{piece_cid}", load_gateway_url()),
    );
    push(
        &mut seen,
        &mut out,
        format!("https://gateway.s3-node-1.load.network/resolve/{piece_cid}"),
    );
    push(
        &mut seen,
        &mut out,
        format!("https://arweave.net/{piece_cid}"),
    );

    out
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut resp = request
        .call()
        .map_err(|e| format!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    if status >= 400 {
        let body = read_json_or_text(&mut resp);
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }

    let mut bytes = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed reading HTTP body ({url}): {e}"))?;
    Ok(bytes)
}

fn parse_content_blob(blob: &[u8]) -> Result<ParsedContentBlob, String> {
    match parse_content_blob_raw(blob) {
        Ok(parsed) => Ok(parsed),
        Err(raw_err) => {
            let item = DataItem::from_bytes(blob)
                .map_err(|_| format!("Failed parsing content blob: {raw_err}"))?;
            parse_content_blob_raw(&item.data)
                .map_err(|inner| format!("Failed parsing content blob dataitem payload: {inner}"))
        }
    }
}

fn parse_content_blob_raw(blob: &[u8]) -> Result<ParsedContentBlob, String> {
    fn take<'a>(
        blob: &'a [u8],
        offset: &mut usize,
        len: usize,
        label: &str,
    ) -> Result<&'a [u8], String> {
        if *offset + len > blob.len() {
            return Err(format!(
                "Malformed content blob: truncated {label} (need {}, have {})",
                len,
                blob.len().saturating_sub(*offset)
            ));
        }
        let out = &blob[*offset..*offset + len];
        *offset += len;
        Ok(out)
    }

    fn take_u32(blob: &[u8], offset: &mut usize, label: &str) -> Result<usize, String> {
        let bytes = take(blob, offset, 4, label)?;
        let mut arr = [0u8; 4];
        arr.copy_from_slice(bytes);
        Ok(u32::from_be_bytes(arr) as usize)
    }

    let mut offset = 0usize;
    let ct_len = take_u32(blob, &mut offset, "ciphertext length")?;
    let ct = take(blob, &mut offset, ct_len, "ciphertext")?;

    let hash_len = take_u32(blob, &mut offset, "hash length")?;
    let hash = take(blob, &mut offset, hash_len, "hash")?;

    let algo = *take(blob, &mut offset, 1, "algorithm byte")?
        .first()
        .ok_or("Missing algorithm byte")?;

    let iv_len = *take(blob, &mut offset, 1, "iv length byte")?
        .first()
        .ok_or("Missing iv length byte")? as usize;
    let iv = take(blob, &mut offset, iv_len, "iv")?.to_vec();

    let audio_len = take_u32(blob, &mut offset, "audio length")?;
    let audio = take(blob, &mut offset, audio_len, "encrypted audio")?.to_vec();
    if offset != blob.len() {
        return Err(format!(
            "Malformed content blob: trailing bytes detected ({})",
            blob.len() - offset
        ));
    }

    let lit_ciphertext_base64 = String::from_utf8(ct.to_vec())
        .map_err(|e| format!("Invalid UTF-8 ciphertext in content blob: {e}"))?;
    let data_to_encrypt_hash_hex = String::from_utf8(hash.to_vec())
        .map_err(|e| format!("Invalid UTF-8 hash in content blob: {e}"))?;

    Ok(ParsedContentBlob {
        lit_ciphertext_base64,
        data_to_encrypt_hash_hex,
        algo,
        iv,
        encrypted_audio: audio,
    })
}

fn shared_audio_cache_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
        .join("shared-audio-cache")
}

fn sanitize_shared_file_stem(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "shared-track".to_string()
    } else {
        trimmed
    }
}

fn shared_audio_cache_path(content_id_hex: &str, file_stem_hint: &str, ext: &str) -> PathBuf {
    let normalized = normalize_content_id_hex(content_id_hex)
        .unwrap_or_else(|_| content_id_hex.trim().to_string());
    let id = normalized.trim_start_matches("0x");
    let short = &id[..id.len().min(8)];
    let stem = sanitize_shared_file_stem(file_stem_hint);
    shared_audio_cache_dir().join(format!("{stem}-{short}.{ext}"))
}

fn find_cached_shared_audio_path(content_id_hex: &str) -> Option<PathBuf> {
    let normalized = normalize_content_id_hex(content_id_hex).ok()?;
    let id = normalized.trim_start_matches("0x");
    let short = &id[..id.len().min(8)];
    let cache_dir = shared_audio_cache_dir();

    // Backward compatibility with older cache naming (`<contentId>.<ext>`).
    for ext in ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "bin"] {
        let path = cache_dir.join(format!("{id}.{ext}"));
        if path.exists() {
            return Some(path);
        }
    }

    // New cache naming (`<sanitized-title>-<contentIdPrefix>.<ext>`).
    let suffixes = [
        format!("-{short}.mp3"),
        format!("-{short}.m4a"),
        format!("-{short}.aac"),
        format!("-{short}.flac"),
        format!("-{short}.wav"),
        format!("-{short}.ogg"),
        format!("-{short}.opus"),
        format!("-{short}.bin"),
    ];
    let Ok(entries) = fs::read_dir(&cache_dir) else {
        return None;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if suffixes.iter().any(|suffix| name.ends_with(suffix)) {
            return Some(path);
        }
    }
    None
}

fn infer_audio_extension(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 3 && bytes.starts_with(b"ID3") {
        return "mp3";
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0 {
        return "mp3";
    }
    if bytes.len() >= 4 && bytes.starts_with(b"fLaC") {
        return "flac";
    }
    if bytes.len() >= 4 && bytes.starts_with(b"OggS") {
        return "ogg";
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE" {
        return "wav";
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        return "m4a";
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xF0) == 0xF0 {
        return "aac";
    }
    "bin"
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
