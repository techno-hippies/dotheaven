pub(crate) fn format_relative_time(millis: Option<i64>) -> String {
    let ts = match millis {
        Some(ms) => ms,
        None => return String::new(),
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let diff_secs = (now - ts) / 1000;

    if diff_secs < 60 {
        "now".to_string()
    } else if diff_secs < 3600 {
        format!("{}m", diff_secs / 60)
    } else if diff_secs < 86400 {
        format!("{}h", diff_secs / 3600)
    } else if diff_secs < 604800 {
        format!("{}d", diff_secs / 86400)
    } else {
        format!("{}w", diff_secs / 604800)
    }
}

pub(crate) fn format_ns_to_time(ns: i64) -> String {
    let secs = ns / 1_000_000_000;
    let hour = (secs / 3600) % 24;
    let minute = (secs / 60) % 60;
    let (h12, ampm) = if hour == 0 {
        (12, "AM")
    } else if hour < 12 {
        (hour, "AM")
    } else if hour == 12 {
        (12, "PM")
    } else {
        (hour - 12, "PM")
    };
    format!("{}:{:02} {}", h12, minute, ampm)
}

pub(crate) fn format_duration(seconds: u64) -> String {
    let mins = seconds / 60;
    let secs = seconds % 60;
    format!("{mins}:{secs:02}")
}

pub(crate) fn normalize_preview_text(input: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 72;
    let normalized = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut iter = normalized.chars();
    let head: String = iter.by_ref().take(MAX_PREVIEW_CHARS).collect();
    if iter.next().is_some() {
        format!("{head}...")
    } else {
        head
    }
}
