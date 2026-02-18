use std::collections::HashMap;
use std::env;
use std::str::FromStr;

mod format;

use alloy_primitives::{keccak256, B256};
use alloy_sol_types::{sol, SolCall};
use serde_json::{json, Value};

use crate::shared::rpc::{http_get_json, rpc_json};
use format::{format_time_ago, sanitize_cover_ref, sanitize_string_field, short_track_label};

use super::model::ProfileScrobbleRow;

const DEFAULT_TEMPO_RPC_URL: &str = "https://rpc.moderato.tempo.xyz";
const DEFAULT_TEMPO_SCROBBLE_V4: &str = "0x07B8BdE8BaD74DC974F783AA71C7C51d6B37C363";
const SCROBBLED_EVENT_SIGNATURE: &str = "Scrobbled(address,bytes32,uint64)";
const DEFAULT_LOG_CHUNK_BLOCKS: u64 = 50_000;
const DEFAULT_MAX_LOG_SCAN_BLOCKS: u64 = 1_000_000;
const DEFAULT_EMPTY_CHUNKS_AFTER_HIT: u32 = 3;

sol! {
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
}

#[derive(Debug, Clone)]
struct ScrobbleMeta {
    title: String,
    artist: String,
    album: String,
    cover_cid: Option<String>,
}

#[derive(Debug, Clone)]
struct OnchainScrobbleEvent {
    track_id: String,
    timestamp: u64,
    block_number: u64,
    log_index: u64,
}

pub(super) fn fetch_scrobbles_for_user(
    user_address: &str,
    max_entries: usize,
) -> Result<Vec<ProfileScrobbleRow>, String> {
    let user_address = user_address.trim().to_ascii_lowercase();
    if user_address.is_empty() {
        return Ok(Vec::new());
    }

    if let Some(scrobble_api_base) = tempo_scrobble_api_base_url() {
        match fetch_scrobbles_from_tempo_indexer(&scrobble_api_base, &user_address, max_entries) {
            Ok(rows) => {
                if !rows.is_empty() {
                    log::info!(
                        "[ProfileFeed] scrobbles source=tempo-indexer base={} user={} rows={}",
                        scrobble_api_base,
                        user_address,
                        rows.len()
                    );
                    return Ok(rows);
                }
                log::info!(
                    "[ProfileFeed] scrobbles source=tempo-indexer base={} user={} rows=0 (falling back to onchain)",
                    scrobble_api_base,
                    user_address
                );
            }
            Err(err) => {
                log::warn!(
                    "[ProfileFeed] tempo indexer fetch failed (base={}): {}; falling back to onchain logs",
                    scrobble_api_base,
                    err
                );
            }
        }
    }

    let rpc_url = tempo_rpc_url();
    let scrobble_contract = tempo_scrobble_contract();
    let events = fetch_scrobbled_events(&rpc_url, &scrobble_contract, &user_address, max_entries)?;
    if events.is_empty() {
        log::info!(
            "[ProfileFeed] scrobbles source=onchain rpc={} contract={} user={} rows=0",
            rpc_url,
            scrobble_contract,
            user_address
        );
        return Ok(Vec::new());
    }

    let mut track_ids: Vec<String> = events.iter().map(|event| event.track_id.clone()).collect();
    track_ids.sort();
    track_ids.dedup();

    let track_map = fetch_track_metadata_map_onchain(&rpc_url, &scrobble_contract, &track_ids);
    let mut rows = Vec::with_capacity(events.len());
    for event in events {
        let meta = track_map
            .get(&event.track_id)
            .cloned()
            .unwrap_or_else(|| ScrobbleMeta {
                title: short_track_label(&event.track_id),
                artist: "Unknown Artist".to_string(),
                album: String::new(),
                cover_cid: None,
            });

        rows.push(ProfileScrobbleRow {
            track_id: Some(event.track_id),
            played_at_sec: event.timestamp,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            cover_cid: meta.cover_cid,
            played_ago: format_time_ago(event.timestamp),
        });
    }

    log::info!(
        "[ProfileFeed] scrobbles source=onchain rpc={} contract={} user={} rows={}",
        rpc_url,
        scrobble_contract,
        user_address,
        rows.len()
    );
    Ok(rows)
}

fn fetch_scrobbles_from_tempo_indexer(
    base_url: &str,
    user_address: &str,
    max_entries: usize,
) -> Result<Vec<ProfileScrobbleRow>, String> {
    let limit = max_entries.clamp(1, 200);
    let url = format!("{}/scrobbles/{}?limit={}", base_url, user_address, limit);
    let payload = http_get_json(&url)?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| "tempo indexer response missing items array".to_string())?;

    let mut rows = Vec::with_capacity(items.len());
    for item in items {
        let track = item.get("track").unwrap_or(&Value::Null);
        let track_id = item
            .get("trackId")
            .and_then(Value::as_str)
            .map(|v| v.trim().to_ascii_lowercase())
            .filter(|v| !v.is_empty());
        let played_at_sec = parse_u64_json_value(item.get("timestamp"))
            .or_else(|| parse_u64_json_value(item.get("blockTimestamp")))
            .unwrap_or(0);
        let title = sanitize_string_field(
            track
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            track_id
                .as_deref()
                .map(short_track_label)
                .as_deref()
                .unwrap_or("Unknown Track"),
        );
        let artist = sanitize_string_field(
            track
                .get("artist")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "Unknown Artist",
        );
        let album = sanitize_string_field(
            track
                .get("album")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "",
        );
        let cover_cid = sanitize_cover_ref(
            track
                .get("coverCid")
                .and_then(Value::as_str)
                .unwrap_or_default(),
        );

        rows.push(ProfileScrobbleRow {
            track_id,
            played_at_sec,
            title,
            artist,
            album,
            cover_cid,
            played_ago: format_time_ago(played_at_sec),
        });
    }

    Ok(rows)
}

fn tempo_rpc_url() -> String {
    env::var("HEAVEN_TEMPO_RPC_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            env::var("TEMPO_RPC_URL")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .unwrap_or_else(|| DEFAULT_TEMPO_RPC_URL.to_string())
}

fn tempo_scrobble_api_base_url() -> Option<String> {
    env::var("HEAVEN_TEMPO_SCROBBLE_API")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            env::var("TEMPO_SCROBBLE_API")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .map(|v| v.trim().trim_end_matches('/').to_string())
}

fn tempo_scrobble_contract() -> String {
    env::var("HEAVEN_TEMPO_SCROBBLE_V4")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            env::var("TEMPO_SCROBBLE_V4")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .unwrap_or_else(|| DEFAULT_TEMPO_SCROBBLE_V4.to_string())
}

fn fetch_scrobbled_events(
    rpc_url: &str,
    scrobble_contract: &str,
    user_address: &str,
    max_entries: usize,
) -> Result<Vec<OnchainScrobbleEvent>, String> {
    if max_entries == 0 {
        return Ok(Vec::new());
    }

    let latest_block = rpc_block_number(rpc_url)?;
    let mut to_block = latest_block;
    let chunk_blocks = log_chunk_blocks();
    let max_scan_blocks = max_log_scan_blocks();
    let empty_chunk_limit = max_empty_chunks_after_hit();
    let topic0 = format!(
        "0x{}",
        hex::encode(keccak256(SCROBBLED_EVENT_SIGNATURE.as_bytes()))
    );
    let topic1 = user_topic(user_address)?;

    let mut scanned_blocks = 0u64;
    let mut events = Vec::new();
    let mut empty_chunks_after_hit = 0u32;

    loop {
        if events.len() >= max_entries || scanned_blocks >= max_scan_blocks {
            break;
        }

        let remaining = max_scan_blocks.saturating_sub(scanned_blocks);
        if remaining == 0 {
            break;
        }
        let span = chunk_blocks.min(remaining).max(1);
        let from_block = to_block.saturating_sub(span.saturating_sub(1));

        let logs = match fetch_logs_range(
            rpc_url,
            scrobble_contract,
            &topic0,
            &topic1,
            from_block,
            to_block,
        ) {
            Ok(logs) => logs,
            Err(err) => {
                let range = format!("{from_block}..{to_block}");
                if events.is_empty() {
                    return Err(format!("eth_getLogs failed for range {range}: {err}"));
                }
                log::warn!(
                    "[ProfileFeed] stopping scrobble scan after partial results: range={} err={}",
                    range,
                    err
                );
                break;
            }
        };
        let event_count_before_chunk = events.len();
        for log in &logs {
            match parse_scrobbled_log(log) {
                Ok(Some(event)) => events.push(event),
                Ok(None) => {}
                Err(err) => log::debug!("[ProfileFeed] skip malformed scrobble log: {}", err),
            }
        }
        if events.len() == event_count_before_chunk {
            if !events.is_empty() {
                empty_chunks_after_hit = empty_chunks_after_hit.saturating_add(1);
                if empty_chunks_after_hit >= empty_chunk_limit {
                    break;
                }
            }
        } else {
            empty_chunks_after_hit = 0;
        }

        scanned_blocks += to_block.saturating_sub(from_block) + 1;
        if from_block == 0 {
            break;
        }
        to_block = from_block - 1;
    }

    events.sort_by(|a, b| {
        b.block_number
            .cmp(&a.block_number)
            .then_with(|| b.log_index.cmp(&a.log_index))
    });
    events.truncate(max_entries);
    Ok(events)
}

fn rpc_block_number(rpc_url: &str) -> Result<u64, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_blockNumber",
        "params": [],
    });
    let result = rpc_json(rpc_url, payload)?;
    let raw = result
        .as_str()
        .ok_or("eth_blockNumber returned non-string result".to_string())?;
    parse_hex_u64_quantity(raw)
}

fn fetch_logs_range(
    rpc_url: &str,
    scrobble_contract: &str,
    topic0: &str,
    topic1: &str,
    from_block: u64,
    to_block: u64,
) -> Result<Vec<Value>, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getLogs",
        "params": [{
            "address": scrobble_contract,
            "fromBlock": to_hex_quantity(from_block),
            "toBlock": to_hex_quantity(to_block),
            "topics": [topic0, topic1],
        }],
    });

    let result = rpc_json(rpc_url, payload)?;
    result
        .as_array()
        .cloned()
        .ok_or("eth_getLogs returned non-array result".to_string())
}

fn parse_scrobbled_log(log: &Value) -> Result<Option<OnchainScrobbleEvent>, String> {
    let topics = match log.get("topics").and_then(Value::as_array) {
        Some(v) if v.len() >= 3 => v,
        _ => return Ok(None),
    };
    let track_id = topics[2]
        .as_str()
        .map(|v| v.trim().to_ascii_lowercase())
        .filter(|v| v.starts_with("0x") && v.len() == 66)
        .ok_or("missing/invalid trackId topic".to_string())?;
    let timestamp = parse_abi_word_u64(
        log.get("data")
            .and_then(Value::as_str)
            .ok_or("missing data in log".to_string())?,
    )?;
    let block_number = parse_hex_u64_quantity(
        log.get("blockNumber")
            .and_then(Value::as_str)
            .ok_or("missing blockNumber in log".to_string())?,
    )?;
    let log_index = parse_hex_u64_quantity(
        log.get("logIndex")
            .and_then(Value::as_str)
            .ok_or("missing logIndex in log".to_string())?,
    )?;

    Ok(Some(OnchainScrobbleEvent {
        track_id,
        timestamp,
        block_number,
        log_index,
    }))
}

fn fetch_track_metadata_map_onchain(
    rpc_url: &str,
    scrobble_contract: &str,
    track_ids: &[String],
) -> HashMap<String, ScrobbleMeta> {
    let mut map = HashMap::new();
    for track_id in track_ids {
        match fetch_track_metadata_onchain(rpc_url, scrobble_contract, track_id) {
            Ok(meta) => {
                map.insert(track_id.clone(), meta);
            }
            Err(err) => {
                log::debug!("[ProfileFeed] getTrack failed for {}: {}", track_id, err);
            }
        }
    }
    map
}

fn fetch_track_metadata_onchain(
    rpc_url: &str,
    scrobble_contract: &str,
    track_id: &str,
) -> Result<ScrobbleMeta, String> {
    let track_id = B256::from_str(track_id).map_err(|e| format!("invalid trackId: {e}"))?;
    let data = getTrackCall { trackId: track_id }.abi_encode();
    let output = eth_call_raw(rpc_url, scrobble_contract, &data)?;
    let decoded = getTrackCall::abi_decode_returns(&output)
        .map_err(|e| format!("getTrack decode failed: {e}"))?;

    Ok(ScrobbleMeta {
        title: sanitize_string_field(&decoded.title, "Unknown Track"),
        artist: sanitize_string_field(&decoded.artist, "Unknown Artist"),
        album: sanitize_string_field(&decoded.album, ""),
        cover_cid: sanitize_cover_ref(&decoded.coverCid),
    })
}

fn eth_call_raw(rpc_url: &str, to: &str, data: &[u8]) -> Result<Vec<u8>, String> {
    let payload = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to,
                "data": format!("0x{}", hex::encode(data)),
            },
            "latest",
        ],
    });
    let result = rpc_json(rpc_url, payload)?;
    let raw = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    parse_hex_bytes(raw)
}

fn user_topic(user_address: &str) -> Result<String, String> {
    let clean = strip_0x(user_address);
    let bytes = hex::decode(clean).map_err(|e| format!("invalid user address hex: {e}"))?;
    if bytes.len() != 20 {
        return Err(format!(
            "invalid user address length: expected 20 bytes, got {}",
            bytes.len()
        ));
    }
    let mut topic = [0u8; 32];
    topic[12..].copy_from_slice(&bytes);
    Ok(format!("0x{}", hex::encode(topic)))
}

fn parse_hex_u64_quantity(value: &str) -> Result<u64, String> {
    let clean = strip_0x(value);
    if clean.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(clean, 16).map_err(|e| format!("invalid hex quantity '{value}': {e}"))
}

fn parse_u64_json_value(value: Option<&Value>) -> Option<u64> {
    let value = value?;
    if let Some(num) = value.as_u64() {
        return Some(num);
    }
    value
        .as_str()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
}

fn parse_abi_word_u64(value: &str) -> Result<u64, String> {
    let bytes = parse_hex_bytes(value)?;
    if bytes.len() < 32 {
        return Err(format!(
            "invalid abi word length: expected >= 32 bytes, got {}",
            bytes.len()
        ));
    }
    let tail = &bytes[bytes.len() - 8..];
    let mut out = [0u8; 8];
    out.copy_from_slice(tail);
    Ok(u64::from_be_bytes(out))
}

fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let clean = strip_0x(value);
    if clean.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(clean).map_err(|e| format!("invalid hex bytes '{value}': {e}"))
}

fn to_hex_quantity(value: u64) -> String {
    format!("0x{:x}", value)
}

fn log_chunk_blocks() -> u64 {
    env::var("HEAVEN_SCROBBLE_LOG_CHUNK_BLOCKS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_LOG_CHUNK_BLOCKS)
}

fn max_log_scan_blocks() -> u64 {
    env::var("HEAVEN_SCROBBLE_LOG_MAX_SCAN_BLOCKS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_MAX_LOG_SCAN_BLOCKS)
}

fn max_empty_chunks_after_hit() -> u32 {
    env::var("HEAVEN_SCROBBLE_LOG_EMPTY_CHUNKS_AFTER_HIT")
        .ok()
        .and_then(|v| v.trim().parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_EMPTY_CHUNKS_AFTER_HIT)
}

fn strip_0x(value: &str) -> &str {
    value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .unwrap_or(value)
}
