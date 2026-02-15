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
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use alloy_primitives::aliases::U192;
use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::{sol, SolCall, SolValue};
use serde::{Deserialize, Serialize};

use crate::auth::PersistedAuth;
use crate::lit_action_registry as registry;
use crate::lit_wallet::LitWalletService;
use crate::music_db::TrackRow;
use crate::shared::rpc::rpc_json;

mod aa;
mod cover;

const DEFAULT_AA_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_ENTRYPOINT: &str = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const DEFAULT_FACTORY: &str = "0xB66BF4066F40b36Da0da34916799a069CBc79408";
const DEFAULT_SCROBBLE_V4: &str = "0xBcD4EbBb964182ffC5EA03FF70761770a326Ccf1";
const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:3337";
// Upper bound for reading/decoding embedded cover art from disk. We resize/compress for upload.
const MAX_COVER_BYTES: usize = 10 * 1024 * 1024;

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
    function scrobbleBatch(
        address user,
        bytes32[] trackIds,
        uint64[] timestamps
    );
    function isRegistered(bytes32 trackId) view returns (bool);
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
            duration_sec: aa::parse_duration_to_sec(&track.duration).unwrap_or(0),
            played_at_sec,
        };

        for attempt in 0..=STALE_RETRY_COUNT {
            match aa::submit_scrobble_aa(&mut self.lit, user_address, &input) {
                Ok(result) => {
                    if let Err(err) = cover::submit_track_cover_via_lit(&mut self.lit, &input) {
                        log::warn!(
                            "[Cover] skipped/failed for '{}' by '{}': {}",
                            input.title,
                            input.artist,
                            err
                        );
                    }
                    return Ok(result);
                }
                Err(e) if aa::is_stale_session_error(&e) && attempt < STALE_RETRY_COUNT => {
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
                Err(e) if aa::is_stale_session_error(&e) && attempt < STALE_RETRY_COUNT => {
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

pub fn now_epoch_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
