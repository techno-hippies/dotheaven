use super::*;

pub(super) fn query_envelope_ids(
    content_id_hex: &str,
    owner_address: &str,
    grantee_address: &str,
) -> Result<Vec<String>, String> {
    let payload = http_post_json(
        &format!("{}/tags/query", load_agent_url()),
        json!({
            "filters": [
                {"key": "App-Name", "value": "Heaven"},
                {"key": "Heaven-Type", "value": ENVELOPE_TAG_TYPE},
                {"key": "Content-Id", "value": content_id_hex},
                {"key": "Owner", "value": owner_address},
                {"key": "Grantee", "value": grantee_address},
            ],
            "first": 8,
            "include_tags": false,
        }),
    )?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::<String>::new();
    for item in items {
        let id = item
            .get("dataitem_id")
            .and_then(Value::as_str)
            .or_else(|| item.get("dataitemId").and_then(Value::as_str))
            .or_else(|| item.get("id").and_then(Value::as_str))
            .map(str::trim)
            .unwrap_or_default();
        if !id.is_empty() {
            out.push(id.to_string());
        }
    }
    Ok(out)
}

pub(super) fn fetch_resolve_payload(dataitem_id: &str) -> Result<Vec<u8>, String> {
    let id = dataitem_id.trim();
    if id.is_empty() {
        return Err("Envelope dataitem id is empty".to_string());
    }
    http_get_bytes(&format!("{}/resolve/{id}", load_gateway_url()))
}

pub(super) fn parse_envelope_payload(
    payload: &[u8],
    expected_content_id: &str,
    expected_owner: &str,
    expected_grantee: &str,
) -> Option<EciesEnvelope> {
    let json: Value = serde_json::from_slice(payload).ok()?;
    if json.get("version").and_then(Value::as_u64).unwrap_or(0) != 1 {
        return None;
    }

    let content_id = json
        .get("contentId")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if content_id != expected_content_id.to_lowercase() {
        return None;
    }
    let owner = json
        .get("owner")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if owner != expected_owner.to_lowercase() {
        return None;
    }
    let grantee = json
        .get("grantee")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if grantee != expected_grantee.to_lowercase() {
        return None;
    }

    let ephemeral_pub = decode_hex_bytes(
        json.get("ephemeralPub")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "envelope ephemeralPub",
    )
    .ok()?;
    let iv = decode_hex_bytes(
        json.get("iv").and_then(Value::as_str).unwrap_or_default(),
        "envelope iv",
    )
    .ok()?;
    let ciphertext = decode_hex_bytes(
        json.get("ciphertext")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "envelope ciphertext",
    )
    .ok()?;
    if ephemeral_pub.len() != 65 || iv.len() != 12 || ciphertext.is_empty() {
        return None;
    }

    Some(EciesEnvelope {
        ephemeral_pub,
        iv,
        ciphertext,
    })
}
