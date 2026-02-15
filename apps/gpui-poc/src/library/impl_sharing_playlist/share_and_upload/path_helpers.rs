use super::*;

fn sanitize_filename_component(raw: &str, fallback: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if matches!(ch, ' ' | '-' | '_') {
            if !out.is_empty() && !last_dash {
                out.push('-');
                last_dash = true;
            }
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        fallback.to_string()
    } else {
        out.chars().take(64).collect()
    }
}

fn short_hex_suffix(raw: &str) -> String {
    let body = raw.trim().trim_start_matches("0x");
    let compact: String = body.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if compact.len() >= 8 {
        compact[..8].to_ascii_lowercase()
    } else if compact.is_empty() {
        "shared".to_string()
    } else {
        compact.to_ascii_lowercase()
    }
}

pub(in crate::library) fn shared_library_target_path(
    library_root: &str,
    title: &str,
    content_id: &str,
    source_path: &PathBuf,
) -> PathBuf {
    let ext = source_path
        .extension()
        .and_then(|v| v.to_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("m4a");
    let file_name = format!(
        "{}-{}.{}",
        sanitize_filename_component(title, "shared-track"),
        short_hex_suffix(content_id),
        ext
    );
    PathBuf::from(library_root).join("Shared").join(file_name)
}
