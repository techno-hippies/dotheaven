pub(super) fn format_time_ago(played_at_sec: u64) -> String {
    if played_at_sec == 0 {
        return "Unknown".to_string();
    }

    let now = crate::scrobble::now_epoch_sec();
    if played_at_sec >= now {
        return "Just now".to_string();
    }

    let delta = now - played_at_sec;
    if delta < 60 {
        return format!("{delta}s ago");
    }
    if delta < 3_600 {
        let mins = delta / 60;
        return format!("{mins} {} ago", pluralize(mins, "min"));
    }
    if delta < 86_400 {
        let hours = delta / 3_600;
        return format!("{hours} {} ago", pluralize(hours, "hr"));
    }
    if delta < 604_800 {
        let days = delta / 86_400;
        return format!("{days} {} ago", pluralize(days, "day"));
    }
    if delta < 2_592_000 {
        let weeks = delta / 604_800;
        return format!("{weeks} {} ago", pluralize(weeks, "wk"));
    }
    let months = delta / 2_592_000;
    format!("{months} {} ago", pluralize(months, "mo"))
}

pub(super) fn short_track_label(track_id: &str) -> String {
    let trimmed = track_id.trim();
    if trimmed.is_empty() {
        return "Unknown Track".to_string();
    }
    if trimmed.len() <= 14 {
        return trimmed.to_string();
    }
    format!("Track {}...", &trimmed[..10])
}

pub(super) fn sanitize_string_field(raw: &str, fallback: &str) -> String {
    let value = raw.trim();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

pub(super) fn sanitize_cover_ref(raw: &str) -> Option<String> {
    let value = raw.trim();
    if value.is_empty() || !is_valid_cover_ref(value) {
        return None;
    }
    Some(value.to_string())
}

fn is_valid_cover_ref(value: &str) -> bool {
    value.starts_with("Qm")
        || value.starts_with("bafy")
        || value.starts_with("ar://")
        || value.starts_with("ls3://")
        || value.starts_with("load-s3://")
}

fn pluralize(value: u64, unit: &str) -> String {
    if value == 1 {
        unit.to_string()
    } else {
        format!("{unit}s")
    }
}
