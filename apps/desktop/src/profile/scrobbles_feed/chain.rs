use super::*;

pub(super) fn fetch_scrobbled_events(
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

pub(super) fn fetch_track_metadata_map_onchain(
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
