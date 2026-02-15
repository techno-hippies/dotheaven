use super::*;

pub(super) fn derive_track_kind_and_payload(
    track: &SubmitScrobbleInput,
) -> Result<(u8, B256), String> {
    if let Some(mbid) = track.mbid.as_ref().filter(|m| !m.trim().is_empty()) {
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
        return Ok((1, B256::from(payload)));
    }

    if let Some(ip_id) = track.ip_id.as_ref().filter(|id| !id.trim().is_empty()) {
        let normalized = if ip_id.starts_with("0x") {
            ip_id.clone()
        } else {
            format!("0x{ip_id}")
        };
        let addr = normalized
            .parse::<Address>()
            .map_err(|e| format!("Invalid ipId address: {e}"))?;
        let mut payload = [0u8; 32];
        payload[12..].copy_from_slice(addr.as_slice());
        return Ok((2, B256::from(payload)));
    }

    let payload = keccak256(
        (
            normalize_string(&track.title),
            normalize_string(&track.artist),
            normalize_string(track.album.as_deref().unwrap_or_default()),
        )
            .abi_encode(),
    );
    Ok((3, payload))
}

fn normalize_string(input: &str) -> String {
    input
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn compute_track_id(kind: u8, payload: B256) -> B256 {
    let mut buf = Vec::with_capacity(64);
    let mut kind_word = [0u8; 32];
    kind_word[31] = kind;
    buf.extend_from_slice(&kind_word);
    buf.extend_from_slice(payload.as_slice());
    keccak256(buf)
}
