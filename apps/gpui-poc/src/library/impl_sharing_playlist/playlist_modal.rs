use super::*;

const PLAYLIST_PENDING_STALE_AFTER_MS: i64 = 90_000;

enum PlaylistMutationResult {
    Mutated {
        playlist_name: String,
        payload: Value,
        cover_warning: Option<String>,
        cover_cid: Option<String>,
    },
    DuplicateTrack {
        playlist_name: String,
    },
}

mod modal_lifecycle;
mod pending;
mod reauth;
mod remap;
mod sidebar;
mod submit;
mod submit_task;

fn extract_playlist_id_from_payload(payload: &Value) -> Option<String> {
    let candidates = [
        payload.get("playlistId").and_then(Value::as_str),
        payload.get("id").and_then(Value::as_str),
        payload
            .get("playlist")
            .and_then(Value::as_object)
            .and_then(|playlist| playlist.get("id"))
            .and_then(Value::as_str),
        payload
            .pointer("/result/playlistId")
            .and_then(Value::as_str),
        payload.pointer("/result/id").and_then(Value::as_str),
        payload.pointer("/data/playlistId").and_then(Value::as_str),
        payload.pointer("/data/id").and_then(Value::as_str),
    ];

    for id in candidates.into_iter().flatten() {
        if let Some(normalized) = normalize_playlist_id(id) {
            return Some(normalized);
        }
    }

    None
}

fn normalize_playlist_id(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lowered = trimmed.to_lowercase();
    let value = lowered.strip_prefix("0x").unwrap_or(&lowered);
    if value.is_empty() || value.len() > 64 {
        return None;
    }

    match hex::decode(value) {
        Ok(decoded) => {
            if decoded.is_empty() || decoded.len() > 32 {
                return None;
            }

            let mut out = [0u8; 32];
            let start = 32 - decoded.len();
            out[start..].copy_from_slice(&decoded);
            Some(format!("0x{}", hex::encode(out)))
        }
        Err(_) => {
            if lowered.starts_with("0x") {
                Some(lowered)
            } else {
                None
            }
        }
    }
}
