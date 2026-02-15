use super::*;

pub(super) fn personal_sign_action_code() -> &'static str {
    r#"(async () => {
  const message =
    (jsParams && jsParams.message) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.message);
  const publicKey =
    (jsParams && jsParams.publicKey) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.publicKey);
  if (!message || !publicKey) {
    throw new Error("Missing message/publicKey in jsParams");
  }
  await Lit.Actions.ethPersonalSignMessageEcdsa({
    message,
    publicKey,
    sigName: "sig",
  });
})();"#
}

pub(super) fn extract_compact_signature_hex(sig: &serde_json::Value) -> Result<String, String> {
    if let Some(raw) = sig.get("signature").and_then(|v| v.as_str()) {
        return normalize_hex_like_string(raw);
    }

    let r = sig.get("r").and_then(|v| v.as_str()).ok_or_else(|| {
        format!(
            "Missing 'signature' or 'r' in sig: {}",
            truncate_for_log(&sig.to_string())
        )
    })?;
    let s = sig
        .get("s")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Missing 's' in sig: {}", truncate_for_log(&sig.to_string())))?;

    let r_clean = normalize_hex_like_string(r)?;
    let s_clean = normalize_hex_like_string(s)?;
    let r_no_prefix = r_clean.strip_prefix("0x").unwrap_or(&r_clean);
    let s_no_prefix = s_clean.strip_prefix("0x").unwrap_or(&s_clean);
    Ok(format!("{}{}", r_no_prefix, s_no_prefix))
}

pub(super) fn signature_value_to_65_bytes(raw_sig: &serde_json::Value) -> Result<Vec<u8>, String> {
    let sig = raw_sig.get("sig").unwrap_or(raw_sig);
    let sig_hex = extract_compact_signature_hex(sig)?;
    let clean_hex = sig_hex.strip_prefix("0x").unwrap_or(&sig_hex);
    let mut sig_bytes = hex::decode(clean_hex)
        .map_err(|e| format!("hex decode sig: {e}; sig={}", truncate_for_log(&sig_hex)))?;
    if sig_bytes.len() == 65 {
        let v = sig_bytes[64];
        sig_bytes[64] = if v < 27 { v + 27 } else { v };
        return Ok(sig_bytes);
    }

    if sig_bytes.len() != 64 {
        return Err(format!(
            "Invalid signature length: expected 64 or 65 bytes, got {}",
            sig_bytes.len()
        ));
    }

    let recovery_id = sig
        .get("recid")
        .and_then(|v| v.as_u64())
        .or_else(|| sig.get("recoveryId").and_then(|v| v.as_u64()))
        .or_else(|| sig.get("recovery_id").and_then(|v| v.as_u64()))
        .or_else(|| {
            sig.get("recid")
                .and_then(|v| v.as_str())
                .and_then(|v| v.parse::<u64>().ok())
        })
        .or_else(|| {
            sig.get("recoveryId")
                .and_then(|v| v.as_str())
                .and_then(|v| v.parse::<u64>().ok())
        })
        .or_else(|| {
            sig.get("recovery_id")
                .and_then(|v| v.as_str())
                .and_then(|v| v.parse::<u64>().ok())
        })
        .ok_or("Missing 'recid' field in sig")?;

    let v = if recovery_id >= 27 {
        recovery_id as u8
    } else {
        (recovery_id as u8) + 27
    };
    sig_bytes.push(v);
    Ok(sig_bytes)
}

pub(super) fn ethereum_personal_message_hash(message: &[u8]) -> [u8; 32] {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut payload = Vec::with_capacity(prefix.len() + message.len());
    payload.extend_from_slice(prefix.as_bytes());
    payload.extend_from_slice(message);
    let hash = keccak256(payload);
    let mut out = [0u8; 32];
    out.copy_from_slice(hash.as_slice());
    out
}

pub(super) fn normalize_hex_like_string(raw: &str) -> Result<String, String> {
    // Some Lit runtimes return a doubly-encoded JSON string like "\"0xabc...\"".
    let mut value = raw.trim().to_string();
    for _ in 0..2 {
        match serde_json::from_str::<String>(&value) {
            Ok(decoded) => value = decoded,
            Err(_) => break,
        }
    }

    value = value.trim().trim_matches('"').to_string();

    let no_prefix = value.strip_prefix("0x").unwrap_or(&value);
    if no_prefix.is_empty() || !no_prefix.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "Signature is not valid hex: {}",
            truncate_for_log(raw)
        ));
    }

    if no_prefix.len() % 2 != 0 {
        return Err(format!(
            "Signature hex has odd length ({}): {}",
            no_prefix.len(),
            truncate_for_log(raw)
        ));
    }

    if value.starts_with("0x") {
        Ok(value)
    } else {
        Ok(format!("0x{no_prefix}"))
    }
}

pub(super) fn truncate_for_log(value: &str) -> String {
    const MAX: usize = 140;
    if value.len() <= MAX {
        value.to_string()
    } else {
        format!("{}...", &value[..MAX])
    }
}

pub(super) fn sign_ecdsa_action_code() -> &'static str {
    r#"(async () => {
  const rawToSign =
    (jsParams && jsParams.toSign) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.toSign);
  const publicKey =
    (jsParams && jsParams.publicKey) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.publicKey);
  if (!rawToSign || !publicKey) {
    throw new Error("Missing toSign/publicKey in jsParams");
  }
  const toSign = new Uint8Array(rawToSign);
  await Lit.Actions.signEcdsa({
    toSign,
    publicKey,
    sigName: "sig",
  });
})();"#
}
