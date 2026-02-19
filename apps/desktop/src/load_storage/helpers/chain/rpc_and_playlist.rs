use super::*;

pub(crate) fn eth_call_raw(rpc_url: &str, to: &str, data_hex: &str) -> Result<Vec<u8>, String> {
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

pub(crate) fn fetch_content_registry_entry(
    content_id_hex: &str,
) -> Result<ContentRegistryEntry, String> {
    let content_id = decode_hex_32(content_id_hex)?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"getContent(bytes32)")[..4]);
    call_data.extend_from_slice(&content_id);

    let output = eth_call_raw(
        &tempo_rpc_url(),
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

pub(crate) fn playlist_track_input_to_json(track: &PlaylistTrackInput) -> Result<Value, String> {
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

pub(crate) fn filebase_covers_plaintext_key() -> Option<String> {
    std::env::var("HEAVEN_FILEBASE_COVERS_KEY")
        .ok()
        .or_else(|| std::env::var("FILEBASE_COVERS_API_KEY").ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub(crate) fn normalize_lit_action_response(raw: Value, label: &str) -> Result<Value, String> {
    match raw {
        Value::Object(_) => Ok(raw),
        Value::String(s) => serde_json::from_str::<Value>(&s)
            .map_err(|e| format!("{label} response parse failed: {e}; raw={}", s)),
        other => Err(format!("Unexpected {label} response type: {other}")),
    }
}

pub(crate) fn fetch_playlist_user_nonce(user_address: &str) -> Result<String, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;

    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"ownerNonces(address)")[..4]);
    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);

    let output = eth_call_raw(
        &tempo_rpc_url(),
        &playlist_v1(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Err("PlaylistV1 ownerNonces returned empty response".to_string());
    }

    let decoded = abi_decode(&[ParamType::Uint(256)], &output)
        .map_err(|e| format!("Failed decoding PlaylistV1 ownerNonces response: {e}"))?;
    match decoded.first() {
        Some(Token::Uint(v)) => Ok(v.to_string()),
        other => Err(format!(
            "Unexpected PlaylistV1 ownerNonces response payload: {other:?}"
        )),
    }
}
