use super::*;

pub(super) fn sign_user_op_hash(
    lit: &mut LitWalletService,
    user_op_hash: B256,
) -> Result<String, String> {
    // SimpleAccount._validateSignature expects:
    //   ECDSA.recover(toEthSignedMessageHash(userOpHash), signature)
    // So we apply EIP-191 prefix, then sign via executeJs + Lit.Actions.signEcdsa.
    let eth_signed = alloy_primitives::utils::eip191_hash_message(user_op_hash.as_slice());
    let to_sign: Vec<u8> = eth_signed.as_slice().to_vec();

    let sig = lit.pkp_sign_via_execute_js(&to_sign)?;
    let (r, s, recid) = extract_lit_signature(&sig)?;
    let v = if recid >= 27 { recid } else { recid + 27 };
    let out = format!("0x{}{}{:02x}", r, s, v);
    // Validate hex shape locally so bundler errors point to real root-cause.
    let bytes = codec::parse_hex_bytes(&out)
        .map_err(|e| format!("invalid assembled signature hex: {e}; sig={sig}"))?;
    if bytes.len() != 65 {
        return Err(format!(
            "assembled signature must be 65 bytes, got {} bytes; sig={}",
            bytes.len(),
            sig
        ));
    }
    Ok(out)
}

fn extract_lit_signature(sig: &serde_json::Value) -> Result<(String, String, u8), String> {
    let recid = parse_recovery_id(sig).unwrap_or(0);

    // Prefer `signature` field from Lit response when present. It is usually the
    // canonical r||s material and avoids schema differences in r/s fields.
    if let Some(signature) = sig.get("signature").and_then(|v| v.as_str()) {
        let mut sig_hex = normalize_hex_no_prefix(signature)?;
        if sig_hex.len() == 130 {
            // r||s||v
            let v_hex = &sig_hex[128..130];
            let v = u8::from_str_radix(v_hex, 16).unwrap_or(recid);
            return Ok((sig_hex[..64].to_string(), sig_hex[64..128].to_string(), v));
        }
        if sig_hex.len() < 128 {
            return Err(format!(
                "Lit signature is shorter than 64 bytes (hex chars={}): {}",
                sig_hex.len(),
                sig
            ));
        }
        // Some providers append extra metadata bytes; keep only r||s.
        sig_hex.truncate(128);
        return Ok((
            sig_hex[..64].to_string(),
            sig_hex[64..128].to_string(),
            recid,
        ));
    }

    if let (Some(r), Some(s)) = (
        sig.get("r").and_then(|v| v.as_str()),
        sig.get("s").and_then(|v| v.as_str()),
    ) {
        return Ok((normalize_hex_word_32(r)?, normalize_hex_word_32(s)?, recid));
    }

    Err(format!("Unsupported Lit signature shape: {sig}"))
}

fn parse_recovery_id(sig: &serde_json::Value) -> Option<u8> {
    for key in ["recid", "recoveryId", "recovery_id", "v"] {
        let Some(value) = sig.get(key) else {
            continue;
        };
        if let Some(num) = value.as_u64() {
            return Some(num as u8);
        }
        if let Some(text) = value.as_str() {
            let text = text.trim();
            if let Ok(num) = text.parse::<u64>() {
                return Some(num as u8);
            }
            let hex = text
                .strip_prefix("0x")
                .or_else(|| text.strip_prefix("0X"))
                .unwrap_or(text);
            if let Ok(num) = u8::from_str_radix(hex, 16) {
                return Some(num);
            }
        }
    }
    None
}

fn normalize_hex_no_prefix(input: &str) -> Result<String, String> {
    let mut trimmed = input.trim();

    // Some Lit responses encode hex as a quoted JSON string, e.g. "\"abcd...\"".
    // Unwrap one layer (or more) of matching quotes before hex parsing.
    loop {
        let bytes = trimmed.as_bytes();
        if bytes.len() >= 2
            && ((bytes[0] == b'"' && bytes[bytes.len() - 1] == b'"')
                || (bytes[0] == b'\'' && bytes[bytes.len() - 1] == b'\''))
        {
            trimmed = trimmed[1..bytes.len() - 1].trim();
            continue;
        }
        break;
    }

    let mut hex = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed)
        .to_string();
    if hex.is_empty() {
        return Err("empty hex string".to_string());
    }
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("contains non-hex characters: {input}"));
    }
    if hex.len() % 2 != 0 {
        hex.insert(0, '0');
    }
    Ok(hex.to_lowercase())
}

fn normalize_hex_word_32(input: &str) -> Result<String, String> {
    let hex = normalize_hex_no_prefix(input)?;
    if hex.len() > 64 {
        // Allow occasional sign-extension / leading zeros.
        if hex[..hex.len() - 64].chars().all(|c| c == '0') {
            return Ok(hex[hex.len() - 64..].to_string());
        }
        return Err(format!(
            "hex word exceeds 32 bytes and is not zero-prefixed: {}",
            input
        ));
    }
    Ok(format!("{:0>64}", hex))
}
