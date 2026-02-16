use super::*;

pub(crate) fn normalize_content_id_hex(content_id_hex: &str) -> Result<String, String> {
    let raw = content_id_hex.trim();
    if raw.is_empty() {
        return Err("contentId is empty".to_string());
    }
    let raw = raw.strip_prefix("0x").unwrap_or(raw);
    if raw.len() > 64 {
        return Err(format!(
            "contentId too long: expected <= 32 bytes, got {} bytes",
            raw.len() / 2
        ));
    }
    let decoded =
        hex::decode(raw).map_err(|e| format!("Invalid contentId hex ({content_id_hex}): {e}"))?;
    if decoded.is_empty() || decoded.len() > 32 {
        return Err(format!(
            "Invalid contentId byte length: expected 1..=32, got {}",
            decoded.len()
        ));
    }

    let mut out = [0u8; 32];
    let start = 32 - decoded.len();
    out[start..].copy_from_slice(&decoded);
    Ok(to_hex_prefixed(&out).to_lowercase())
}

pub(crate) fn decode_hex_32(content_id_hex: &str) -> Result<[u8; 32], String> {
    let normalized = normalize_content_id_hex(content_id_hex)?;
    let raw = normalized.trim_start_matches("0x");
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid contentId hex: {e}"))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid contentId byte length after normalization: {}",
            decoded.len()
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&decoded);
    Ok(out)
}

pub(crate) fn normalize_bytes32_hex(value: &str, label: &str) -> Result<String, String> {
    let raw = value.trim();
    if raw.is_empty() {
        return Err(format!("{label} is empty"));
    }
    let raw = raw.strip_prefix("0x").unwrap_or(raw);
    if raw.len() > 64 {
        return Err(format!(
            "{label} too long: expected <= 32 bytes, got {} bytes",
            raw.len() / 2
        ));
    }
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid {label} hex ({value}): {e}"))?;
    if decoded.is_empty() || decoded.len() > 32 {
        return Err(format!(
            "Invalid {label} byte length: expected 1..=32, got {}",
            decoded.len()
        ));
    }

    let mut out = [0u8; 32];
    let start = 32 - decoded.len();
    out[start..].copy_from_slice(&decoded);
    Ok(to_hex_prefixed(&out).to_lowercase())
}

pub(crate) fn decode_bytes32_hex(value: &str, label: &str) -> Result<[u8; 32], String> {
    let normalized = normalize_bytes32_hex(value, label)?;
    let raw = normalized.trim_start_matches("0x");
    let decoded = hex::decode(raw).map_err(|e| format!("Invalid {label} hex: {e}"))?;
    if decoded.len() != 32 {
        return Err(format!(
            "Invalid {label} byte length after normalization: {}",
            decoded.len()
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&decoded);
    Ok(out)
}

pub(crate) fn decode_eth_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let trimmed = value.trim();
    let stripped = trimmed.strip_prefix("0x").unwrap_or(trimmed);
    if stripped.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(stripped).map_err(|e| format!("Invalid hex bytes from RPC: {e}"))
}

pub(crate) fn infer_title_artist_album(file_path: &str) -> (String, String, String) {
    let base = Path::new(file_path)
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("Unknown Track");
    let stem = base.rsplit_once('.').map(|(s, _)| s).unwrap_or(base).trim();

    let parts: Vec<&str> = stem.split(" - ").collect();
    if parts.len() >= 2 {
        let artist = parts[0].trim();
        let title = parts[1..].join(" - ").trim().to_string();
        if !artist.is_empty() && !title.is_empty() {
            return (title, artist.to_string(), String::new());
        }
    }

    (
        if stem.is_empty() {
            "Unknown Track".to_string()
        } else {
            stem.to_string()
        },
        "Unknown Artist".to_string(),
        String::new(),
    )
}

pub(crate) fn normalize_string(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn build_track_id(
    title: &str,
    artist: &str,
    album: &str,
    mbid: Option<&str>,
    ip_id: Option<&str>,
) -> Result<B256, String> {
    let (kind, payload) = if let Some(mbid) = mbid {
        let cleaned = mbid.replace('-', "");
        let raw = hex::decode(cleaned).map_err(|e| format!("Invalid MBID hex: {e}"))?;
        if raw.len() != 16 {
            return Err(format!(
                "Invalid MBID length: expected 16 bytes, got {}",
                raw.len()
            ));
        }
        let mut payload = [0u8; 32];
        payload[..16].copy_from_slice(&raw);
        (1u8, B256::from(payload))
    } else if let Some(ip_id) = ip_id {
        let normalized = if ip_id.starts_with("0x") {
            ip_id.to_string()
        } else {
            format!("0x{ip_id}")
        };
        let addr = normalized
            .parse::<Address>()
            .map_err(|e| format!("Invalid ipId address: {e}"))?;
        let mut payload = [0u8; 32];
        payload[12..].copy_from_slice(addr.as_slice());
        (2u8, B256::from(payload))
    } else {
        let payload = keccak256(
            (
                normalize_string(title),
                normalize_string(artist),
                normalize_string(album),
            )
                .abi_encode(),
        );
        (3u8, payload)
    };

    let mut kind_word = [0u8; 32];
    kind_word[31] = kind;
    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(&kind_word);
    buf.extend_from_slice(payload.as_slice());
    Ok(keccak256(buf))
}

pub(crate) fn compute_content_id(track_id: B256, owner: &str) -> Result<B256, String> {
    let owner = owner
        .parse::<Address>()
        .map_err(|e| format!("Invalid owner address: {e}"))?;

    let mut owner_word = [0u8; 32];
    owner_word[12..].copy_from_slice(owner.as_slice());

    let mut buf = Vec::with_capacity(64);
    buf.extend_from_slice(track_id.as_slice());
    buf.extend_from_slice(&owner_word);
    Ok(keccak256(buf))
}

pub(crate) fn bytes_from_piece_cid(value: &str) -> Result<Vec<u8>, String> {
    if value.starts_with("0x") {
        return hex::decode(value.trim_start_matches("0x"))
            .map_err(|e| format!("Invalid hex pieceCid: {e}"));
    }
    Ok(value.as_bytes().to_vec())
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let out = hasher.finalize();
    hex::encode(out)
}

pub(crate) fn to_hex_prefixed(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}
