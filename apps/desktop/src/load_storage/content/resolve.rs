use super::*;

fn query_piece_cid_by_tags(filters: Vec<Value>) -> Result<Option<String>, String> {
    let payload = http_post_json(
        &format!("{}/tags/query", load_agent_url()),
        json!({
            "filters": filters,
            "first": 16,
            "include_tags": true,
        }),
    )?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut first_candidate: Option<String> = None;
    let mut best_timestamp_candidate: Option<(i64, String)> = None;

    for item in items {
        if item_has_heaven_type(&item, "content-key-envelope") {
            continue;
        }

        let id = item
            .get("dataitem_id")
            .and_then(Value::as_str)
            .or_else(|| item.get("dataitemId").and_then(Value::as_str))
            .or_else(|| item.get("id").and_then(Value::as_str))
            .map(str::trim)
            .unwrap_or_default();
        if !id.is_empty() {
            let id = id.to_string();
            if first_candidate.is_none() {
                first_candidate = Some(id.clone());
            }
            if let Some(timestamp) = item_timestamp_hint(&item) {
                match &best_timestamp_candidate {
                    Some((best_ts, _)) if *best_ts >= timestamp => {}
                    _ => best_timestamp_candidate = Some((timestamp, id.clone())),
                }
            }
        }
    }

    Ok(best_timestamp_candidate
        .map(|(_, id)| id)
        .or(first_candidate))
}

fn item_has_heaven_type(item: &Value, expected: &str) -> bool {
    let Some(tags) = item.get("tags").and_then(Value::as_array) else {
        return false;
    };
    for tag in tags {
        let name = tag
            .get("name")
            .and_then(Value::as_str)
            .or_else(|| tag.get("key").and_then(Value::as_str))
            .map(str::trim)
            .unwrap_or_default();
        if !name.eq_ignore_ascii_case("Heaven-Type") {
            continue;
        }
        let value = tag
            .get("value")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();
        if value.eq_ignore_ascii_case(expected) {
            return true;
        }
    }
    false
}

fn item_timestamp_hint(item: &Value) -> Option<i64> {
    for key in [
        "created_at",
        "createdAt",
        "timestamp",
        "ingested_at",
        "ingestedAt",
        "updated_at",
        "updatedAt",
    ] {
        if let Some(value) = item.get(key) {
            if let Some(ts) = json_value_to_i64(value) {
                return Some(ts);
            }
        }
    }
    None
}

fn json_value_to_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(num) => num
            .as_i64()
            .or_else(|| num.as_u64().and_then(|v| i64::try_from(v).ok())),
        Value::String(raw) => raw
            .trim()
            .parse::<i64>()
            .ok()
            .or_else(|| raw.trim().parse::<f64>().ok().map(|v| v as i64)),
        _ => None,
    }
}

fn resolve_tempo_offchain_piece_cid(
    owner_address: &str,
    track_id_hex: &str,
    content_id_hex: &str,
) -> Result<Option<(String, &'static str)>, String> {
    let owner = owner_address.to_lowercase();
    let current = query_piece_cid_by_tags(vec![
        json!({"key": "Track-Id", "value": track_id_hex}),
        json!({"key": "Content-Id", "value": content_id_hex}),
        json!({"key": "Owner", "value": owner}),
    ])?;
    if let Some(piece_cid) = current {
        return Ok(Some((piece_cid, "tempo-load-index-v1")));
    }

    // Legacy fallback: older desktop builds wrote Content-Id with trackId value.
    let legacy = query_piece_cid_by_tags(vec![
        json!({"key": "Content-Id", "value": track_id_hex}),
        json!({"key": "Owner", "value": owner}),
    ])?;
    if let Some(piece_cid) = legacy {
        return Ok(Some((piece_cid, "tempo-load-index-legacy-v1")));
    }

    Ok(None)
}

impl LoadStorageService {
    pub fn resolve_registered_content_by_track_id(
        &mut self,
        auth: &PersistedAuth,
        track_id_hex: &str,
    ) -> Result<Value, String> {
        let owner = auth
            .wallet_address()
            .ok_or("Missing wallet address in auth")?;
        let owner_norm = owner.to_lowercase();

        let track_id_norm = normalize_bytes32_hex(track_id_hex, "trackId")?;
        let track_id_bytes = decode_bytes32_hex(&track_id_norm, "trackId")?;
        let track_id = B256::from(track_id_bytes);
        let content_id = compute_content_id(track_id, owner)?;
        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();

        if let Some((piece_cid, register_version)) =
            resolve_tempo_offchain_piece_cid(&owner_norm, &track_id_norm, &content_id_hex)?
        {
            return Ok(json!({
                "trackId": track_id_norm,
                "contentId": content_id_hex,
                "pieceCid": piece_cid,
                "gatewayUrl": format!("{}/resolve/{}", load_gateway_url(), piece_cid),
                "registerVersion": register_version,
                "txHash": Value::Null,
                "blockNumber": Value::Null,
            }));
        }

        Err(format!(
            "No offchain Tempo upload found for trackId={} contentId={} owner={}",
            track_id_norm, content_id_hex, owner_norm
        ))
    }

    pub fn resolve_registered_content_for_track(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
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
            .wallet_address()
            .ok_or("Missing wallet address in auth")?;
        let owner_norm = owner.to_lowercase();

        let track_id = build_track_id(&title, &artist, &album, mbid.as_deref(), ip_id.as_deref())?;
        let content_id = compute_content_id(track_id, owner)?;
        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();
        let track_id_hex = to_hex_prefixed(track_id.as_slice()).to_lowercase();

        if let Some((piece_cid, register_version)) =
            resolve_tempo_offchain_piece_cid(&owner_norm, &track_id_hex, &content_id_hex)?
        {
            return Ok(json!({
                "trackId": track_id_hex,
                "contentId": content_id_hex,
                "pieceCid": piece_cid,
                "gatewayUrl": format!("{}/resolve/{}", load_gateway_url(), piece_cid),
                "registerVersion": register_version,
                "txHash": Value::Null,
                "blockNumber": Value::Null,
            }));
        }

        Err(format!(
            "No offchain Tempo upload found for trackId={} contentId={} owner={}",
            track_id_hex, content_id_hex, owner_norm
        ))
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
}
