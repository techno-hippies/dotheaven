use super::*;

pub(in crate::library) fn cmp_case_insensitive(a: &str, b: &str) -> Ordering {
    a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase())
}

pub(in crate::library) fn normalize_lookup_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(in crate::library) fn sanitize_detail_value(raw: String, fallback: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

pub(in crate::library) fn format_compact_duration(total_seconds: u64) -> String {
    if total_seconds == 0 {
        return "0m".to_string();
    }
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    }
}
