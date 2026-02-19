use super::*;

pub(crate) fn convert_tags(tags: &[Value]) -> Vec<Tag> {
    let mut out = Vec::new();
    for tag in tags {
        let name = tag
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");
        let value = tag
            .get("value")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");
        if name.is_empty() || value.is_empty() {
            continue;
        }
        out.push(Tag::new(name, value));
    }
    out
}

pub(crate) fn upload_signed_dataitem(signed_dataitem: &[u8]) -> Result<UploadResult, String> {
    let token = load_turbo_upload_token();
    let endpoint = format!("{}/v1/tx/{}", load_turbo_upload_url(), token);

    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .send(signed_dataitem)
        .map_err(|e| format!("Load upload request failed: {e}"))?;

    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        let message = body
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("Load upload failed with status {status}"));
        return Err(format!("{message}; endpoint={endpoint}"));
    }

    let id = extract_upload_id(&body).ok_or("Upload succeeded but no dataitem id was returned")?;
    let gateway_base = extract_gateway_base(&body).unwrap_or_else(load_gateway_url);

    Ok(UploadResult {
        id: id.clone(),
        gateway_url: format!("{}/resolve/{}", gateway_base.trim_end_matches('/'), id),
        winc: body.get("winc").and_then(Value::as_str).map(str::to_string),
    })
}

pub(crate) fn extract_gateway_base(payload: &Value) -> Option<String> {
    let direct = payload
        .get("dataCaches")
        .or_else(|| payload.get("data_caches"))
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);

    if direct.is_some() {
        return direct;
    }

    payload
        .get("gateway")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

pub(crate) fn build_blob(
    encrypted_key_bytes: &[u8],
    key_hash_bytes: &[u8],
    iv: &[u8; 12],
    encrypted_audio: &[u8],
) -> Vec<u8> {
    let header_size =
        4 + encrypted_key_bytes.len() + 4 + key_hash_bytes.len() + 1 + 1 + iv.len() + 4;

    let mut out = Vec::with_capacity(header_size + encrypted_audio.len());
    out.extend_from_slice(&(encrypted_key_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(encrypted_key_bytes);

    out.extend_from_slice(&(key_hash_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(key_hash_bytes);

    out.push(ALGO_AES_GCM_256);
    out.push(iv.len() as u8);
    out.extend_from_slice(iv);

    out.extend_from_slice(&(encrypted_audio.len() as u32).to_be_bytes());
    out.extend_from_slice(encrypted_audio);
    out
}

pub(crate) fn normalize_execute_response(raw: Value) -> Result<Value, String> {
    match raw {
        Value::String(s) => serde_json::from_str::<Value>(&s)
            .map_err(|e| format!("Failed to parse content register response JSON: {e}")),
        Value::Object(_) => Ok(raw),
        other => Err(format!(
            "Unexpected content register response type: {other}"
        )),
    }
}

pub(crate) fn infer_content_type(file_path: Option<&str>) -> &'static str {
    let lower = file_path.unwrap_or_default().to_ascii_lowercase();
    if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".m4a") {
        "audio/mp4"
    } else if lower.ends_with(".aac") {
        "audio/aac"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".ogg") || lower.ends_with(".opus") {
        "audio/ogg"
    } else {
        "application/octet-stream"
    }
}

pub(crate) fn extract_upload_id(payload: &Value) -> Option<String> {
    let direct_keys = ["id", "dataitem_id", "dataitemId"];
    for key in direct_keys {
        if let Some(id) = payload.get(key).and_then(Value::as_str) {
            if !id.trim().is_empty() {
                return Some(id.trim().to_string());
            }
        }
    }

    if let Some(result) = payload.get("result") {
        for key in direct_keys {
            if let Some(id) = result.get(key).and_then(Value::as_str) {
                if !id.trim().is_empty() {
                    return Some(id.trim().to_string());
                }
            }
        }
    }

    None
}
