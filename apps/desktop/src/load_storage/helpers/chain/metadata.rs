use super::*;

pub(crate) fn fetch_track_id_for_content_subgraph(
    content_id_hex: &str,
) -> Result<Option<String>, String> {
    let content_id = normalize_content_id_hex(content_id_hex)?;
    let query = format!(
        "{{ contentEntries(where: {{ id: \"{content_id}\" }}, first: 1) {{ id trackId }} }}"
    );

    let payload = http_post_json(
        &subgraph_music_social_url(),
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

pub(crate) fn fetch_track_metadata_subgraph(
    track_id_hex: &str,
) -> Result<Option<(String, String, String)>, String> {
    let track_id = normalize_bytes32_hex(track_id_hex, "trackId")?;
    let query = format!(
        "{{ tracks(where: {{ id_in: [\"{track_id}\"] }}, first: 1) {{ id title artist album }} }}"
    );
    let payload = http_post_json(
        &subgraph_music_social_url(),
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

pub(crate) fn fetch_track_metadata_onchain(
    track_id_hex: &str,
) -> Result<Option<(String, String, String)>, String> {
    let track_id = decode_bytes32_hex(track_id_hex, "trackId")?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"getTrack(bytes32)")[..4]);
    call_data.extend_from_slice(&track_id);

    let output = eth_call_raw(
        &tempo_rpc_url(),
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
