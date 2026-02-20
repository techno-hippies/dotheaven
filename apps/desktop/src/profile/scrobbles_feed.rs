use std::collections::HashMap;
use std::env;
use std::str::FromStr;

#[path = "scrobbles_feed/chain.rs"]
mod chain;
mod format;

use alloy_primitives::{keccak256, B256};
use alloy_sol_types::{sol, SolCall};
use serde_json::{json, Value};

use crate::shared::rpc::rpc_json;
use format::{format_time_ago, short_track_label};

use super::model::ProfileScrobbleRow;

const DEFAULT_TEMPO_RPC_URL: &str = "https://rpc.moderato.tempo.xyz";
const DEFAULT_TEMPO_SCROBBLE_V4: &str = "0xe00e82086480E61AaC8d5ad8B05B56A582dD0000";
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

    let rpc_url = tempo_rpc_url();
    let scrobble_contract = tempo_scrobble_contract();
    let events =
        chain::fetch_scrobbled_events(&rpc_url, &scrobble_contract, &user_address, max_entries)?;
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

    let track_map =
        chain::fetch_track_metadata_map_onchain(&rpc_url, &scrobble_contract, &track_ids);
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

fn parse_hex_u64_quantity(value: &str) -> Result<u64, String> {
    let clean = strip_0x(value);
    if clean.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(clean, 16).map_err(|e| format!("invalid hex quantity '{value}': {e}"))
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
