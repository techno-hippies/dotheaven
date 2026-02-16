use super::*;

pub(in crate::library) fn resolve_artist_image_path(
    artist: &str,
    tracks: &[TrackRow],
    _fallback_cover_cid: Option<&str>,
) -> Option<String> {
    if let Some(recording_mbid) = first_recording_mbid_for_artist(artist, tracks) {
        if let Some(artist_mbid) = resolve_artist_mbid_from_recording(&recording_mbid)
            .ok()
            .flatten()
        {
            if let Some(image_url) = fetch_artist_image_url(&artist_mbid).ok().flatten() {
                if let Some(path) = cache_remote_image(&image_url, "artists", &artist_mbid) {
                    return Some(path);
                }
            }
        }
    }

    if let Some(path) = first_local_cover_for_artist(artist, tracks) {
        return Some(path);
    }

    None
}

pub(in crate::library) fn resolve_album_image_path(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
    _fallback_cover_cid: Option<&str>,
) -> Option<String> {
    if let Some(path) = first_local_cover_for_album(artist, album, tracks) {
        return Some(path);
    }

    if let Some(recording_mbid) = first_recording_mbid_for_album(artist, album, tracks) {
        if let Some(release_group_mbid) = resolve_release_group_mbid_from_recording(&recording_mbid)
            .ok()
            .flatten()
        {
            if let Some(cover_url) = fetch_album_cover_url(&release_group_mbid).ok().flatten() {
                if let Some(path) = cache_remote_image(&cover_url, "albums", &release_group_mbid) {
                    return Some(path);
                }
            }
        }
    }

    None
}

pub(in crate::library) fn first_recording_mbid_for_artist(
    artist: &str,
    tracks: &[TrackRow],
) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    tracks
        .iter()
        .find(|track| normalize_lookup_key(&track.artist) == artist_key)
        .and_then(|track| track.mbid.as_ref())
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty())
}

pub(in crate::library) fn first_recording_mbid_for_album(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    let album_key = normalize_lookup_key(album);
    tracks
        .iter()
        .find(|track| {
            normalize_lookup_key(&track.artist) == artist_key
                && normalize_lookup_key(&track.album) == album_key
        })
        .and_then(|track| track.mbid.as_ref())
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty())
}

pub(in crate::library) fn first_local_cover_for_artist(
    artist: &str,
    tracks: &[TrackRow],
) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    tracks.iter().find_map(|track| {
        if normalize_lookup_key(&track.artist) != artist_key {
            return None;
        }
        track
            .cover_path
            .as_ref()
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    })
}

pub(in crate::library) fn first_local_cover_for_album(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
) -> Option<String> {
    let artist_key = normalize_lookup_key(artist);
    let album_key = normalize_lookup_key(album);
    tracks.iter().find_map(|track| {
        if normalize_lookup_key(&track.artist) != artist_key
            || normalize_lookup_key(&track.album) != album_key
        {
            return None;
        }
        track
            .cover_path
            .as_ref()
            .filter(|path| !path.trim().is_empty() && std::path::Path::new(path).exists())
            .cloned()
    })
}

pub(in crate::library) fn resolve_artist_mbid_from_recording(
    recording_mbid: &str,
) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/recording/{}", resolver_url(), recording_mbid))?;
    let first = payload
        .get("artists")
        .and_then(Value::as_array)
        .and_then(|artists| artists.first());
    Ok(first
        .and_then(|artist| artist.get("mbid"))
        .and_then(Value::as_str)
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty()))
}

pub(in crate::library) fn resolve_release_group_mbid_from_recording(
    recording_mbid: &str,
) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/recording/{}", resolver_url(), recording_mbid))?;
    Ok(payload
        .get("releaseGroup")
        .and_then(Value::as_object)
        .and_then(|release_group| release_group.get("mbid"))
        .and_then(Value::as_str)
        .map(|mbid| mbid.trim().to_string())
        .filter(|mbid| !mbid.is_empty()))
}

pub(in crate::library) fn fetch_artist_image_url(
    artist_mbid: &str,
) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!("{}/artist/{}", resolver_url(), artist_mbid))?;
    Ok(payload
        .get("links")
        .and_then(Value::as_object)
        .and_then(|links| links.get("image"))
        .and_then(Value::as_str)
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty()))
}

pub(in crate::library) fn fetch_album_cover_url(
    release_group_mbid: &str,
) -> Result<Option<String>, String> {
    let payload = http_get_json(&format!(
        "{}/release-group/{}",
        resolver_url(),
        release_group_mbid
    ))?;
    Ok(payload
        .get("coverArtUrl")
        .and_then(Value::as_str)
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty()))
}

pub(in crate::library) fn cache_remote_image(
    url: &str,
    namespace: &str,
    cache_key: &str,
) -> Option<String> {
    let cache_dir = app_data_dir().join("detail-images").join(namespace);
    if fs::create_dir_all(&cache_dir).is_err() {
        return None;
    }
    let ext = guess_image_extension(url);
    let file_name = format!(
        "{}.{}",
        stable_cache_hash(&format!("{namespace}:{cache_key}")),
        ext
    );
    let cache_path = cache_dir.join(file_name);
    if cache_path.exists() {
        return Some(cache_path.to_string_lossy().to_string());
    }
    let bytes = http_get_bytes(url).ok()?;
    if bytes.is_empty() {
        return None;
    }
    if fs::write(&cache_path, bytes).is_err() {
        return None;
    }
    Some(cache_path.to_string_lossy().to_string())
}

pub(in crate::library) fn stable_cache_hash(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub(in crate::library) fn guess_image_extension(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".png") {
        "png"
    } else if lower.contains(".webp") {
        "webp"
    } else {
        "jpg"
    }
}
