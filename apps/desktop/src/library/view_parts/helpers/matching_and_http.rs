use super::*;

pub(in crate::library) fn normalize_artist_name(name: &str) -> String {
    normalize_alnum_phrase(name)
}

pub(in crate::library) fn split_artist_names(name: &str) -> Vec<String> {
    let mut lowered = format!(" {} ", name.to_ascii_lowercase());
    for token in [
        " featuring ",
        " feat. ",
        " feat ",
        " ft. ",
        " ft ",
        " & ",
        ",",
        ";",
        " and ",
        " x ",
    ] {
        lowered = lowered.replace(token, "|");
    }
    lowered
        .split('|')
        .map(normalize_artist_name)
        .filter(|part| !part.is_empty())
        .collect()
}

pub(in crate::library) fn normalize_artist_variants(name: &str) -> HashSet<String> {
    let mut variants = HashSet::new();
    let normalized = normalize_artist_name(name);
    if !normalized.is_empty() {
        variants.insert(normalized);
    }
    for part in split_artist_names(name) {
        variants.insert(part);
    }
    variants
}

pub(in crate::library) fn artist_matches_target(track_artist: &str, target_artist: &str) -> bool {
    if target_artist.is_empty() {
        return false;
    }
    normalize_artist_variants(track_artist).contains(target_artist)
}

pub(in crate::library) fn normalize_album_name(name: &str) -> String {
    normalize_alnum_phrase(name)
}

pub(in crate::library) fn normalize_album_variants(name: &str) -> HashSet<String> {
    let base = normalize_album_name(name);
    let mut variants = HashSet::new();
    if base.is_empty() {
        variants.insert(String::new());
        return variants;
    }
    variants.insert(base.clone());
    for marker in [" (", " [", " - "] {
        if let Some(index) = base.find(marker) {
            let stripped = base[..index].trim().to_string();
            if !stripped.is_empty() {
                variants.insert(stripped);
            }
        }
    }
    variants
}

pub(in crate::library) fn album_matches_target(
    track_album: &str,
    target_variants: &HashSet<String>,
) -> bool {
    if target_variants.contains("") {
        return normalize_album_name(track_album).is_empty();
    }
    let track_variants = normalize_album_variants(track_album);
    track_variants
        .iter()
        .any(|candidate| target_variants.contains(candidate))
}

pub(in crate::library) fn normalize_alnum_phrase(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut prev_space = true;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_space = false;
        } else if !prev_space {
            out.push(' ');
            prev_space = true;
        }
    }
    out.trim().to_string()
}

pub(in crate::library) fn escape_gql(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
        .replace('\r', " ")
}

pub(in crate::library) fn resolver_url() -> String {
    env::var("HEAVEN_RESOLVER_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_RESOLVER_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub(in crate::library) fn subgraph_music_social_url() -> String {
    env::var("HEAVEN_SUBGRAPH_MUSIC_SOCIAL_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_MUSIC_SOCIAL_URL.to_string())
}

pub(in crate::library) fn http_get_json(url: &str) -> Result<Value, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut response = request
        .call()
        .map_err(|err| format!("HTTP GET failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().unwrap_or_default();
    if status >= 400 {
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|err| format!("HTTP GET {url} returned invalid JSON: {err}; body={body}"))
}

pub(in crate::library) fn http_post_json(url: &str, payload: Value) -> Result<Value, String> {
    let request = ureq::post(url)
        .header("Content-Type", "application/json")
        .config()
        .http_status_as_error(false)
        .build();
    let mut response = request
        .send_json(payload)
        .map_err(|err| format!("HTTP POST failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    let body = response.body_mut().read_to_string().unwrap_or_default();
    if status >= 400 {
        return Err(format!("HTTP POST {url} failed ({status}): {body}"));
    }
    serde_json::from_str(&body)
        .map_err(|err| format!("HTTP POST {url} returned invalid JSON: {err}; body={body}"))
}

pub(in crate::library) fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut response = request
        .call()
        .map_err(|err| format!("HTTP GET failed ({url}): {err}"))?;
    let status = response.status().as_u16();
    if status >= 400 {
        let body = response.body_mut().read_to_string().unwrap_or_default();
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }

    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Failed reading HTTP bytes ({url}): {err}"))?;
    Ok(bytes)
}
