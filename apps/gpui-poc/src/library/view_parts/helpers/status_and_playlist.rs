use super::*;
use crate::load_storage::PlaylistCoverImageInput;
use image::imageops::FilterType;
use std::path::Path;

const PLAYLIST_MODAL_MAX_COVER_BYTES: usize = 5 * 1024 * 1024;
// The playlist Lit Action supports up to 5MB covers, but embedding large base64 into executeJs
// params can exceed Lit node/proxy body limits (413). Keep playlist covers small on the client.
const PLAYLIST_MODAL_MAX_INLINE_COVER_BYTES: usize = 100 * 1024;

const PLAYLIST_COVER_JPEG_QUALITIES: &[u8] = &[
    88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24,
];
const PLAYLIST_COVER_MAX_DIMS: &[u32] = &[512, 448, 384, 320, 256, 224, 192, 160, 128, 96, 64];

pub(in crate::library) fn parse_duration_seconds(duration: &str) -> u64 {
    let mut values = [0_u64; 3];
    let mut count = 0_usize;
    for part in duration.trim().split(':') {
        if count >= values.len() {
            return 0;
        }
        values[count] = part.parse::<u64>().unwrap_or(0);
        count += 1;
    }

    match count {
        2 => values[0] * 60 + values[1],
        3 => values[0] * 3600 + values[1] * 60 + values[2],
        _ => 0,
    }
}

pub(in crate::library) fn abbreviate_for_status(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() <= 20 {
        return trimmed.to_string();
    }
    format!(
        "{}...{}",
        &trimmed[..10],
        &trimmed[trimmed.len().saturating_sub(8)..]
    )
}

pub(in crate::library) fn is_needs_reauth_error(raw: &str) -> bool {
    raw.contains("[NEEDS_REAUTH]")
}

pub(in crate::library) fn needs_reauth_prompt_message() -> String {
    "Session expired — sign in again to continue.".to_string()
}

pub(in crate::library) fn summarize_status_error(raw: &str) -> String {
    let compact = raw.replace('\n', " ").replace('\r', " ");
    let compact = compact.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = compact.to_ascii_lowercase();

    if lower.contains("already uploaded")
        || lower.contains("already exists")
        || lower.contains("content already registered")
    {
        return "Track already uploaded from this wallet. Use Share instead.".to_string();
    }

    if lower.contains("access denied on contentaccessmirror") {
        return "This wallet is not authorized yet. Ask the owner to share again, then retry in a few seconds.".to_string();
    }

    if lower.contains("incompatible with current lit decryption context")
        || lower.contains("encrypted payload decryption failed")
    {
        return "Shared decrypt failed due to an incompatible encrypted payload. Ask the owner to re-upload and share again.".to_string();
    }

    if compact.len() <= 180 {
        compact
    } else {
        format!("{}...", &compact[..180])
    }
}

pub(in crate::library) fn parse_number_field(value: Option<&serde_json::Value>) -> usize {
    match value {
        Some(v) if v.is_number() => v.as_u64().unwrap_or_default() as usize,
        Some(v) if v.is_string() => v
            .as_str()
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or_default() as usize,
        _ => 0,
    }
}

pub(in crate::library) fn parse_playlist_summaries(
    raw: &serde_json::Value,
) -> Vec<PlaylistSummary> {
    let mut out = Vec::<PlaylistSummary>::new();
    let entries = raw.as_array().cloned().unwrap_or_default();
    for entry in entries {
        let Some(id) = entry.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let id = id.trim().to_lowercase();
        if id.is_empty() {
            continue;
        }
        let name = entry
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("Untitled Playlist")
            .to_string();
        let cover_cid = entry
            .get("coverCid")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let visibility = parse_number_field(entry.get("visibility")).min(255) as u8;
        let track_count = parse_number_field(entry.get("trackCount"));

        out.push(PlaylistSummary {
            id,
            name,
            cover_cid,
            visibility,
            track_count,
        });
    }
    out
}

pub(in crate::library) fn playlist_track_input_from_track(track: &TrackRow) -> PlaylistTrackInput {
    let cover_image = match playlist_cover_image_input_from_path(track.cover_path.as_deref()) {
        Ok(image) => image,
        Err(err) => {
            if let Some(path) = track.cover_path.as_deref() {
                log::warn!(
                    "[Library] skipping playlist track cover image for '{}' ({}): {}",
                    track.title,
                    path,
                    summarize_status_error(&err)
                );
            }
            None
        }
    };

    PlaylistTrackInput {
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: if track.album.trim().is_empty() {
            None
        } else {
            Some(track.album.clone())
        },
        mbid: track
            .mbid
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        ip_id: track
            .ip_id
            .as_ref()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        cover_cid: None,
        cover_image,
    }
}

pub(in crate::library) fn playlist_cover_image_input_from_path(
    path: Option<&str>,
) -> Result<Option<PlaylistCoverImageInput>, String> {
    let Some(path) = path.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };

    let cover_file = Path::new(path);
    if !cover_file.exists() {
        return Err(format!("Cover image not found on disk: {path}"));
    }

    let bytes = std::fs::read(cover_file)
        .map_err(|e| format!("Failed reading cover image ({path}): {e}"))?;
    if bytes.is_empty() {
        return Err(format!("Cover image is empty: {path}"));
    }
    if bytes.len() > PLAYLIST_MODAL_MAX_COVER_BYTES {
        return Err(format!(
            "Cover image exceeds 5 MB limit ({} bytes): {}",
            bytes.len(),
            path
        ));
    }

    // If already small enough, embed directly (keeps original type).
    if bytes.len() <= PLAYLIST_MODAL_MAX_INLINE_COVER_BYTES {
        let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        let content_type = playlist_cover_content_type(path);
        return Ok(Some(PlaylistCoverImageInput {
            base64,
            content_type: content_type.to_string(),
        }));
    }

    // Otherwise, decode + resize + re-encode as JPEG <= 100KB to avoid 413 payload-too-large errors.
    let prepared = prepare_cover_for_playlist_modal(&bytes).map_err(|e| {
        format!(
            "Cover image too large to embed ({}) and resize failed: {e}",
            path
        )
    })?;
    let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &prepared);
    let content_type = "image/jpeg";

    Ok(Some(PlaylistCoverImageInput {
        base64,
        content_type: content_type.to_string(),
    }))
}

fn playlist_cover_content_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}

fn prepare_cover_for_playlist_modal(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let decoded =
        image::load_from_memory(bytes).map_err(|e| format!("image decode failed: {e}"))?;

    let max_side = decoded.width().max(decoded.height()).max(1);

    let mut bounds = Vec::<u32>::new();
    bounds.push(max_side.min(PLAYLIST_COVER_MAX_DIMS[0]));
    for &d in PLAYLIST_COVER_MAX_DIMS {
        if d < bounds[0] {
            bounds.push(d);
        }
    }

    for &bound in &bounds {
        let resized = if max_side > bound {
            decoded.resize(bound, bound, FilterType::Lanczos3)
        } else {
            decoded.clone()
        };

        for &quality in PLAYLIST_COVER_JPEG_QUALITIES {
            let jpeg = encode_jpeg_rgb8(&resized, quality)?;
            if jpeg.len() <= PLAYLIST_MODAL_MAX_INLINE_COVER_BYTES {
                return Ok(jpeg);
            }
        }
    }

    Err(format!(
        "unable to compress cover to <= {} bytes",
        PLAYLIST_MODAL_MAX_INLINE_COVER_BYTES
    ))
}

fn encode_jpeg_rgb8(img: &image::DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();

    let mut out = Vec::<u8>::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode(rgb.as_raw(), w, h, image::ColorType::Rgb8.into())
        .map_err(|e| format!("jpeg encode failed: {e}"))?;
    Ok(out)
}

pub(in crate::library) fn looks_like_hex_hash(value: &str) -> bool {
    let trimmed = value.trim();
    if !trimmed.starts_with("0x") || trimmed.len() < 10 {
        return false;
    }
    trimmed
        .chars()
        .skip(2)
        .all(|ch| ch.is_ascii_hexdigit() || ch == '.')
}

pub(in crate::library) fn needs_shared_metadata_enrichment(record: &SharedGrantRecord) -> bool {
    let title = record.title.trim();
    if title.is_empty() || looks_like_hex_hash(title) {
        return true;
    }
    if title.eq_ignore_ascii_case(record.content_id.trim()) {
        return true;
    }

    let artist = record.artist.trim();
    artist.is_empty() || looks_like_hex_hash(artist)
}
