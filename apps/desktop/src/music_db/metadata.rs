use std::path::Path;

use lofty::prelude::*;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma"];

pub(super) fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn fallback_from_filename(name: &str) -> (String, String) {
    let base = match name.rfind('.') {
        Some(i) => &name[..i],
        None => name,
    };
    let clean = base.replace('_', " ");

    if let Some(idx) = clean.find(" - ") {
        let artist = clean[..idx].trim().to_string();
        let title = clean[idx + 3..].trim().to_string();
        if !artist.is_empty() && !title.is_empty() {
            return (title, artist);
        }
    }

    let trimmed = clean
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches(|c: char| c == '.' || c == ')' || c == '-')
        .trim_start();
    let title = if trimmed.is_empty() { &clean } else { trimmed };
    (title.to_string(), "Unknown Artist".to_string())
}

pub(super) fn format_duration_ms(ms: u64) -> String {
    let secs = ms / 1000;
    let m = secs / 60;
    let s = secs % 60;
    format!("{}:{:02}", m, s)
}

fn normalize_ip_id(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }

    let raw = if let Some(stripped) = trimmed.strip_prefix("0x") {
        stripped
    } else {
        trimmed
    };

    if raw.len() != 40 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    Some(format!("0x{}", raw.to_lowercase()))
}

/// Simple content hash using std — no sha2 crate needed.
fn content_hash(data: &[u8]) -> String {
    // Use a basic FNV-1a 64-bit hash for cover art dedup.
    // Not cryptographic, but fine for local file dedup.
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

pub(super) fn extract_metadata(
    path: &Path,
    path_str: &str,
    covers_dir: &Path,
) -> (
    String,
    String,
    String,
    Option<u64>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let (fb_title, fb_artist) = fallback_from_filename(file_name);

    match lofty::read_from_path(path) {
        Ok(tagged) => {
            let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
            let title = tag
                .and_then(|t| t.title().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .unwrap_or(fb_title);
            let artist = tag
                .and_then(|t| t.artist().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .unwrap_or(fb_artist);
            let album = tag
                .and_then(|t| t.album().map(|s| s.to_string()))
                .unwrap_or_default();
            let duration_ms = {
                let props = tagged.properties();
                let dur = props.duration();
                if dur.as_millis() > 0 {
                    Some(dur.as_millis() as u64)
                } else {
                    None
                }
            };
            let mbid = tag.and_then(|t| {
                t.get_string(&lofty::prelude::ItemKey::MusicBrainzRecordingId)
                    .map(|s| s.to_string())
            });
            let ip_id = tag.and_then(|t| {
                for key in ["IPID", "ipId", "ip_id", "story_ip_id", "storyIpId"] {
                    let item_key = lofty::prelude::ItemKey::Unknown(key.to_string());
                    if let Some(value) = t.get_string(&item_key) {
                        if let Some(normalized) = normalize_ip_id(value) {
                            return Some(normalized);
                        }
                    }
                }
                None
            });

            // Extract cover art
            let cover_path = tag.and_then(|t| {
                let pictures = t.pictures();
                if pictures.is_empty() {
                    return None;
                }
                let pic = pictures
                    .iter()
                    .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
                    .or_else(|| pictures.iter().max_by_key(|p| p.data().len()))
                    .or(pictures.first())?;
                let ext = match pic.mime_type() {
                    Some(lofty::picture::MimeType::Png) => "png",
                    Some(lofty::picture::MimeType::Bmp) => "bmp",
                    _ => "jpg",
                };
                let hash = content_hash(pic.data());
                let cover_filename = format!("{}.{}", hash, ext);
                let cover_file = covers_dir.join(&cover_filename);

                if !cover_file.exists() {
                    if let Err(e) = std::fs::write(&cover_file, pic.data()) {
                        log::warn!("Failed to write cover art for {}: {}", path_str, e);
                        return None;
                    }
                }
                Some(cover_file.to_string_lossy().to_string())
            });

            (title, artist, album, duration_ms, mbid, ip_id, cover_path)
        }
        Err(e) => {
            log::warn!("lofty failed for {}: {}", path_str, e);
            (fb_title, fb_artist, String::new(), None, None, None, None)
        }
    }
}
