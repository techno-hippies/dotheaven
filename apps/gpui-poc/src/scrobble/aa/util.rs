use super::*;

pub(super) fn env_or(primary: &str, fallback: &str) -> Option<String> {
    env::var(primary)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var(fallback).ok().filter(|v| !v.trim().is_empty()))
}

pub(super) fn parse_duration_to_sec(value: &str) -> Option<u32> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() == 2 {
        let min = parts[0].parse::<u32>().ok()?;
        let sec = parts[1].parse::<u32>().ok()?;
        return Some(min.saturating_mul(60).saturating_add(sec));
    }
    parts.first()?.parse::<u32>().ok()
}

pub(super) fn now_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
