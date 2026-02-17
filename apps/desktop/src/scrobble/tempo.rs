use std::str::FromStr;
use std::time::{Duration, Instant};

use alloy_primitives::{keccak256, Address, B256, U256};
use alloy_sol_types::{sol, SolCall, SolValue};
use ethers::signers::{LocalWallet, Signer};
use ethers::types::H256;
use serde_json::json;

use crate::shared::rpc::rpc_json;

use super::{SubmitScrobbleInput, SubmitScrobbleResult, TempoScrobbleSession};

const FEE_PAYER_SENDER_HINT_MARKER_HEX: &str = "feefeefeefee";
const MIN_PRIORITY_FEE_PER_GAS: u64 = 1_000_000;
const GAS_LIMIT_SCROBBLE_ONLY: u64 = 300_000;
const GAS_LIMIT_REGISTER_AND_SCROBBLE: u64 = 900_000;
const DEFAULT_RECEIPT_POLL_TIMEOUT_SECS: u64 = 45;
const RECEIPT_POLL_INTERVAL_MS: u64 = 1_250;
const SCROBBLE_NONCE_KEY: u64 = 1;
const NONCE_PRECOMPILE_ADDR: &str = "0x4E4F4E4345000000000000000000000000000000";
const NONCE_PRECOMPILE_GET_NONCE_SELECTOR: [u8; 4] = [0x89, 0x53, 0x58, 0x03];

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

    let key_authorization = parse_hex_bytes(&session.session_key_authorization)?;
    if key_authorization.is_empty() {
        return Err("Tempo scrobble key authorization is empty.".to_string());
    }

    let (kind, payload) = derive_track_kind_and_payload(input)?;
    let track_id = compute_track_id(kind, payload);
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

    let nonce = get_nonce(&session.rpc_url, user_address, SCROBBLE_NONCE_KEY)?;
    let nonce_key = U256::from(SCROBBLE_NONCE_KEY);
    let fees = get_suggested_fees(&session.rpc_url)?;
    let gas_limit = if already_registered {
        U256::from(GAS_LIMIT_SCROBBLE_ONLY)
    } else {
        U256::from(GAS_LIMIT_REGISTER_AND_SCROBBLE)
    };
    log::info!(
        "[Scrobble] tx params: nonceKey={} nonce={} gasLimit={} maxFeePerGas={} maxPriorityFeePerGas={}",
        nonce_key,
        nonce,
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
            input: call_data,
        }],
        nonce_key,
        nonce,
        key_authorization: Some(key_authorization),
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
    spawn_receipt_poll(session.rpc_url.clone(), tx_hash.clone());

    Ok(SubmitScrobbleResult {
        tx_hash,
        sender: user_address.to_string(),
    })
}

fn get_nonce(rpc_url: &str, user_address: Address, nonce_key: u64) -> Result<U256, String> {
    if nonce_key == 0 {
        let raw = rpc_string(
            rpc_url,
            "eth_getTransactionCount",
            json!([user_address.to_string(), "pending"]),
        )?;
        return parse_hex_u256(&raw);
    }

    let nonce_precompile = parse_address(NONCE_PRECOMPILE_ADDR, "nonce precompile address")?;
    let mut data = Vec::with_capacity(4 + 32 + 32);
    data.extend_from_slice(&NONCE_PRECOMPILE_GET_NONCE_SELECTOR);
    let mut address_word = [0u8; 32];
    address_word[12..].copy_from_slice(user_address.as_slice());
    data.extend_from_slice(&address_word);
    let nonce_key_word = U256::from(nonce_key).to_be_bytes::<32>();
    data.extend_from_slice(&nonce_key_word);

    let out = eth_call(rpc_url, nonce_precompile, &data)?;
    if out.len() < 32 {
        return Err(format!(
            "nonce precompile returned too few bytes: expected >=32, got {}",
            out.len()
        ));
    }
    Ok(U256::from_be_slice(&out[out.len() - 32..]))
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

    let mut fields = vec![
        RlpValue::Integer(tx.chain_id),
        RlpValue::Integer(tx.max_priority_fee_per_gas),
        RlpValue::Integer(tx.max_fee_per_gas),
        RlpValue::Integer(tx.gas_limit),
        RlpValue::List(calls),
        RlpValue::List(Vec::new()),
        RlpValue::Integer(tx.nonce_key),
        RlpValue::Integer(tx.nonce),
        RlpValue::Integer(U256::ZERO),
        RlpValue::Integer(U256::ZERO),
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

fn receipt_poll_timeout_secs() -> u64 {
    std::env::var("HEAVEN_SCROBBLE_RECEIPT_TIMEOUT_SECS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|secs| *secs > 0)
        .unwrap_or(DEFAULT_RECEIPT_POLL_TIMEOUT_SECS)
}
