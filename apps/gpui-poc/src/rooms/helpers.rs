use super::*;

pub(crate) fn is_hex_address(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 42
        && trimmed.starts_with("0x")
        && trimmed.chars().skip(2).all(|ch| ch.is_ascii_hexdigit())
}

pub(crate) fn normalize_usdc_decimal(value: &str) -> Option<String> {
    let cleaned = value
        .trim()
        .to_ascii_lowercase()
        .replace("usdc", "")
        .replace('$', "")
        .replace(',', "")
        .trim()
        .to_string();

    if cleaned.is_empty() || cleaned == "free" {
        return None;
    }

    let mut dot_count = 0usize;
    for ch in cleaned.chars() {
        if ch == '.' {
            dot_count += 1;
            if dot_count > 1 {
                return None;
            }
            continue;
        }
        if !ch.is_ascii_digit() {
            return None;
        }
    }

    if let Some((_, frac)) = cleaned.split_once('.') {
        if frac.len() > 6 {
            return None;
        }
    }

    let parsed = cleaned.parse::<f64>().ok()?;
    if parsed <= 0.0 {
        return None;
    }

    let mut out = cleaned;
    if out.contains('.') {
        while out.ends_with('0') {
            out.pop();
        }
        if out.ends_with('.') {
            out.pop();
        }
    }

    if out.is_empty() || out == "0" {
        return None;
    }

    Some(out)
}

pub(crate) fn short_address(address: &str) -> String {
    if address.len() <= 12 {
        return address.to_string();
    }
    format!("{}...{}", &address[..6], &address[address.len() - 4..])
}

pub(crate) fn short_room_id(room_id: &str) -> String {
    room_id.split('-').next().unwrap_or(room_id).to_string()
}

pub(crate) fn format_usdc_label(amount: &str) -> String {
    format!("${amount} USDC")
}

pub(crate) fn duet_watch_url(room_id: &str) -> String {
    let base = duet_worker_base_url();
    format!("{}/duet/{}/watch", base.trim_end_matches('/'), room_id)
}

pub(crate) fn duet_broadcast_url(room_id: &str, bridge_ticket: &str) -> String {
    let base = duet_worker_base_url();
    format!(
        "{}/duet/{}/broadcast?bridgeTicket={}",
        base.trim_end_matches('/'),
        room_id,
        bridge_ticket
    )
}

pub(crate) fn truncate_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        let mut out = String::new();
        for ch in value.chars().take(max_chars) {
            out.push(ch);
        }
        out.push_str("...");
        out
    }
}
