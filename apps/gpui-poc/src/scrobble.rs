//! Native Rust scrobble submitter for GPUI.
//!
//! Flow mirrors apps/frontend/src/lib/aa-client.ts:
//! 1) derive sender from factory getAddress
//! 2) load nonce from EntryPoint
//! 3) build registerAndScrobbleBatch calldata
//! 4) wrap in execute(ScrobbleV4, 0, innerCalldata)
//! 5) quote paymaster via AA gateway
//! 6) compute userOpHash from EntryPoint
//! 7) sign with PKP via Lit Rust SDK executeJs + Lit.Actions.signEcdsa
//! 8) send signed UserOp

use std::env;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use alloy_primitives::aliases::U192;
use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::{sol, SolCall, SolValue};
use serde::{Deserialize, Serialize};

use crate::auth::PersistedAuth;
use crate::lit_wallet::LitWalletService;
use crate::music_db::TrackRow;

const DEFAULT_AA_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_ENTRYPOINT: &str = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const DEFAULT_FACTORY: &str = "0xB66BF4066F40b36Da0da34916799a069CBc79408";
const DEFAULT_SCROBBLE_V4: &str = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1";
const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:3337";
const DEFAULT_TRACK_COVER_V4_CID_NAGA_DEV: &str = "QmcwLxoNyuV5KrJALfaAEBa4zspoxedEfPJba2Y3uhWYx7";
const DEFAULT_TRACK_COVER_V4_CID_NAGA_TEST: &str = "QmYhskK5XKmrREZBaGMpvzvTEYdaicUURjNLBhSV72U1Nm";

const FILEBASE_COVERS_ENCRYPTED_CIPHERTEXT: &str = "opMNhXZ61OJ8dRKs8zCYQOiK7f5UJlfJPNJaso/2Bky6bku1ixYnrVZYzKZOrzQ1byVbe5HsmVjGyN1OzGvNz+p6rKg/VGYjaKWZ1PB6rAaGAe98dPHRbh+ITU9Eg6FoolrHU064jiaZtG8mmeWI2WU1MsyYQOS5gKqy+7+Zy2VrjqFASSqB4B9gICarqGbGN8khHoFTjirgnZyetJRHz4Iq/K6b8dNriTgL2dSMq2TMKYsl9ghAJRo5iE1olkpLPmdsCteNREtGIiJGZ42ufECUqM9DArkBAg==";
const FILEBASE_COVERS_ENCRYPTED_HASH: &str =
    "1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f";
const MAX_COVER_BYTES: usize = 5 * 1024 * 1024;

const VERIFICATION_GAS_LIMIT: u128 = 2_000_000;
const CALL_GAS_LIMIT: u128 = 2_000_000;
const MAX_PRIORITY_FEE: u128 = 1_000_000;
const MAX_FEE: u128 = 2_000_000;
const PRE_VERIFICATION_GAS: u128 = 100_000;
const STALE_RETRY_COUNT: usize = 3;
const STALE_RETRY_BASE_DELAY_MS: u64 = 750;
const GATEWAY_RETRY_COUNT: usize = 2;
const GATEWAY_RETRY_BASE_DELAY_MS: u64 = 600;

sol! {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        bytes32 accountGasLimits;
        uint256 preVerificationGas;
        bytes32 gasFees;
        bytes paymasterAndData;
        bytes signature;
    }

    function getAddress(address owner, uint256 salt) view returns (address);
    function createAccount(address owner, uint256 salt) returns (address);
    function getNonce(address sender, uint192 key) view returns (uint256);
    function getUserOpHash(UserOperation userOp) view returns (bytes32);
    function registerAndScrobbleBatch(
        address user,
        uint8[] regKinds,
        bytes32[] regPayloads,
        string[] titles,
        string[] artists,
        string[] albums,
        uint32[] durations,
        bytes32[] trackIds,
        uint64[] timestamps
    );
    function getTrack(bytes32 trackId) view returns (
        string title,
        string artist,
        string album,
        uint8 kind,
        bytes32 payload,
        uint64 registeredAt,
        string coverCid,
        uint32 durationSec
    );
    function execute(address dest, uint256 value, bytes func);
}

pub struct ScrobbleService {
    lit: LitWalletService,
}

#[derive(Debug, Clone)]
pub struct SubmitScrobbleInput {
    pub file_path: String,
    pub cover_path: Option<String>,
    pub user_pkp_public_key: Option<String>,
    pub artist: String,
    pub title: String,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
    pub duration_sec: u32,
    pub played_at_sec: u64,
}

#[derive(Debug, Clone)]
pub struct SubmitScrobbleResult {
    pub user_op_hash: String,
    pub sender: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayQuoteRequest {
    user_op: UserOp,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayQuoteResponse {
    paymaster_and_data: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySendRequest {
    user_op: UserOp,
    user_op_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewaySendResponse {
    user_op_hash: Option<String>,
    error: Option<String>,
    detail: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserOp {
    sender: String,
    nonce: String,
    init_code: String,
    call_data: String,
    account_gas_limits: String,
    pre_verification_gas: String,
    gas_fees: String,
    paymaster_and_data: String,
    signature: String,
}

impl ScrobbleService {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            lit: LitWalletService::new()?,
        })
    }

    pub fn submit_track(
        &mut self,
        auth: &PersistedAuth,
        track: &TrackRow,
        played_at_sec: u64,
    ) -> Result<SubmitScrobbleResult, String> {
        self.ensure_lit_ready_with_retry(auth, "Lit init")?;

        let user_address = auth
            .pkp_address
            .as_ref()
            .ok_or("Missing PKP address in auth")?
            .parse::<Address>()
            .map_err(|e| format!("Invalid PKP address: {e}"))?;
        let input = SubmitScrobbleInput {
            file_path: track.file_path.clone(),
            cover_path: track.cover_path.clone(),
            user_pkp_public_key: auth.pkp_public_key.clone(),
            artist: track.artist.clone(),
            title: track.title.clone(),
            album: if track.album.trim().is_empty() {
                None
            } else {
                Some(track.album.clone())
            },
            mbid: track.mbid.clone(),
            ip_id: track.ip_id.clone(),
            duration_sec: parse_duration_to_sec(&track.duration).unwrap_or(0),
            played_at_sec,
        };

        for attempt in 0..=STALE_RETRY_COUNT {
            match submit_scrobble_aa(&mut self.lit, user_address, &input) {
                Ok(result) => {
                    if let Err(err) = submit_track_cover_via_lit(&mut self.lit, &input) {
                        log::warn!(
                            "[Cover] skipped/failed for '{}' by '{}': {}",
                            input.title,
                            input.artist,
                            err
                        );
                    }
                    return Ok(result);
                }
                Err(e) if is_stale_session_error(&e) && attempt < STALE_RETRY_COUNT => {
                    let retry_idx = attempt + 1;
                    let delay_ms = STALE_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] submit failed with stale challenge/session (retry {}/{} in {}ms): {}",
                        retry_idx,
                        STALE_RETRY_COUNT,
                        delay_ms,
                        e
                    );
                    self.lit.clear();
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    self.ensure_lit_ready_with_retry(auth, "Lit re-init after submit failure")?;
                }
                Err(e) => return Err(e),
            }
        }

        Err("submit retry loop exhausted".to_string())
    }

    fn ensure_lit_ready(&mut self, auth: &PersistedAuth) -> Result<(), String> {
        if self.lit.is_ready() {
            return Ok(());
        }
        let status = self.lit.initialize_from_auth(auth)?;
        log::info!(
            "[Scrobble] Lit initialized: network={}, pkp={}",
            status.network,
            status.pkp_address
        );
        Ok(())
    }

    fn ensure_lit_ready_with_retry(
        &mut self,
        auth: &PersistedAuth,
        stage: &str,
    ) -> Result<(), String> {
        for attempt in 0..=STALE_RETRY_COUNT {
            match self.ensure_lit_ready(auth) {
                Ok(()) => return Ok(()),
                Err(e) if is_stale_session_error(&e) && attempt < STALE_RETRY_COUNT => {
                    let retry_idx = attempt + 1;
                    let delay_ms = STALE_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] {} failed with stale challenge/session (retry {}/{} in {}ms): {}",
                        stage,
                        retry_idx,
                        STALE_RETRY_COUNT,
                        delay_ms,
                        e
                    );
                    self.lit.clear();
                    std::thread::sleep(Duration::from_millis(delay_ms));
                }
                Err(e) => return Err(e),
            }
        }

        Err(format!("{stage}: retry loop exhausted"))
    }
}

fn is_stale_session_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("can't decrypt")
        || lower.contains("encrypted payload decryption failed")
        || lower.contains("e2ee decryption failed")
        || lower.contains("invalid blockhash")
        || lower.contains("session expired")
        || lower.contains("invalidauthsig")
        || lower.contains("auth_sig passed is invalid")
        || lower.contains("insufficient successful encrypted responses")
}

fn submit_scrobble_aa(
    lit: &mut LitWalletService,
    user_address: Address,
    track: &SubmitScrobbleInput,
) -> Result<SubmitScrobbleResult, String> {
    let rpc_url =
        env_or("HEAVEN_AA_RPC_URL", "AA_RPC_URL").unwrap_or_else(|| DEFAULT_AA_RPC_URL.to_string());
    let gateway_url = env_or("HEAVEN_AA_GATEWAY_URL", "AA_GATEWAY_URL")
        .unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string());
    let gateway_key = env_or("HEAVEN_AA_GATEWAY_KEY", "AA_GATEWAY_KEY").unwrap_or_default();
    let entrypoint = env_or("HEAVEN_AA_ENTRYPOINT", "AA_ENTRYPOINT")
        .unwrap_or_else(|| DEFAULT_ENTRYPOINT.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid EntryPoint address: {e}"))?;
    let factory = env_or("HEAVEN_AA_FACTORY", "AA_FACTORY")
        .unwrap_or_else(|| DEFAULT_FACTORY.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid Factory address: {e}"))?;
    let scrobble_v4 = env_or("HEAVEN_AA_SCROBBLE_V4", "AA_SCROBBLE_V4")
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid ScrobbleV4 address: {e}"))?;

    log::info!(
        "[Scrobble] submit start: artist='{}' title='{}' playedAt={} gateway={}",
        track.artist,
        track.title,
        track.played_at_sec,
        gateway_url
    );

    let sender = call_get_address(&rpc_url, factory, user_address, U256::ZERO)?;
    let code = eth_get_code(&rpc_url, sender)?;
    let needs_init = code.trim() == "0x";

    let init_code_bytes = if needs_init {
        let create_calldata = createAccountCall {
            owner: user_address,
            salt: U256::ZERO,
        }
        .abi_encode();
        let mut bytes = factory.as_slice().to_vec();
        bytes.extend_from_slice(&create_calldata);
        bytes
    } else {
        Vec::new()
    };

    let nonce = call_get_nonce(&rpc_url, entrypoint, sender, U256::ZERO)?;
    let (kind, payload) = derive_track_kind_and_payload(track)?;
    let track_id = compute_track_id(kind, payload);

    let inner_calldata = registerAndScrobbleBatchCall {
        user: user_address,
        regKinds: vec![kind],
        regPayloads: vec![payload],
        titles: vec![track.title.clone()],
        artists: vec![track.artist.clone()],
        albums: vec![track.album.clone().unwrap_or_default()],
        durations: vec![track.duration_sec],
        trackIds: vec![track_id],
        timestamps: vec![track.played_at_sec],
    }
    .abi_encode();

    let outer_calldata = executeCall {
        dest: scrobble_v4,
        value: U256::ZERO,
        func: inner_calldata.into(),
    }
    .abi_encode();

    let account_gas_limits = pack_uints_128(VERIFICATION_GAS_LIMIT, CALL_GAS_LIMIT);
    let gas_fees = pack_uints_128(MAX_PRIORITY_FEE, MAX_FEE);

    let mut user_op = UserOp {
        sender: sender.to_string(),
        nonce: to_hex_u256(nonce),
        init_code: to_hex_bytes(&init_code_bytes),
        call_data: to_hex_bytes(&outer_calldata),
        account_gas_limits: to_hex_fixed32(&account_gas_limits),
        pre_verification_gas: to_hex_u256(U256::from(PRE_VERIFICATION_GAS)),
        gas_fees: to_hex_fixed32(&gas_fees),
        paymaster_and_data: "0x".to_string(),
        signature: "0x".to_string(),
    };

    let quote_req = GatewayQuoteRequest {
        user_op: user_op.clone(),
    };
    let quote: GatewayQuoteResponse =
        gateway_post_json(&gateway_url, "/quotePaymaster", &gateway_key, &quote_req)?;
    user_op.paymaster_and_data = quote.paymaster_and_data;

    let user_op_hash = call_get_user_op_hash(&rpc_url, entrypoint, &user_op)?;
    let signature = sign_user_op_hash(lit, user_op_hash)?;
    user_op.signature = signature;

    let send_req = GatewaySendRequest {
        user_op: user_op.clone(),
        user_op_hash: to_hex_h256(user_op_hash),
    };
    let send: GatewaySendResponse =
        gateway_post_json(&gateway_url, "/sendUserOp", &gateway_key, &send_req)?;

    if let Some(err) = send.error {
        let detail = send.detail.map(|d| format!(": {d}")).unwrap_or_default();
        return Err(format!("sendUserOp failed: {err}{detail}"));
    }

    let result_hash = send
        .user_op_hash
        .unwrap_or_else(|| to_hex_h256(user_op_hash));
    log::info!(
        "[Scrobble] submit success: userOpHash={} sender={}",
        result_hash,
        user_op.sender
    );

    Ok(SubmitScrobbleResult {
        user_op_hash: result_hash,
        sender: user_op.sender,
    })
}

fn submit_track_cover_via_lit(
    lit: &mut LitWalletService,
    track: &SubmitScrobbleInput,
) -> Result<(), String> {
    let Some(action_cid) = resolve_track_cover_action_cid() else {
        return Ok(());
    };
    let Some(user_pkp_public_key) = track
        .user_pkp_public_key
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Err("missing user PKP public key for cover action".to_string());
    };

    let (kind, payload) = derive_track_kind_and_payload(track)?;
    let track_id = compute_track_id(kind, payload);
    let track_id_hex = to_hex_h256(track_id).to_lowercase();

    let rpc_url =
        env_or("HEAVEN_AA_RPC_URL", "AA_RPC_URL").unwrap_or_else(|| DEFAULT_AA_RPC_URL.to_string());
    let scrobble_v4 = env_or("HEAVEN_AA_SCROBBLE_V4", "AA_SCROBBLE_V4")
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid ScrobbleV4 address: {e}"))?;

    if let Ok(Some(existing_cover_cid)) = call_get_track_cover_cid(&rpc_url, scrobble_v4, track_id)
    {
        log::info!(
            "[Cover] already set on-chain for trackId={}: {}",
            track_id_hex,
            existing_cover_cid
        );
        return Ok(());
    }

    let Some(cover_path) = track
        .cover_path
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Ok(());
    };

    let cover_file = Path::new(cover_path);
    if !cover_file.exists() {
        return Ok(());
    }

    let cover_bytes =
        std::fs::read(cover_file).map_err(|e| format!("failed to read cover image file: {e}"))?;
    if cover_bytes.is_empty() {
        return Ok(());
    }
    if cover_bytes.len() > MAX_COVER_BYTES {
        log::warn!(
            "[Cover] image too large ({} bytes > {}), skipping {}",
            cover_bytes.len(),
            MAX_COVER_BYTES,
            cover_path
        );
        return Ok(());
    }

    let cover_base64 =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &cover_bytes);
    let content_type = cover_content_type(cover_path);

    let timestamp = now_epoch_millis().to_string();
    let nonce = format!(
        "{}-{}-{}",
        now_epoch_sec(),
        std::process::id(),
        track_id_hex.trim_start_matches("0x")
    );

    let mut js_params = serde_json::json!({
        "userPkpPublicKey": user_pkp_public_key,
        "tracks": [{
            "trackId": track_id_hex,
            "coverImage": {
                "base64": cover_base64,
                "contentType": content_type,
            }
        }],
        "timestamp": timestamp,
        "nonce": nonce,
    });

    if let Some(filebase_plaintext_key) =
        env_or("HEAVEN_FILEBASE_COVERS_KEY", "FILEBASE_COVERS_API_KEY")
    {
        js_params["filebasePlaintextKey"] = serde_json::Value::String(filebase_plaintext_key);
    } else {
        js_params["filebaseEncryptedKey"] = build_filebase_encrypted_key(&action_cid);
    }

    let response = lit.execute_js_ipfs(action_cid, Some(js_params))?;
    let payload = parse_lit_action_response_payload(&response.response)?;
    let success = payload
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !success {
        return Err(payload
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("cover action failed")
            .to_string());
    }

    let returned_cover_cid = payload
        .get("coverCid")
        .and_then(|v| v.as_str())
        .filter(|v| is_valid_cid(v))
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("coverCids")
                .and_then(|v| v.get(&track_id_hex))
                .and_then(|v| v.as_str())
                .filter(|v| is_valid_cid(v))
                .map(str::to_string)
        });

    if let Some(cid) = returned_cover_cid {
        log::info!(
            "[Cover] submitted for trackId={} file='{}' cid={}",
            track_id_hex,
            track.file_path,
            cid
        );
    } else {
        log::info!(
            "[Cover] action succeeded for trackId={} file='{}'",
            track_id_hex,
            track.file_path
        );
    }

    Ok(())
}

fn resolve_track_cover_action_cid() -> Option<String> {
    env_or("HEAVEN_TRACK_COVER_V4_CID", "TRACK_COVER_V4_CID").or_else(|| {
        let network = env_or("HEAVEN_LIT_NETWORK", "LIT_NETWORK")
            .unwrap_or_else(|| "naga-dev".to_string())
            .to_lowercase();
        match network.as_str() {
            "naga-dev" => Some(DEFAULT_TRACK_COVER_V4_CID_NAGA_DEV.to_string()),
            "naga-test" => Some(DEFAULT_TRACK_COVER_V4_CID_NAGA_TEST.to_string()),
            _ => None,
        }
    })
}

fn build_filebase_encrypted_key(action_cid: &str) -> serde_json::Value {
    serde_json::json!({
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

fn parse_lit_action_response_payload(raw: &serde_json::Value) -> Result<serde_json::Value, String> {
    match raw {
        serde_json::Value::Object(_) => Ok(raw.clone()),
        serde_json::Value::String(s) => serde_json::from_str::<serde_json::Value>(s)
            .map_err(|e| format!("cover action response parse failed: {e}; raw={}", s)),
        other => Err(format!("unexpected cover action response shape: {other}")),
    }
}

fn call_get_track_cover_cid(
    rpc_url: &str,
    scrobble_v4: Address,
    track_id: B256,
) -> Result<Option<String>, String> {
    let data = getTrackCall { trackId: track_id }.abi_encode();
    let out = eth_call(rpc_url, scrobble_v4, &data)?;
    let decoded = getTrackCall::abi_decode_returns(&out)
        .map_err(|e| format!("getTrack decode failed: {e}"))?;
    let cover_cid = decoded.coverCid.trim().to_string();
    if is_valid_cid(&cover_cid) {
        Ok(Some(cover_cid))
    } else {
        Ok(None)
    }
}

fn is_valid_cid(cid: &str) -> bool {
    cid.starts_with("Qm") || cid.starts_with("bafy")
}

fn cover_content_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}

fn derive_track_kind_and_payload(track: &SubmitScrobbleInput) -> Result<(u8, B256), String> {
    if let Some(mbid) = track.mbid.as_ref().filter(|m| !m.trim().is_empty()) {
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
        return Ok((1, B256::from(payload)));
    }

    if let Some(ip_id) = track.ip_id.as_ref().filter(|id| !id.trim().is_empty()) {
        let normalized = if ip_id.starts_with("0x") {
            ip_id.clone()
        } else {
            format!("0x{ip_id}")
        };
        let addr = normalized
            .parse::<Address>()
            .map_err(|e| format!("Invalid ipId address: {e}"))?;
        let mut payload = [0u8; 32];
        payload[12..].copy_from_slice(addr.as_slice());
        return Ok((2, B256::from(payload)));
    }

    let payload = keccak256(
        (
            normalize_string(&track.title),
            normalize_string(&track.artist),
            normalize_string(track.album.as_deref().unwrap_or_default()),
        )
            .abi_encode(),
    );
    Ok((3, payload))
}

fn normalize_string(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn compute_track_id(kind: u8, payload: B256) -> B256 {
    let mut buf = Vec::with_capacity(64);
    let mut kind_word = [0u8; 32];
    kind_word[31] = kind;
    buf.extend_from_slice(&kind_word);
    buf.extend_from_slice(payload.as_slice());
    keccak256(buf)
}

fn call_get_address(
    rpc_url: &str,
    factory: Address,
    owner: Address,
    salt: U256,
) -> Result<Address, String> {
    let data = getAddressCall { owner, salt }.abi_encode();
    let out = eth_call(rpc_url, factory, &data)?;
    decode_address_word(&out)
}

fn call_get_nonce(
    rpc_url: &str,
    entrypoint: Address,
    sender: Address,
    key: U256,
) -> Result<U256, String> {
    let key_limbs = key.into_limbs();
    let key192 = U192::from_limbs([key_limbs[0], key_limbs[1], key_limbs[2]]);
    let data = getNonceCall {
        sender,
        key: key192,
    }
    .abi_encode();
    let out = eth_call(rpc_url, entrypoint, &data)?;
    decode_u256_word(&out)
}

fn call_get_user_op_hash(
    rpc_url: &str,
    entrypoint: Address,
    user_op: &UserOp,
) -> Result<B256, String> {
    let sender = user_op
        .sender
        .parse::<Address>()
        .map_err(|e| format!("invalid sender address in UserOp: {e}"))?;
    let data = getUserOpHashCall {
        userOp: UserOperation {
            sender,
            nonce: parse_hex_u256(&user_op.nonce)?,
            initCode: parse_hex_bytes(&user_op.init_code)?.into(),
            callData: parse_hex_bytes(&user_op.call_data)?.into(),
            accountGasLimits: B256::from(parse_hex_fixed32(&user_op.account_gas_limits)?),
            preVerificationGas: parse_hex_u256(&user_op.pre_verification_gas)?,
            gasFees: B256::from(parse_hex_fixed32(&user_op.gas_fees)?),
            paymasterAndData: parse_hex_bytes(&user_op.paymaster_and_data)?.into(),
            signature: Vec::new().into(),
        },
    }
    .abi_encode();
    let out = eth_call(rpc_url, entrypoint, &data)?;
    decode_b256_word(&out)
}

fn sign_user_op_hash(lit: &mut LitWalletService, user_op_hash: B256) -> Result<String, String> {
    // SimpleAccount._validateSignature expects:
    //   ECDSA.recover(toEthSignedMessageHash(userOpHash), signature)
    // So we apply EIP-191 prefix, then sign via executeJs + Lit.Actions.signEcdsa.
    let eth_signed = alloy_primitives::utils::eip191_hash_message(user_op_hash.as_slice());
    let to_sign: Vec<u8> = eth_signed.as_slice().to_vec();

    let sig = lit.pkp_sign_via_execute_js(&to_sign)?;
    let (r, s, recid) = extract_lit_signature(&sig)?;
    let v = if recid >= 27 { recid } else { recid + 27 };
    let out = format!("0x{}{}{:02x}", r, s, v);
    // Validate hex shape locally so bundler errors point to real root-cause.
    let bytes = parse_hex_bytes(&out)
        .map_err(|e| format!("invalid assembled signature hex: {e}; sig={sig}"))?;
    if bytes.len() != 65 {
        return Err(format!(
            "assembled signature must be 65 bytes, got {} bytes; sig={}",
            bytes.len(),
            sig
        ));
    }
    Ok(out)
}

fn extract_lit_signature(sig: &serde_json::Value) -> Result<(String, String, u8), String> {
    let recid = parse_recovery_id(sig).unwrap_or(0);

    // Prefer `signature` field from Lit response when present. It is usually the
    // canonical r||s material and avoids schema differences in r/s fields.
    if let Some(signature) = sig.get("signature").and_then(|v| v.as_str()) {
        let mut sig_hex = normalize_hex_no_prefix(signature)?;
        if sig_hex.len() == 130 {
            // r||s||v
            let v_hex = &sig_hex[128..130];
            let v = u8::from_str_radix(v_hex, 16).unwrap_or(recid);
            return Ok((sig_hex[..64].to_string(), sig_hex[64..128].to_string(), v));
        }
        if sig_hex.len() < 128 {
            return Err(format!(
                "Lit signature is shorter than 64 bytes (hex chars={}): {}",
                sig_hex.len(),
                sig
            ));
        }
        // Some providers append extra metadata bytes; keep only r||s.
        sig_hex.truncate(128);
        return Ok((
            sig_hex[..64].to_string(),
            sig_hex[64..128].to_string(),
            recid,
        ));
    }

    if let (Some(r), Some(s)) = (
        sig.get("r").and_then(|v| v.as_str()),
        sig.get("s").and_then(|v| v.as_str()),
    ) {
        return Ok((normalize_hex_word_32(r)?, normalize_hex_word_32(s)?, recid));
    }

    Err(format!("Unsupported Lit signature shape: {sig}"))
}

fn parse_recovery_id(sig: &serde_json::Value) -> Option<u8> {
    for key in ["recid", "recoveryId", "recovery_id", "v"] {
        let Some(value) = sig.get(key) else {
            continue;
        };
        if let Some(num) = value.as_u64() {
            return Some(num as u8);
        }
        if let Some(text) = value.as_str() {
            let text = text.trim();
            if let Ok(num) = text.parse::<u64>() {
                return Some(num as u8);
            }
            let hex = text
                .strip_prefix("0x")
                .or_else(|| text.strip_prefix("0X"))
                .unwrap_or(text);
            if let Ok(num) = u8::from_str_radix(hex, 16) {
                return Some(num);
            }
        }
    }
    None
}

fn normalize_hex_no_prefix(input: &str) -> Result<String, String> {
    let mut trimmed = input.trim();

    // Some Lit responses encode hex as a quoted JSON string, e.g. "\"abcd...\"".
    // Unwrap one layer (or more) of matching quotes before hex parsing.
    loop {
        let bytes = trimmed.as_bytes();
        if bytes.len() >= 2
            && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
        {
            trimmed = trimmed[1..bytes.len() - 1].trim();
            continue;
        }
        break;
    }

    let mut hex = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed)
        .to_string();
    if hex.is_empty() {
        return Err("empty hex string".to_string());
    }
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("contains non-hex characters: {input}"));
    }
    if hex.len() % 2 != 0 {
        hex.insert(0, '0');
    }
    Ok(hex.to_lowercase())
}

fn normalize_hex_word_32(input: &str) -> Result<String, String> {
    let hex = normalize_hex_no_prefix(input)?;
    if hex.len() > 64 {
        // Allow occasional sign-extension / leading zeros.
        if hex[..hex.len() - 64].chars().all(|c| c == '0') {
            return Ok(hex[hex.len() - 64..].to_string());
        }
        return Err(format!(
            "hex word exceeds 32 bytes and is not zero-prefixed: {}",
            input
        ));
    }
    Ok(format!("{:0>64}", hex))
}

fn gateway_post_json<TReq: Serialize, TResp: for<'de> Deserialize<'de>>(
    gateway_url: &str,
    path: &str,
    api_key: &str,
    request: &TReq,
) -> Result<TResp, String> {
    let url = format!("{}{}", gateway_url.trim_end_matches('/'), path);
    let payload = serde_json::to_value(request).map_err(|e| e.to_string())?;

    for attempt in 0..=GATEWAY_RETRY_COUNT {
        let mut req = ureq::post(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("content-type", "application/json");
        if !api_key.trim().is_empty() {
            req = req.header("authorization", &format!("Bearer {api_key}"));
        }

        match req.send_json(payload.clone()) {
            Ok(mut resp) => {
                let status = resp.status().as_u16();
                let body = resp.body_mut().read_to_string().unwrap_or_default();

                if (200..300).contains(&status) {
                    return serde_json::from_str::<TResp>(&body).map_err(|e| {
                        format!("gateway {} parse failed: {} body={}", path, e, body)
                    });
                }

                if should_retry_gateway_status(status) && attempt < GATEWAY_RETRY_COUNT {
                    let retry_idx = attempt + 1;
                    let delay_ms = GATEWAY_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] gateway {} transient http {} (retry {}/{} in {}ms): {}",
                        path,
                        status,
                        retry_idx,
                        GATEWAY_RETRY_COUNT,
                        delay_ms,
                        truncate_for_log(&body, 400)
                    );
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    continue;
                }

                return Err(format!(
                    "gateway {} request failed: http status: {} body: {}",
                    path,
                    status,
                    truncate_for_log(&body, 800)
                ));
            }
            Err(err) => {
                if should_retry_gateway_transport_error(&err) && attempt < GATEWAY_RETRY_COUNT {
                    let retry_idx = attempt + 1;
                    let delay_ms = GATEWAY_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] gateway {} transport error (retry {}/{} in {}ms): {}",
                        path,
                        retry_idx,
                        GATEWAY_RETRY_COUNT,
                        delay_ms,
                        err
                    );
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    continue;
                }
                return Err(format!("gateway {} request failed: {}", path, err));
            }
        }
    }

    Err(format!(
        "gateway {} request failed: retry loop exhausted",
        path
    ))
}

fn should_retry_gateway_status(status: u16) -> bool {
    matches!(status, 429 | 502 | 503 | 504)
}

fn should_retry_gateway_transport_error(err: &ureq::Error) -> bool {
    use ureq::Error;
    matches!(
        err,
        Error::Timeout(_)
            | Error::Io(_)
            | Error::ConnectionFailed
            | Error::HostNotFound
            | Error::Protocol(_)
            | Error::Tls(_)
    )
}

fn truncate_for_log(input: &str, max_chars: usize) -> String {
    if input.len() <= max_chars {
        return input.to_string();
    }
    format!("{}…", &input[..max_chars])
}

fn eth_get_code(rpc_url: &str, address: Address) -> Result<String, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getCode",
        "params": [address.to_string(), "latest"]
    });
    let result = rpc_json(rpc_url, payload)?;
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or("eth_getCode returned non-string result".to_string())
}

fn eth_call(rpc_url: &str, to: Address, data: &[u8]) -> Result<Vec<u8>, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to.to_string(),
                "data": to_hex_bytes(data),
            },
            "latest"
        ]
    });
    let result = rpc_json(rpc_url, payload)?;
    let hex = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    parse_hex_bytes(hex)
}

fn rpc_json(rpc_url: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut resp = ureq::post(rpc_url)
        .header("content-type", "application/json")
        .send_json(payload)
        .map_err(|e| format!("RPC request failed: {e}"))?;
    let body: serde_json::Value = resp
        .body_mut()
        .read_json()
        .map_err(|e| format!("RPC parse failed: {e}"))?;
    if let Some(err) = body.get("error") {
        return Err(format!("RPC error: {err}"));
    }
    body.get("result")
        .cloned()
        .ok_or("RPC response missing result".to_string())
}

fn pack_uints_128(high: u128, low: u128) -> [u8; 32] {
    let packed: U256 = (U256::from(high) << 128) | U256::from(low);
    packed.to_be_bytes()
}

fn to_hex_u256(value: U256) -> String {
    format!("{value:#x}")
}

fn to_hex_fixed32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn to_hex_h256(value: B256) -> String {
    format!("0x{}", hex::encode(value))
}

fn to_hex_bytes(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

fn parse_hex_u256(value: &str) -> Result<U256, String> {
    U256::from_str_radix(value.trim_start_matches("0x"), 16)
        .map_err(|e| format!("invalid hex u256: {e}"))
}

fn parse_hex_fixed32(value: &str) -> Result<[u8; 32], String> {
    let bytes = parse_hex_bytes(value)?;
    if bytes.len() != 32 {
        return Err(format!("expected 32-byte hex, got {} bytes", bytes.len()));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let s = value.trim();
    if s == "0x" {
        return Ok(Vec::new());
    }
    hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("invalid hex bytes: {e}"))
}

fn decode_address_word(data: &[u8]) -> Result<Address, String> {
    if data.len() < 32 {
        return Err(format!(
            "address decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(Address::from_slice(&data[12..32]))
}

fn decode_u256_word(data: &[u8]) -> Result<U256, String> {
    if data.len() < 32 {
        return Err(format!(
            "u256 decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(U256::from_be_slice(&data[..32]))
}

fn decode_b256_word(data: &[u8]) -> Result<B256, String> {
    if data.len() < 32 {
        return Err(format!(
            "b256 decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(B256::from_slice(&data[..32]))
}

fn env_or(primary: &str, fallback: &str) -> Option<String> {
    env::var(primary)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var(fallback).ok().filter(|v| !v.trim().is_empty()))
}

fn parse_duration_to_sec(value: &str) -> Option<u32> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() == 2 {
        let min = parts[0].parse::<u32>().ok()?;
        let sec = parts[1].parse::<u32>().ok()?;
        return Some(min.saturating_mul(60).saturating_add(sec));
    }
    parts.first()?.parse::<u32>().ok()
}

pub fn now_epoch_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn now_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_track_kind_uses_ip_id_when_present() {
        let input = SubmitScrobbleInput {
            file_path: "/tmp/test.mp3".to_string(),
            cover_path: None,
            user_pkp_public_key: None,
            artist: "Artist".to_string(),
            title: "Title".to_string(),
            album: Some("Album".to_string()),
            mbid: None,
            ip_id: Some("0x1234567890abcdef1234567890abcdef12345678".to_string()),
            duration_sec: 180,
            played_at_sec: 1_700_000_000,
        };

        let (kind, payload) = derive_track_kind_and_payload(&input).expect("derive kind/payload");
        assert_eq!(kind, 2, "ipId should map to kind 2");

        let mut expected = [0u8; 32];
        expected[12..].copy_from_slice(
            &hex::decode("1234567890abcdef1234567890abcdef12345678").expect("decode address"),
        );
        assert_eq!(
            payload,
            B256::from(expected),
            "ipId payload must be right-aligned address"
        );
    }
}
