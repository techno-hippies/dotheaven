use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::{sol, SolCall, SolValue};
use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use ethers::signers::{LocalWallet, Signer};
use ethers::types::H256;
use image::imageops::FilterType;
use serde_json::json;

use crate::shared::rpc::{read_json_or_text, rpc_json};

use super::{SubmitScrobbleInput, SubmitScrobbleResult, TempoScrobbleSession};

const FEE_PAYER_SENDER_HINT_MARKER_HEX: &str = "feefeefeefee";
const MIN_PRIORITY_FEE_PER_GAS: u64 = 1_000_000;
const GAS_LIMIT_SCROBBLE_ONLY_MIN: u64 = 420_000;
const GAS_LIMIT_REGISTER_AND_SCROBBLE_MIN: u64 = 1_500_000;
const GAS_LIMIT_BUFFER: u64 = 250_000;
const SCROBBLE_EXPIRY_WINDOW_SECS: u64 = 25;
const MAX_EXPIRING_SUBMIT_ATTEMPTS: u32 = 3;
const EXPIRING_RECEIPT_GRACE_SECS: u64 = 6;
const FEE_BUMP_NUMERATOR: u64 = 12;
const FEE_BUMP_DENOMINATOR: u64 = 10;
const DEFAULT_RECEIPT_POLL_TIMEOUT_SECS: u64 = 45;
const RECEIPT_POLL_INTERVAL_MS: u64 = 1_250;
const DEFAULT_ARWEAVE_TURBO_UPLOAD_URL: &str = "https://upload.ardrive.io";
const DEFAULT_ARWEAVE_TURBO_TOKEN: &str = "ethereum";
const MAX_ARWEAVE_COVER_BYTES: usize = 100 * 1024;
const COVER_IMAGE_MAX_DIMS: [u32; 9] = [1024, 896, 768, 640, 512, 448, 384, 320, 256];
const COVER_IMAGE_JPEG_QUALITIES: [u8; 8] = [86, 80, 74, 68, 62, 56, 50, 44];
const GAS_LIMIT_SET_TRACK_COVER_MIN: u64 = 320_000;
const MAX_TRACK_COVER_REF_BYTES: usize = 128;
const MAX_ARWEAVE_LYRICS_BYTES: usize = 90 * 1024;
const GAS_LIMIT_SET_TRACK_LYRICS_MIN: u64 = 340_000;
const MAX_TRACK_LYRICS_REF_BYTES: usize = 128;
static SET_TRACK_COVER_FOR_SUPPORT_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
static SET_TRACK_LYRICS_FOR_SUPPORT_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

sol! {
    function isRegistered(bytes32 trackId) view returns (bool);
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
    function setTrackCoverFor(
        address user,
        bytes32 trackId,
        string coverRef
    );
    function getTrackLyrics(bytes32 trackId) view returns (string lyricsRef);
    function setTrackLyricsFor(
        address user,
        bytes32 trackId,
        string lyricsRef
    );
}

#[derive(Debug, Clone)]
struct SuggestedFees {
    max_priority_fee_per_gas: U256,
    max_fee_per_gas: U256,
}

#[derive(Debug, Clone)]
struct TempoUnsignedTx {
    chain_id: U256,
    max_priority_fee_per_gas: U256,
    max_fee_per_gas: U256,
    gas_limit: U256,
    calls: Vec<TempoCall>,
    nonce_key: U256,
    nonce: U256,
    valid_before: Option<U256>,
    valid_after: Option<U256>,
    key_authorization: Option<Vec<u8>>,
}

#[derive(Debug, Clone)]
struct TempoCall {
    to: Address,
    value: U256,
    input: Vec<u8>,
}

enum RlpValue {
    Bytes(Vec<u8>),
    Integer(U256),
    List(Vec<RlpValue>),
    Raw(Vec<u8>),
}

pub(super) fn submit_scrobble_tempo(
    session: &TempoScrobbleSession,
    input: &SubmitScrobbleInput,
) -> Result<SubmitScrobbleResult, String> {
    let started_at = std::time::Instant::now();
    let user_address = parse_address(&session.wallet_address, "wallet address")?;
    let session_address = parse_address(&session.session_address, "session address")?;
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;

    log::info!(
        "[Scrobble] tempo submit start: user={} chainId={} rpc={} feePayer={} title='{}' artist='{}' playedAt={}",
        session.wallet_address,
        session.chain_id,
        session.rpc_url,
        session.fee_payer_url,
        input.title,
        input.artist,
        input.played_at_sec
    );

    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo scrobble session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo scrobble session private key does not match the callback session address."
                .to_string(),
        );
    }

    let (kind, payload) = derive_track_kind_and_payload(input)?;
    let track_id = compute_track_id(kind, payload);
    let track_id_hex = format!("{track_id:#x}");
    let already_registered = call_is_registered(&session.rpc_url, scrobble_v4, track_id)?;
    log::info!(
        "[Scrobble] track resolution: kind={} trackId={:#x} alreadyRegistered={}",
        kind,
        track_id,
        already_registered
    );

    let call_data = if already_registered {
        scrobbleBatchCall {
            user: user_address,
            trackIds: vec![track_id],
            timestamps: vec![input.played_at_sec],
        }
        .abi_encode()
    } else {
        registerAndScrobbleBatchCall {
            user: user_address,
            regKinds: vec![kind],
            regPayloads: vec![payload],
            titles: vec![input.title.clone()],
            artists: vec![input.artist.clone()],
            albums: vec![input.album.clone().unwrap_or_default()],
            durations: vec![input.duration_sec],
            trackIds: vec![track_id],
            timestamps: vec![input.played_at_sec],
        }
        .abi_encode()
    };

    let nonce_key = U256::MAX;
    let nonce = U256::ZERO;
    let mut fees = get_suggested_fees(&session.rpc_url)?;
    let min_gas_limit = if already_registered {
        U256::from(GAS_LIMIT_SCROBBLE_ONLY_MIN)
    } else {
        U256::from(GAS_LIMIT_REGISTER_AND_SCROBBLE_MIN)
    };
    let gas_limit = estimate_gas_with_buffer(
        &session.rpc_url,
        user_address,
        scrobble_v4,
        &call_data,
        min_gas_limit,
    );
    for attempt in 1..=MAX_EXPIRING_SUBMIT_ATTEMPTS {
        let valid_before_secs = current_unix_secs()?.saturating_add(SCROBBLE_EXPIRY_WINDOW_SECS);
        let valid_before = U256::from(valid_before_secs);
        log::info!(
            "[Scrobble] tx params: attempt={}/{} nonceMode=expiring nonceKey={} nonce={} validBefore={} gasLimit={} maxFeePerGas={} maxPriorityFeePerGas={}",
            attempt,
            MAX_EXPIRING_SUBMIT_ATTEMPTS,
            nonce_key,
            nonce,
            valid_before,
            gas_limit,
            fees.max_fee_per_gas,
            fees.max_priority_fee_per_gas
        );

        let unsigned = TempoUnsignedTx {
            chain_id: U256::from(session.chain_id),
            max_priority_fee_per_gas: fees.max_priority_fee_per_gas,
            max_fee_per_gas: fees.max_fee_per_gas,
            gas_limit,
            calls: vec![TempoCall {
                to: scrobble_v4,
                value: U256::ZERO,
                input: call_data.clone(),
            }],
            nonce_key,
            nonce,
            valid_before: Some(valid_before),
            valid_after: None,
            // Session-key scrobbles should not attach key_authorization on each tx.
            key_authorization: None,
        };

        let signed_tx = encode_signed_tx(&unsigned, &session_wallet, user_address)?;
        let tx_with_hint = append_sender_hint(&signed_tx, user_address);
        log::info!(
            "[Scrobble] requesting fee payer signature: url={}",
            session.fee_payer_url
        );
        let relay_signed_tx = sign_via_fee_payer(&session.fee_payer_url, &tx_with_hint)?;
        log::info!(
            "[Scrobble] fee payer signed tx; broadcasting: rpc={}",
            session.rpc_url
        );
        let tx_hash = send_raw_transaction(&session.rpc_url, &relay_signed_tx)?;
        log::info!(
            "[Scrobble] broadcast accepted: txHash={} elapsedMs={}",
            tx_hash,
            started_at.elapsed().as_millis()
        );

        match await_expiring_tx_receipt(&session.rpc_url, &tx_hash, valid_before_secs)? {
            ExpiringTxStatus::Confirmed(summary) => {
                let status = summary.status.as_deref().unwrap_or("-");
                let block_number = summary.block_number.as_deref().unwrap_or("-");
                let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                log::info!(
                    "[Scrobble] receipt confirmed: txHash={} status={} block={} gasUsed={} elapsedMs={}",
                    tx_hash,
                    status,
                    block_number,
                    gas_used,
                    started_at.elapsed().as_millis()
                );
                return Ok(SubmitScrobbleResult {
                    tx_hash,
                    sender: user_address.to_string(),
                    track_id: track_id_hex.clone(),
                    already_registered,
                });
            }
            ExpiringTxStatus::Reverted(summary) => {
                let status = summary.status.as_deref().unwrap_or("-");
                let block_number = summary.block_number.as_deref().unwrap_or("-");
                let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                return Err(format!(
                    "Scrobble tx reverted: status={status} block={block_number} gasUsed={gas_used}"
                ));
            }
            ExpiringTxStatus::NotIncludedBeforeExpiry => {
                if attempt >= MAX_EXPIRING_SUBMIT_ATTEMPTS {
                    return Err(format!(
                        "Scrobble tx not included before expiry after {} attempts (last txHash={tx_hash}).",
                        MAX_EXPIRING_SUBMIT_ATTEMPTS
                    ));
                }
                fees = bump_fees(&fees);
                log::warn!(
                    "[Scrobble] tx expired before inclusion: txHash={} attempt={}/{}; retrying with bumped fees maxFeePerGas={} maxPriorityFeePerGas={}",
                    tx_hash,
                    attempt,
                    MAX_EXPIRING_SUBMIT_ATTEMPTS,
                    fees.max_fee_per_gas,
                    fees.max_priority_fee_per_gas
                );
            }
        }
    }

    Err("Scrobble tx failed unexpectedly after retries.".to_string())
}

pub(super) fn upload_cover_to_arweave(
    session: &TempoScrobbleSession,
    cover_path: &str,
) -> Result<String, String> {
    let cover_path = cover_path.trim();
    if cover_path.is_empty() {
        return Err("cover path is required".to_string());
    }

    let session_address = parse_address(&session.session_address, "session address")?;
    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo scrobble session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo scrobble session private key does not match the callback session address."
                .to_string(),
        );
    }

    let source_bytes =
        std::fs::read(cover_path).map_err(|e| format!("Failed reading cover file: {e}"))?;
    if source_bytes.is_empty() {
        return Err("Cover file is empty".to_string());
    }

    let (payload, content_type) = prepare_cover_for_arweave_upload(cover_path, &source_bytes)?;

    let mut tags = vec![Tag::new("Content-Type", content_type.as_str())];
    tags.push(Tag::new("App-Name", "heaven"));
    tags.push(Tag::new("Heaven-Type", "track-cover"));
    if let Some(name) = Path::new(cover_path).file_name().and_then(|v| v.to_str()) {
        if !name.trim().is_empty() {
            tags.push(Tag::new("File-Name", name.trim()));
        }
    }

    let owner = session_wallet
        .signer()
        .verifying_key()
        .to_encoded_point(false)
        .as_bytes()
        .to_vec();

    let mut item = DataItem::new(None, None, tags, payload)
        .map_err(|e| format!("Failed to build cover dataitem: {e}"))?;
    item.signature_type = SignatureType::Ethereum;
    item.owner = owner;

    let signing_message = item.signing_message();
    let signing_hash = ethers::utils::hash_message(&signing_message);
    let mut signature = session_wallet
        .sign_hash(signing_hash)
        .map_err(|e| format!("Failed to sign cover dataitem: {e}"))?
        .to_vec();
    if signature.len() != 65 {
        return Err(format!(
            "Invalid cover signature length: expected 65 bytes, got {}",
            signature.len()
        ));
    }
    if signature[64] < 27 {
        signature[64] = signature[64].saturating_add(27);
    }
    item.signature = signature;

    let signed = item
        .to_bytes()
        .map_err(|e| format!("Failed to encode signed cover dataitem: {e}"))?;

    let endpoint = format!(
        "{}/v1/tx/{}",
        arweave_turbo_upload_url(),
        arweave_turbo_token()
    );
    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .send(&signed)
        .map_err(|e| format!("Arweave Turbo upload request failed: {e}; endpoint={endpoint}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        let message = body
            .get("error")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Arweave Turbo upload failed with status {status}"));
        return Err(format!("{message}; endpoint={endpoint} body={body}"));
    }

    let id = extract_arweave_upload_id(&body).ok_or_else(|| {
        format!("Arweave Turbo upload succeeded but no dataitem id was returned: {body}")
    })?;

    Ok(format!("ar://{}", id.trim()))
}

pub(super) fn upload_lyrics_to_arweave(
    session: &TempoScrobbleSession,
    track_id: &str,
    lyrics_payload: &str,
) -> Result<String, String> {
    let track_id = parse_track_id_for_lyrics(track_id)?;
    let lyrics_payload = lyrics_payload.trim();
    if lyrics_payload.is_empty() {
        return Err("lyrics payload is required".to_string());
    }
    if lyrics_payload.as_bytes().len() > MAX_ARWEAVE_LYRICS_BYTES {
        return Err(format!(
            "lyrics payload exceeds max bytes ({} > {})",
            lyrics_payload.as_bytes().len(),
            MAX_ARWEAVE_LYRICS_BYTES
        ));
    }

    let session_address = parse_address(&session.session_address, "session address")?;
    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo scrobble session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo scrobble session private key does not match the callback session address."
                .to_string(),
        );
    }

    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    if !contract_supports_set_track_lyrics_for(&session.rpc_url, scrobble_v4)? {
        return Err(format!(
            "Track lyrics sync unavailable: contract {} does not expose setTrackLyricsFor(address,bytes32,string). Deploy upgraded ScrobbleV4 and update HEAVEN_TEMPO_SCROBBLE_V4.",
            session.scrobble_contract
        ));
    }

    let mut tags = vec![Tag::new("Content-Type", "application/json")];
    tags.push(Tag::new("App-Name", "heaven"));
    tags.push(Tag::new("Heaven-Type", "track-lyrics"));
    let track_id_tag = format!("{track_id:#x}");
    tags.push(Tag::new("Track-Id", track_id_tag.as_str()));

    let owner = session_wallet
        .signer()
        .verifying_key()
        .to_encoded_point(false)
        .as_bytes()
        .to_vec();

    let mut item = DataItem::new(None, None, tags, lyrics_payload.as_bytes().to_vec())
        .map_err(|e| format!("Failed to build lyrics dataitem: {e}"))?;
    item.signature_type = SignatureType::Ethereum;
    item.owner = owner;

    let signing_message = item.signing_message();
    let signing_hash = ethers::utils::hash_message(&signing_message);
    let mut signature = session_wallet
        .sign_hash(signing_hash)
        .map_err(|e| format!("Failed to sign lyrics dataitem: {e}"))?
        .to_vec();
    if signature.len() != 65 {
        return Err(format!(
            "Invalid lyrics signature length: expected 65 bytes, got {}",
            signature.len()
        ));
    }
    if signature[64] < 27 {
        signature[64] = signature[64].saturating_add(27);
    }
    item.signature = signature;

    let signed = item
        .to_bytes()
        .map_err(|e| format!("Failed to encode signed lyrics dataitem: {e}"))?;

    let endpoint = format!(
        "{}/v1/tx/{}",
        arweave_turbo_upload_url(),
        arweave_turbo_token()
    );
    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build();

    let mut resp = request.send(&signed).map_err(|e| {
        format!("Arweave Turbo lyrics upload request failed: {e}; endpoint={endpoint}")
    })?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        let message = body
            .get("error")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Arweave Turbo lyrics upload failed with status {status}"));
        return Err(format!("{message}; endpoint={endpoint} body={body}"));
    }

    let id = extract_arweave_upload_id(&body).ok_or_else(|| {
        format!("Arweave Turbo lyrics upload succeeded but no dataitem id was returned: {body}")
    })?;

    Ok(format!("ar://{}", id.trim()))
}

pub(super) fn submit_contract_call_tempo(
    session: &TempoScrobbleSession,
    contract_address: &str,
    call_data: Vec<u8>,
    gas_limit_min: u64,
    op_label: &str,
) -> Result<String, String> {
    let user_address = parse_address(&session.wallet_address, "wallet address")?;
    let session_address = parse_address(&session.session_address, "session address")?;
    let contract = parse_address(contract_address, "contract address")?;
    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo session private key does not match the callback session address.".to_string(),
        );
    }

    let nonce_key = U256::MAX;
    let nonce = U256::ZERO;
    let mut fees = get_suggested_fees(&session.rpc_url)?;
    let gas_limit = estimate_gas_with_buffer(
        &session.rpc_url,
        user_address,
        contract,
        &call_data,
        U256::from(gas_limit_min),
    );

    for attempt in 1..=MAX_EXPIRING_SUBMIT_ATTEMPTS {
        let valid_before_secs = current_unix_secs()?.saturating_add(SCROBBLE_EXPIRY_WINDOW_SECS);
        let valid_before = U256::from(valid_before_secs);
        log::info!(
            "[Scrobble] {} tx params: attempt={}/{} nonceMode=expiring nonceKey={} nonce={} validBefore={} gasLimit={} maxFeePerGas={} maxPriorityFeePerGas={}",
            op_label,
            attempt,
            MAX_EXPIRING_SUBMIT_ATTEMPTS,
            nonce_key,
            nonce,
            valid_before,
            gas_limit,
            fees.max_fee_per_gas,
            fees.max_priority_fee_per_gas
        );

        let unsigned = TempoUnsignedTx {
            chain_id: U256::from(session.chain_id),
            max_priority_fee_per_gas: fees.max_priority_fee_per_gas,
            max_fee_per_gas: fees.max_fee_per_gas,
            gas_limit,
            calls: vec![TempoCall {
                to: contract,
                value: U256::ZERO,
                input: call_data.clone(),
            }],
            nonce_key,
            nonce,
            valid_before: Some(valid_before),
            valid_after: None,
            key_authorization: None,
        };

        let signed_tx = encode_signed_tx(&unsigned, &session_wallet, user_address)?;
        let tx_with_hint = append_sender_hint(&signed_tx, user_address);
        let relay_signed_tx = sign_via_fee_payer(&session.fee_payer_url, &tx_with_hint)?;
        let tx_hash = send_raw_transaction(&session.rpc_url, &relay_signed_tx)?;

        match await_expiring_tx_receipt(&session.rpc_url, &tx_hash, valid_before_secs)? {
            ExpiringTxStatus::Confirmed(_) => return Ok(tx_hash),
            ExpiringTxStatus::Reverted(summary) => {
                let status = summary.status.as_deref().unwrap_or("-");
                let block_number = summary.block_number.as_deref().unwrap_or("-");
                let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                return Err(format!(
                    "{op_label} tx reverted: status={status} block={block_number} gasUsed={gas_used}"
                ));
            }
            ExpiringTxStatus::NotIncludedBeforeExpiry => {
                if attempt >= MAX_EXPIRING_SUBMIT_ATTEMPTS {
                    return Err(format!(
                        "{op_label} tx not included before expiry after {} attempts (last txHash={tx_hash}).",
                        MAX_EXPIRING_SUBMIT_ATTEMPTS
                    ));
                }
                fees = bump_fees(&fees);
                log::warn!(
                    "[Scrobble] {} tx expired before inclusion: txHash={} attempt={}/{}; retrying with bumped fees maxFeePerGas={} maxPriorityFeePerGas={}",
                    op_label,
                    tx_hash,
                    attempt,
                    MAX_EXPIRING_SUBMIT_ATTEMPTS,
                    fees.max_fee_per_gas,
                    fees.max_priority_fee_per_gas
                );
            }
        }
    }

    Err(format!("{op_label} tx failed unexpectedly after retries."))
}

pub(super) fn ensure_track_cover_tempo(
    session: &TempoScrobbleSession,
    track_id: &str,
    cover_ref: &str,
) -> Result<String, String> {
    let started_at = Instant::now();
    let user_address = parse_address(&session.wallet_address, "wallet address")?;
    let session_address = parse_address(&session.session_address, "session address")?;
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    if !contract_supports_set_track_cover_for(&session.rpc_url, scrobble_v4)? {
        return Err(format!(
            "Track cover sync unavailable: contract {} does not expose setTrackCoverFor(address,bytes32,string). Deploy upgraded ScrobbleV4 and update HEAVEN_TEMPO_SCROBBLE_V4.",
            session.scrobble_contract
        ));
    }
    let track_id = parse_track_id_for_cover(track_id)?;
    let cover_ref = cover_ref.trim().to_string();
    if cover_ref.is_empty() {
        return Err("cover_ref is required for track cover sync".to_string());
    }
    if cover_ref.as_bytes().len() > MAX_TRACK_COVER_REF_BYTES {
        return Err(format!(
            "cover_ref exceeds max length ({} > {})",
            cover_ref.as_bytes().len(),
            MAX_TRACK_COVER_REF_BYTES
        ));
    }

    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo scrobble session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo scrobble session private key does not match the callback session address."
                .to_string(),
        );
    }

    if let Some(existing_cover_ref) =
        call_get_track_cover_ref(&session.rpc_url, scrobble_v4, track_id)?
    {
        return Ok(existing_cover_ref);
    }

    let call_data = setTrackCoverForCall {
        user: user_address,
        trackId: track_id,
        coverRef: cover_ref.clone(),
    }
    .abi_encode();

    let nonce_key = U256::MAX;
    let nonce = U256::ZERO;
    let mut fees = get_suggested_fees(&session.rpc_url)?;
    let gas_limit = estimate_gas_with_buffer(
        &session.rpc_url,
        user_address,
        scrobble_v4,
        &call_data,
        U256::from(GAS_LIMIT_SET_TRACK_COVER_MIN),
    );

    for attempt in 1..=MAX_EXPIRING_SUBMIT_ATTEMPTS {
        let valid_before_secs = current_unix_secs()?.saturating_add(SCROBBLE_EXPIRY_WINDOW_SECS);
        let valid_before = U256::from(valid_before_secs);
        log::info!(
            "[Scrobble] cover sync tx params: attempt={}/{} trackId={:#x} nonceMode=expiring nonceKey={} nonce={} validBefore={} gasLimit={} maxFeePerGas={} maxPriorityFeePerGas={}",
            attempt,
            MAX_EXPIRING_SUBMIT_ATTEMPTS,
            track_id,
            nonce_key,
            nonce,
            valid_before,
            gas_limit,
            fees.max_fee_per_gas,
            fees.max_priority_fee_per_gas
        );

        let unsigned = TempoUnsignedTx {
            chain_id: U256::from(session.chain_id),
            max_priority_fee_per_gas: fees.max_priority_fee_per_gas,
            max_fee_per_gas: fees.max_fee_per_gas,
            gas_limit,
            calls: vec![TempoCall {
                to: scrobble_v4,
                value: U256::ZERO,
                input: call_data.clone(),
            }],
            nonce_key,
            nonce,
            valid_before: Some(valid_before),
            valid_after: None,
            key_authorization: None,
        };

        let signed_tx = encode_signed_tx(&unsigned, &session_wallet, user_address)?;
        let tx_with_hint = append_sender_hint(&signed_tx, user_address);
        let relay_signed_tx = sign_via_fee_payer(&session.fee_payer_url, &tx_with_hint)?;
        let tx_hash = send_raw_transaction(&session.rpc_url, &relay_signed_tx)?;

        match await_expiring_tx_receipt(&session.rpc_url, &tx_hash, valid_before_secs)? {
            ExpiringTxStatus::Confirmed(_) => {
                match call_get_track_cover_ref(&session.rpc_url, scrobble_v4, track_id) {
                    Ok(Some(existing_cover_ref)) => {
                        log::info!(
                            "[Scrobble] cover sync confirmed: txHash={} trackId={:#x} coverRef={} elapsedMs={}",
                            tx_hash,
                            track_id,
                            existing_cover_ref,
                            started_at.elapsed().as_millis()
                        );
                        return Ok(existing_cover_ref);
                    }
                    Ok(None) => {
                        log::info!(
                            "[Scrobble] cover sync confirmed: txHash={} trackId={:#x} coverRef={} elapsedMs={}",
                            tx_hash,
                            track_id,
                            cover_ref,
                            started_at.elapsed().as_millis()
                        );
                        return Ok(cover_ref.clone());
                    }
                    Err(err) => {
                        log::warn!(
                            "[Scrobble] cover sync post-confirmation getTrack failed: trackId={:#x} txHash={} err={}",
                            track_id,
                            tx_hash,
                            err
                        );
                        return Ok(cover_ref.clone());
                    }
                }
            }
            ExpiringTxStatus::Reverted(summary) => {
                if let Ok(Some(existing_cover_ref)) =
                    call_get_track_cover_ref(&session.rpc_url, scrobble_v4, track_id)
                {
                    return Ok(existing_cover_ref);
                }

                let status = summary.status.as_deref().unwrap_or("-");
                let block_number = summary.block_number.as_deref().unwrap_or("-");
                let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                return Err(format!(
                    "Track cover tx reverted: status={status} block={block_number} gasUsed={gas_used}"
                ));
            }
            ExpiringTxStatus::NotIncludedBeforeExpiry => {
                if attempt >= MAX_EXPIRING_SUBMIT_ATTEMPTS {
                    return Err(format!(
                        "Track cover tx not included before expiry after {} attempts (last txHash={tx_hash}).",
                        MAX_EXPIRING_SUBMIT_ATTEMPTS
                    ));
                }
                fees = bump_fees(&fees);
                log::warn!(
                    "[Scrobble] cover sync tx expired before inclusion: txHash={} attempt={}/{} trackId={:#x}; retrying with bumped fees maxFeePerGas={} maxPriorityFeePerGas={}",
                    tx_hash,
                    attempt,
                    MAX_EXPIRING_SUBMIT_ATTEMPTS,
                    track_id,
                    fees.max_fee_per_gas,
                    fees.max_priority_fee_per_gas
                );
            }
        }
    }

    Err("Track cover sync failed unexpectedly after retries.".to_string())
}

pub(super) fn read_track_cover_ref_tempo(
    session: &TempoScrobbleSession,
    track_id: &str,
) -> Result<Option<String>, String> {
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    let track_id = parse_track_id_for_cover(track_id)?;
    call_get_track_cover_ref(&session.rpc_url, scrobble_v4, track_id)
}

pub(super) fn supports_track_cover_sync_tempo(
    session: &TempoScrobbleSession,
) -> Result<bool, String> {
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    contract_supports_set_track_cover_for(&session.rpc_url, scrobble_v4)
}

pub(super) fn ensure_track_lyrics_tempo(
    session: &TempoScrobbleSession,
    track_id: &str,
    lyrics_ref: &str,
) -> Result<String, String> {
    let started_at = Instant::now();
    let user_address = parse_address(&session.wallet_address, "wallet address")?;
    let session_address = parse_address(&session.session_address, "session address")?;
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    if !contract_supports_set_track_lyrics_for(&session.rpc_url, scrobble_v4)? {
        return Err(format!(
            "Track lyrics sync unavailable: contract {} does not expose setTrackLyricsFor(address,bytes32,string). Deploy upgraded ScrobbleV4 and update HEAVEN_TEMPO_SCROBBLE_V4.",
            session.scrobble_contract
        ));
    }

    let track_id = parse_track_id_for_lyrics(track_id)?;
    let lyrics_ref = lyrics_ref.trim().to_string();
    if lyrics_ref.is_empty() {
        return Err("lyrics_ref is required for track lyrics sync".to_string());
    }
    if lyrics_ref.as_bytes().len() > MAX_TRACK_LYRICS_REF_BYTES {
        return Err(format!(
            "lyrics_ref exceeds max length ({} > {})",
            lyrics_ref.as_bytes().len(),
            MAX_TRACK_LYRICS_REF_BYTES
        ));
    }

    let session_wallet = LocalWallet::from_str(&session.session_private_key)
        .map_err(|e| format!("Invalid Tempo scrobble session private key: {e}"))?;
    let expected_session_address = ethers::types::Address::from_slice(session_address.as_slice());
    if session_wallet.address() != expected_session_address {
        return Err(
            "Tempo scrobble session private key does not match the callback session address."
                .to_string(),
        );
    }

    if let Some(existing_lyrics_ref) =
        call_get_track_lyrics_ref(&session.rpc_url, scrobble_v4, track_id)?
    {
        return Ok(existing_lyrics_ref);
    }

    let call_data = setTrackLyricsForCall {
        user: user_address,
        trackId: track_id,
        lyricsRef: lyrics_ref.clone(),
    }
    .abi_encode();

    let nonce_key = U256::MAX;
    let nonce = U256::ZERO;
    let mut fees = get_suggested_fees(&session.rpc_url)?;
    let gas_limit = estimate_gas_with_buffer(
        &session.rpc_url,
        user_address,
        scrobble_v4,
        &call_data,
        U256::from(GAS_LIMIT_SET_TRACK_LYRICS_MIN),
    );

    for attempt in 1..=MAX_EXPIRING_SUBMIT_ATTEMPTS {
        let valid_before_secs = current_unix_secs()?.saturating_add(SCROBBLE_EXPIRY_WINDOW_SECS);
        let valid_before = U256::from(valid_before_secs);
        log::info!(
            "[Scrobble] lyrics sync tx params: attempt={}/{} trackId={:#x} nonceMode=expiring nonceKey={} nonce={} validBefore={} gasLimit={} maxFeePerGas={} maxPriorityFeePerGas={}",
            attempt,
            MAX_EXPIRING_SUBMIT_ATTEMPTS,
            track_id,
            nonce_key,
            nonce,
            valid_before,
            gas_limit,
            fees.max_fee_per_gas,
            fees.max_priority_fee_per_gas
        );

        let unsigned = TempoUnsignedTx {
            chain_id: U256::from(session.chain_id),
            max_priority_fee_per_gas: fees.max_priority_fee_per_gas,
            max_fee_per_gas: fees.max_fee_per_gas,
            gas_limit,
            calls: vec![TempoCall {
                to: scrobble_v4,
                value: U256::ZERO,
                input: call_data.clone(),
            }],
            nonce_key,
            nonce,
            valid_before: Some(valid_before),
            valid_after: None,
            key_authorization: None,
        };

        let signed_tx = encode_signed_tx(&unsigned, &session_wallet, user_address)?;
        let tx_with_hint = append_sender_hint(&signed_tx, user_address);
        let relay_signed_tx = sign_via_fee_payer(&session.fee_payer_url, &tx_with_hint)?;
        let tx_hash = send_raw_transaction(&session.rpc_url, &relay_signed_tx)?;

        match await_expiring_tx_receipt(&session.rpc_url, &tx_hash, valid_before_secs)? {
            ExpiringTxStatus::Confirmed(_) => {
                match call_get_track_lyrics_ref(&session.rpc_url, scrobble_v4, track_id) {
                    Ok(Some(existing_lyrics_ref)) => {
                        log::info!(
                        "[Scrobble] lyrics sync confirmed: txHash={} trackId={:#x} lyricsRef={} elapsedMs={}",
                        tx_hash,
                        track_id,
                        existing_lyrics_ref,
                        started_at.elapsed().as_millis()
                    );
                        return Ok(existing_lyrics_ref);
                    }
                    Ok(None) => {
                        log::info!(
                        "[Scrobble] lyrics sync confirmed: txHash={} trackId={:#x} lyricsRef={} elapsedMs={}",
                        tx_hash,
                        track_id,
                        lyrics_ref,
                        started_at.elapsed().as_millis()
                    );
                        return Ok(lyrics_ref.clone());
                    }
                    Err(err) => {
                        log::warn!(
                        "[Scrobble] lyrics sync post-confirmation getTrackLyrics failed: trackId={:#x} txHash={} err={}",
                        track_id,
                        tx_hash,
                        err
                    );
                        return Ok(lyrics_ref.clone());
                    }
                }
            }
            ExpiringTxStatus::Reverted(summary) => {
                if let Ok(Some(existing_lyrics_ref)) =
                    call_get_track_lyrics_ref(&session.rpc_url, scrobble_v4, track_id)
                {
                    return Ok(existing_lyrics_ref);
                }

                let status = summary.status.as_deref().unwrap_or("-");
                let block_number = summary.block_number.as_deref().unwrap_or("-");
                let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                return Err(format!(
                    "Track lyrics tx reverted: status={status} block={block_number} gasUsed={gas_used}"
                ));
            }
            ExpiringTxStatus::NotIncludedBeforeExpiry => {
                if attempt >= MAX_EXPIRING_SUBMIT_ATTEMPTS {
                    return Err(format!(
                        "Track lyrics tx not included before expiry after {} attempts (last txHash={tx_hash}).",
                        MAX_EXPIRING_SUBMIT_ATTEMPTS
                    ));
                }
                fees = bump_fees(&fees);
                log::warn!(
                    "[Scrobble] lyrics sync tx expired before inclusion: txHash={} attempt={}/{} trackId={:#x}; retrying with bumped fees maxFeePerGas={} maxPriorityFeePerGas={}",
                    tx_hash,
                    attempt,
                    MAX_EXPIRING_SUBMIT_ATTEMPTS,
                    track_id,
                    fees.max_fee_per_gas,
                    fees.max_priority_fee_per_gas
                );
            }
        }
    }

    Err("Track lyrics sync failed unexpectedly after retries.".to_string())
}

pub(super) fn read_track_lyrics_ref_tempo(
    session: &TempoScrobbleSession,
    track_id: &str,
) -> Result<Option<String>, String> {
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    let track_id = parse_track_id_for_lyrics(track_id)?;
    call_get_track_lyrics_ref(&session.rpc_url, scrobble_v4, track_id)
}

pub(super) fn supports_track_lyrics_sync_tempo(
    session: &TempoScrobbleSession,
) -> Result<bool, String> {
    let scrobble_v4 = parse_address(&session.scrobble_contract, "scrobble contract address")?;
    contract_supports_set_track_lyrics_for(&session.rpc_url, scrobble_v4)
}

fn get_suggested_fees(rpc_url: &str) -> Result<SuggestedFees, String> {
    let gas_price_raw = rpc_string(rpc_url, "eth_gasPrice", json!([]))?;
    let gas_price = parse_hex_u256(&gas_price_raw)?;
    let priority_floor = U256::from(MIN_PRIORITY_FEE_PER_GAS);
    let priority = std::cmp::max(gas_price / U256::from(5), priority_floor);
    let buffered = gas_price * U256::from(4);
    let min_required = gas_price + priority;
    let max_fee = std::cmp::max(buffered, min_required);
    Ok(SuggestedFees {
        max_priority_fee_per_gas: priority,
        max_fee_per_gas: max_fee,
    })
}

fn estimate_gas_with_buffer(
    rpc_url: &str,
    from: Address,
    to: Address,
    data: &[u8],
    minimum: U256,
) -> U256 {
    let params = json!([{
        "from": from.to_string(),
        "to": to.to_string(),
        "data": format!("0x{}", hex::encode(data)),
    }]);
    let estimated = rpc_string(rpc_url, "eth_estimateGas", params)
        .and_then(|raw| parse_hex_u256(&raw))
        .map(|value| value + U256::from(GAS_LIMIT_BUFFER));

    match estimated {
        Ok(value) => value.max(minimum),
        Err(err) => {
            log::warn!(
                "[Scrobble] eth_estimateGas failed; using minimum gas limit {}: {}",
                minimum,
                err
            );
            minimum
        }
    }
}

fn call_is_registered(rpc_url: &str, scrobble_v4: Address, track_id: B256) -> Result<bool, String> {
    let data = isRegisteredCall { trackId: track_id }.abi_encode();
    let out = eth_call(rpc_url, scrobble_v4, &data)?;
    if out.len() < 32 {
        return Err("isRegistered eth_call result too short".to_string());
    }
    Ok(out[out.len() - 1] != 0)
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

fn arweave_turbo_upload_url() -> String {
    std::env::var("HEAVEN_ARWEAVE_TURBO_UPLOAD_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_UPLOAD_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn arweave_turbo_token() -> String {
    std::env::var("HEAVEN_ARWEAVE_TURBO_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_TOKEN.to_string())
        .trim()
        .to_ascii_lowercase()
}

fn parse_track_id_for_cover(value: &str) -> Result<B256, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("track_id is required for cover sync".to_string());
    }
    B256::from_str(value).map_err(|e| format!("invalid track_id '{value}': {e}"))
}

fn parse_track_id_for_lyrics(value: &str) -> Result<B256, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("track_id is required for lyrics sync".to_string());
    }
    B256::from_str(value).map_err(|e| format!("invalid track_id '{value}': {e}"))
}

fn call_get_track_cover_ref(
    rpc_url: &str,
    scrobble_v4: Address,
    track_id: B256,
) -> Result<Option<String>, String> {
    let data = getTrackCall { trackId: track_id }.abi_encode();
    let out = eth_call(rpc_url, scrobble_v4, &data)?;
    let decoded = getTrackCall::abi_decode_returns(&out)
        .map_err(|e| format!("getTrack decode failed: {e}"))?;
    let cover_ref = decoded.coverCid.trim();
    if cover_ref.is_empty() {
        Ok(None)
    } else {
        Ok(Some(cover_ref.to_string()))
    }
}

fn call_get_track_lyrics_ref(
    rpc_url: &str,
    scrobble_v4: Address,
    track_id: B256,
) -> Result<Option<String>, String> {
    let data = getTrackLyricsCall { trackId: track_id }.abi_encode();
    let out = eth_call(rpc_url, scrobble_v4, &data)?;
    let decoded = getTrackLyricsCall::abi_decode_returns(&out)
        .map_err(|e| format!("getTrackLyrics decode failed: {e}"))?;
    let lyrics_ref = decoded.trim();
    if lyrics_ref.is_empty() {
        Ok(None)
    } else {
        Ok(Some(lyrics_ref.to_string()))
    }
}

fn prepare_cover_for_arweave_upload(
    cover_path: &str,
    source_bytes: &[u8],
) -> Result<(Vec<u8>, String), String> {
    if source_bytes.len() <= MAX_ARWEAVE_COVER_BYTES {
        return Ok((
            source_bytes.to_vec(),
            cover_content_type_from_path(cover_path).to_string(),
        ));
    }

    let decoded =
        image::load_from_memory(source_bytes).map_err(|e| format!("cover decode failed: {e}"))?;
    let max_side = decoded.width().max(decoded.height()).max(1);

    let mut bounds = Vec::<u32>::new();
    bounds.push(max_side.min(COVER_IMAGE_MAX_DIMS[0]));
    for &dim in &COVER_IMAGE_MAX_DIMS {
        if dim < bounds[0] {
            bounds.push(dim);
        }
    }

    for &bound in &bounds {
        let resized = if max_side > bound {
            decoded.resize(bound, bound, FilterType::Lanczos3)
        } else {
            decoded.clone()
        };

        for &quality in &COVER_IMAGE_JPEG_QUALITIES {
            let jpeg = encode_cover_jpeg_rgb8(&resized, quality)?;
            if jpeg.len() <= MAX_ARWEAVE_COVER_BYTES {
                return Ok((jpeg, "image/jpeg".to_string()));
            }
        }
    }

    Err(format!(
        "unable to compress cover below {} bytes",
        MAX_ARWEAVE_COVER_BYTES
    ))
}

fn encode_cover_jpeg_rgb8(img: &image::DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();

    let mut out = Vec::<u8>::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
    encoder
        .encode(rgb.as_raw(), w, h, image::ColorType::Rgb8.into())
        .map_err(|e| format!("cover jpeg encode failed: {e}"))?;
    Ok(out)
}

fn cover_content_type_from_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}

fn extract_arweave_upload_id(payload: &serde_json::Value) -> Option<String> {
    let keys = ["id", "dataitem_id", "dataitemId"];

    for key in keys {
        if let Some(id) = payload.get(key).and_then(serde_json::Value::as_str) {
            let id = id.trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }

    if let Some(result) = payload.get("result") {
        for key in keys {
            if let Some(id) = result.get(key).and_then(serde_json::Value::as_str) {
                let id = id.trim();
                if !id.is_empty() {
                    return Some(id.to_string());
                }
            }
        }
    }

    None
}

fn contract_supports_set_track_cover_for(
    rpc_url: &str,
    scrobble_v4: Address,
) -> Result<bool, String> {
    let cache_key = format!("{}|{}", rpc_url.trim(), scrobble_v4);
    let cache = SET_TRACK_COVER_FOR_SUPPORT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    {
        let guard = cache
            .lock()
            .map_err(|e| format!("cover-support cache lock failed: {e}"))?;
        if let Some(value) = guard.get(&cache_key).copied() {
            return Ok(value);
        }
    }

    let runtime_hex = rpc_string(
        rpc_url,
        "eth_getCode",
        json!([scrobble_v4.to_string(), "latest"]),
    )?;
    let runtime = runtime_hex
        .trim()
        .strip_prefix("0x")
        .unwrap_or(runtime_hex.trim())
        .to_ascii_lowercase();
    let selector = hex::encode(setTrackCoverForCall::SELECTOR);
    let supports = !runtime.is_empty() && runtime.contains(&selector);

    let mut guard = cache
        .lock()
        .map_err(|e| format!("cover-support cache lock failed: {e}"))?;
    guard.insert(cache_key, supports);
    Ok(supports)
}

fn contract_supports_set_track_lyrics_for(
    rpc_url: &str,
    scrobble_v4: Address,
) -> Result<bool, String> {
    let cache_key = format!("{}|{}", rpc_url.trim(), scrobble_v4);
    let cache = SET_TRACK_LYRICS_FOR_SUPPORT_CACHE.get_or_init(|| Mutex::new(HashMap::new()));

    {
        let guard = cache
            .lock()
            .map_err(|e| format!("lyrics-support cache lock failed: {e}"))?;
        if let Some(value) = guard.get(&cache_key).copied() {
            return Ok(value);
        }
    }

    let runtime_hex = rpc_string(
        rpc_url,
        "eth_getCode",
        json!([scrobble_v4.to_string(), "latest"]),
    )?;
    let runtime = runtime_hex
        .trim()
        .strip_prefix("0x")
        .unwrap_or(runtime_hex.trim())
        .to_ascii_lowercase();
    let selector = hex::encode(setTrackLyricsForCall::SELECTOR);
    let supports = !runtime.is_empty() && runtime.contains(&selector);

    let mut guard = cache
        .lock()
        .map_err(|e| format!("lyrics-support cache lock failed: {e}"))?;
    guard.insert(cache_key, supports);
    Ok(supports)
}

fn normalize_string(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn compute_track_id(kind: u8, payload: B256) -> B256 {
    let mut kind_word = [0u8; 32];
    kind_word[31] = kind;

    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(&kind_word);
    buf.extend_from_slice(payload.as_slice());
    keccak256(buf)
}

fn encode_signed_tx(
    tx: &TempoUnsignedTx,
    session_wallet: &LocalWallet,
    user_address: Address,
) -> Result<String, String> {
    let hash = signature_hash(tx);
    let signature = session_wallet
        .sign_hash(H256::from_slice(hash.as_slice()))
        .map_err(|e| format!("Failed to sign Tempo tx hash with session key: {e}"))?;
    let inner_signature = signature.to_vec();
    if inner_signature.len() != 65 {
        return Err(format!(
            "Unexpected session signature length: {}",
            inner_signature.len()
        ));
    }

    let mut keychain_signature = Vec::with_capacity(1 + 20 + 65);
    keychain_signature.push(0x03);
    keychain_signature.extend_from_slice(user_address.as_slice());
    keychain_signature.extend_from_slice(&inner_signature);

    let full_fields = build_tx_fields(tx, Some(keychain_signature));
    let encoded = rlp_encode(&RlpValue::List(full_fields));
    Ok(format!("0x76{}", hex::encode(encoded)))
}

fn signature_hash(tx: &TempoUnsignedTx) -> B256 {
    let signing_fields = build_tx_fields(tx, None);
    let mut payload = Vec::with_capacity(1 + 512);
    payload.push(0x76);
    payload.extend_from_slice(&rlp_encode(&RlpValue::List(signing_fields)));
    keccak256(payload)
}

fn build_tx_fields(tx: &TempoUnsignedTx, sender_signature: Option<Vec<u8>>) -> Vec<RlpValue> {
    let calls = tx
        .calls
        .iter()
        .map(|call| {
            RlpValue::List(vec![
                RlpValue::Bytes(call.to.as_slice().to_vec()),
                RlpValue::Integer(call.value),
                RlpValue::Bytes(call.input.clone()),
            ])
        })
        .collect::<Vec<_>>();

    let valid_before = tx
        .valid_before
        .map(RlpValue::Integer)
        .unwrap_or_else(|| RlpValue::Bytes(Vec::new()));
    let valid_after = tx
        .valid_after
        .map(RlpValue::Integer)
        .unwrap_or_else(|| RlpValue::Bytes(Vec::new()));

    let mut fields = vec![
        RlpValue::Integer(tx.chain_id),
        RlpValue::Integer(tx.max_priority_fee_per_gas),
        RlpValue::Integer(tx.max_fee_per_gas),
        RlpValue::Integer(tx.gas_limit),
        RlpValue::List(calls),
        RlpValue::List(Vec::new()),
        RlpValue::Integer(tx.nonce_key),
        RlpValue::Integer(tx.nonce),
        valid_before,
        valid_after,
        RlpValue::Bytes(Vec::new()),
        RlpValue::Bytes(vec![0x00]),
        RlpValue::List(Vec::new()),
    ];

    if let Some(key_authorization) = tx.key_authorization.as_ref() {
        fields.push(RlpValue::Raw(key_authorization.clone()));
    }

    if let Some(sender_signature) = sender_signature {
        fields.push(RlpValue::Bytes(sender_signature));
    }

    fields
}

fn rlp_encode(value: &RlpValue) -> Vec<u8> {
    match value {
        RlpValue::Raw(encoded) => encoded.clone(),
        RlpValue::Bytes(bytes) => rlp_encode_bytes(bytes),
        RlpValue::Integer(number) => {
            if number.is_zero() {
                return vec![0x80];
            }
            rlp_encode_bytes(&number.to_be_bytes_trimmed_vec())
        }
        RlpValue::List(items) => {
            let mut payload = Vec::new();
            for item in items {
                payload.extend_from_slice(&rlp_encode(item));
            }
            rlp_with_prefix(&payload, 0xc0)
        }
    }
}

fn rlp_encode_bytes(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return vec![bytes[0]];
    }
    rlp_with_prefix(bytes, 0x80)
}

fn rlp_with_prefix(payload: &[u8], short_offset: u8) -> Vec<u8> {
    if payload.len() < 56 {
        let mut out = Vec::with_capacity(1 + payload.len());
        out.push(short_offset + payload.len() as u8);
        out.extend_from_slice(payload);
        return out;
    }

    let len_bytes = encode_len(payload.len());
    let mut out = Vec::with_capacity(1 + len_bytes.len() + payload.len());
    out.push(short_offset + 55 + len_bytes.len() as u8);
    out.extend_from_slice(&len_bytes);
    out.extend_from_slice(payload);
    out
}

fn encode_len(mut len: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    while len > 0 {
        bytes.push((len & 0xff) as u8);
        len >>= 8;
    }
    bytes.reverse();
    bytes
}

fn append_sender_hint(signed_tx_hex: &str, sender: Address) -> String {
    let tx = strip_0x(signed_tx_hex);
    let sender_hex = hex::encode(sender.as_slice());
    format!("0x{}{}{}", tx, sender_hex, FEE_PAYER_SENDER_HINT_MARKER_HEX)
}

fn sign_via_fee_payer(fee_payer_url: &str, signed_tx_with_hint: &str) -> Result<String, String> {
    rpc_string(
        fee_payer_url,
        "eth_signRawTransaction",
        json!([signed_tx_with_hint]),
    )
}

fn send_raw_transaction(rpc_url: &str, raw_tx: &str) -> Result<String, String> {
    rpc_string(rpc_url, "eth_sendRawTransaction", json!([raw_tx]))
}

fn rpc_string(rpc_url: &str, method: &str, params: serde_json::Value) -> Result<String, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });
    let result = rpc_json(rpc_url, payload)?;
    result
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("{method} returned non-string result: {result}"))
}

fn eth_call(rpc_url: &str, to: Address, data: &[u8]) -> Result<Vec<u8>, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to.to_string(),
                "data": format!("0x{}", hex::encode(data)),
            },
            "latest",
        ]
    });
    let result = rpc_json(rpc_url, payload)?;
    let hex = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    parse_hex_bytes(hex)
}

fn parse_address(value: &str, label: &str) -> Result<Address, String> {
    value
        .parse::<Address>()
        .map_err(|e| format!("Invalid {label}: {e}"))
}

fn parse_hex_u256(value: &str) -> Result<U256, String> {
    let clean = strip_0x(value);
    if clean.is_empty() {
        return Ok(U256::ZERO);
    }
    U256::from_str_radix(clean, 16).map_err(|e| format!("invalid hex quantity '{value}': {e}"))
}

fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let clean = strip_0x(value);
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(clean).map_err(|e| format!("invalid hex bytes '{value}': {e}"))
}

fn strip_0x(value: &str) -> &str {
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .unwrap_or(value)
}

fn spawn_receipt_poll(rpc_url: String, tx_hash: String) {
    let timeout_secs = receipt_poll_timeout_secs();
    std::thread::spawn(move || {
        let started_at = Instant::now();
        let mut logged_retry_error = false;
        loop {
            match fetch_transaction_receipt(&rpc_url, &tx_hash) {
                Ok(Some(summary)) => {
                    let status = summary.status.as_deref().unwrap_or("-");
                    let block_number = summary.block_number.as_deref().unwrap_or("-");
                    let gas_used = summary.gas_used.as_deref().unwrap_or("-");
                    if status.eq_ignore_ascii_case("0x0") {
                        log::warn!(
                            "[Scrobble] receipt confirmed: txHash={} status={} block={} gasUsed={} elapsedMs={} (reverted)",
                            tx_hash,
                            status,
                            block_number,
                            gas_used,
                            started_at.elapsed().as_millis()
                        );
                    } else {
                        log::info!(
                            "[Scrobble] receipt confirmed: txHash={} status={} block={} gasUsed={} elapsedMs={}",
                            tx_hash,
                            status,
                            block_number,
                            gas_used,
                            started_at.elapsed().as_millis()
                        );
                    }
                    break;
                }
                Ok(None) => {
                    if started_at.elapsed() >= Duration::from_secs(timeout_secs) {
                        log::warn!(
                            "[Scrobble] receipt poll timeout: txHash={} timeout={}s rpc={}",
                            tx_hash,
                            timeout_secs,
                            rpc_url
                        );
                        break;
                    }
                }
                Err(err) => {
                    if !logged_retry_error {
                        log::warn!(
                            "[Scrobble] receipt poll transient error: txHash={} err={}",
                            tx_hash,
                            err
                        );
                        logged_retry_error = true;
                    }
                    if started_at.elapsed() >= Duration::from_secs(timeout_secs) {
                        log::warn!(
                            "[Scrobble] receipt poll failed: txHash={} timeout={}s rpc={} err={}",
                            tx_hash,
                            timeout_secs,
                            rpc_url,
                            err
                        );
                        break;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(RECEIPT_POLL_INTERVAL_MS));
        }
    });
}

#[derive(Debug, Clone)]
struct ReceiptSummary {
    status: Option<String>,
    block_number: Option<String>,
    gas_used: Option<String>,
}

enum ExpiringTxStatus {
    Confirmed(ReceiptSummary),
    Reverted(ReceiptSummary),
    NotIncludedBeforeExpiry,
}

fn fetch_transaction_receipt(
    rpc_url: &str,
    tx_hash: &str,
) -> Result<Option<ReceiptSummary>, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getTransactionReceipt",
        "params": [tx_hash],
    });
    let result = rpc_json(rpc_url, payload)?;
    if result.is_null() {
        return Ok(None);
    }
    let summary = ReceiptSummary {
        status: result
            .get("status")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        block_number: result
            .get("blockNumber")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        gas_used: result
            .get("gasUsed")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    };
    Ok(Some(summary))
}

fn await_expiring_tx_receipt(
    rpc_url: &str,
    tx_hash: &str,
    valid_before_secs: u64,
) -> Result<ExpiringTxStatus, String> {
    let timeout_secs = receipt_poll_timeout_secs();
    let expiry_deadline = valid_before_secs.saturating_add(EXPIRING_RECEIPT_GRACE_SECS);
    let started_at = Instant::now();
    let mut logged_retry_error = false;

    loop {
        match fetch_transaction_receipt(rpc_url, tx_hash) {
            Ok(Some(summary)) => {
                if summary
                    .status
                    .as_deref()
                    .is_some_and(|status| status.eq_ignore_ascii_case("0x0"))
                {
                    return Ok(ExpiringTxStatus::Reverted(summary));
                }
                return Ok(ExpiringTxStatus::Confirmed(summary));
            }
            Ok(None) => {
                let now_secs = current_unix_secs()?;
                if now_secs > expiry_deadline {
                    return Ok(ExpiringTxStatus::NotIncludedBeforeExpiry);
                }
                if started_at.elapsed() >= Duration::from_secs(timeout_secs) {
                    return Ok(ExpiringTxStatus::NotIncludedBeforeExpiry);
                }
            }
            Err(err) => {
                if !logged_retry_error {
                    log::warn!(
                        "[Scrobble] receipt poll transient error: txHash={} err={}",
                        tx_hash,
                        err
                    );
                    logged_retry_error = true;
                }
                if started_at.elapsed() >= Duration::from_secs(timeout_secs) {
                    return Err(format!(
                        "receipt poll failed: txHash={tx_hash} timeout={}s rpc={} err={}",
                        timeout_secs, rpc_url, err
                    ));
                }
            }
        }
        std::thread::sleep(Duration::from_millis(RECEIPT_POLL_INTERVAL_MS));
    }
}

fn receipt_poll_timeout_secs() -> u64 {
    std::env::var("HEAVEN_SCROBBLE_RECEIPT_TIMEOUT_SECS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|secs| *secs > 0)
        .unwrap_or(DEFAULT_RECEIPT_POLL_TIMEOUT_SECS)
}

fn bump_fees(current: &SuggestedFees) -> SuggestedFees {
    let numerator = U256::from(FEE_BUMP_NUMERATOR);
    let denominator = U256::from(FEE_BUMP_DENOMINATOR);
    let bumped_priority = ((current.max_priority_fee_per_gas * numerator) / denominator)
        .max(current.max_priority_fee_per_gas + U256::from(1_u8));
    let bumped_max_fee = ((current.max_fee_per_gas * numerator) / denominator)
        .max(current.max_fee_per_gas + U256::from(1_u8));
    let max_fee = bumped_max_fee.max(bumped_priority + U256::from(1_u8));
    SuggestedFees {
        max_priority_fee_per_gas: bumped_priority,
        max_fee_per_gas: max_fee,
    }
}

fn current_unix_secs() -> Result<u64, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("system clock before unix epoch: {e}"))?;
    Ok(now.as_secs())
}
