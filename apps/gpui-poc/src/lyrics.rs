use std::cmp::Ordering;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::music_db::{LyricsCacheRow, MusicDb};

const LRCLIB_BASE_URL: &str = "https://lrclib.net";
const LRCLIB_TIMEOUT_SECS: u64 = 12;
const REMOTE_CACHE_TTL_SECS: i64 = 14 * 24 * 60 * 60;
const NEGATIVE_CACHE_TTL_SECS: i64 = 6 * 60 * 60;
const DEFAULT_LRCLIB_USER_AGENT: &str =
    "heaven-gpui-poc/0.1 (https://github.com/dotheaven/dotheaven)";

#[derive(Debug, Clone)]
pub struct LyricsTrackSignature {
    pub track_path: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration_sec: Option<u64>,
}

impl LyricsTrackSignature {
    pub fn cache_key(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            normalize_lookup_text(&self.track_name),
            normalize_lookup_text(&self.artist_name),
            normalize_lookup_text(&self.album_name),
            self.duration_sec.unwrap_or(0)
        )
    }
}

#[derive(Debug, Clone)]
pub struct LyricsLine {
    pub start_sec: f64,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LyricsSource {
    SidecarSynced,
    SidecarPlain,
    LrclibCached,
    LrclibLive,
    LrclibSearch,
    NoMatch,
}

impl LyricsSource {
    pub fn label(self) -> &'static str {
        match self {
            Self::SidecarSynced => "Sidecar (.lrc)",
            Self::SidecarPlain => "Sidecar (.txt)",
            Self::LrclibCached => "LRCLIB",
            Self::LrclibLive => "LRCLIB",
            Self::LrclibSearch => "LRCLIB",
            Self::NoMatch => "No match",
        }
    }

    fn as_db_key(self) -> &'static str {
        match self {
            Self::SidecarSynced => "sidecar_synced",
            Self::SidecarPlain => "sidecar_plain",
            Self::LrclibCached => "lrclib_cached",
            Self::LrclibLive => "lrclib_live",
            Self::LrclibSearch => "lrclib_search",
            Self::NoMatch => "no_match",
        }
    }

    fn from_db_key(value: &str) -> Self {
        match value {
            "sidecar_synced" => Self::SidecarSynced,
            "sidecar_plain" => Self::SidecarPlain,
            "lrclib_cached" => Self::LrclibCached,
            "lrclib_live" => Self::LrclibLive,
            "lrclib_search" => Self::LrclibSearch,
            "no_match" => Self::NoMatch,
            _ => Self::NoMatch,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedLyrics {
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub synced_lines: Vec<LyricsLine>,
    pub source: LyricsSource,
    pub lrclib_id: Option<i64>,
    pub fetched_at_epoch_sec: i64,
}

impl ResolvedLyrics {
    pub fn has_any_lyrics(&self) -> bool {
        !self.synced_lines.is_empty()
            || self
                .plain_lyrics
                .as_deref()
                .map(str::trim)
                .is_some_and(|text| !text.is_empty())
    }
}

#[derive(Debug, Clone)]
struct LrclibRecord {
    id: Option<i64>,
    track_name: String,
    artist_name: String,
    album_name: String,
    duration_sec: Option<u64>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

pub fn parse_duration_label_to_seconds(label: &str) -> Option<u64> {
    let pieces: Vec<&str> = label.trim().split(':').collect();
    match pieces.as_slice() {
        [minutes, seconds] => {
            let minutes = minutes.parse::<u64>().ok()?;
            let seconds = seconds.parse::<u64>().ok()?;
            if seconds >= 60 {
                return None;
            }
            Some(minutes * 60 + seconds)
        }
        [hours, minutes, seconds] => {
            let hours = hours.parse::<u64>().ok()?;
            let minutes = minutes.parse::<u64>().ok()?;
            let seconds = seconds.parse::<u64>().ok()?;
            if minutes >= 60 || seconds >= 60 {
                return None;
            }
            Some(hours * 3600 + minutes * 60 + seconds)
        }
        _ => None,
    }
}

pub fn resolve_lyrics_for_track(
    signature: &LyricsTrackSignature,
    db: Option<Arc<Mutex<MusicDb>>>,
) -> Result<ResolvedLyrics, String> {
    let now = now_epoch_sec();

    if let Some(sidecar) = read_sidecar_lyrics(signature, now) {
        return Ok(sidecar);
    }

    if let Some(db_handle) = db.as_ref() {
        if let Some(cached) = load_fresh_cached_lyrics(db_handle, signature, now)? {
            return Ok(cached);
        }
    }

    let mut should_persist_result = true;
    let fetched = match fetch_from_lrclib(signature, now) {
        Ok(found) => found,
        Err(err) => {
            // Degrade transient LRCLIB/network failures to a normal no-match UI state.
            // We intentionally avoid persisting this as negative cache so future retries can succeed.
            log::warn!(
                "[lyrics] lrclib lookup failed; using no-match fallback: track='{}' artist='{}' album='{}' err={}",
                signature.track_name,
                signature.artist_name,
                signature.album_name,
                err
            );
            should_persist_result = false;
            None
        }
    };
    let resolved = fetched.unwrap_or_else(|| ResolvedLyrics {
        plain_lyrics: None,
        synced_lyrics: None,
        synced_lines: Vec::new(),
        source: LyricsSource::NoMatch,
        lrclib_id: None,
        fetched_at_epoch_sec: now,
    });

    if let Some(db_handle) = db.as_ref() {
        if should_persist_result
            && matches!(
                resolved.source,
                LyricsSource::LrclibCached
                    | LyricsSource::LrclibLive
                    | LyricsSource::LrclibSearch
                    | LyricsSource::NoMatch
            )
        {
            persist_cached_lyrics(db_handle, signature, &resolved)?;
        }
    }

    Ok(resolved)
}

fn now_epoch_sec() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn read_sidecar_lyrics(signature: &LyricsTrackSignature, now: i64) -> Option<ResolvedLyrics> {
    let path = Path::new(&signature.track_path);
    if !path.exists() {
        return None;
    }

    for candidate in [path.with_extension("lrc"), path.with_extension("LRC")] {
        if !candidate.exists() {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&candidate) {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            let synced_lines = parse_synced_lyrics(trimmed);
            if !synced_lines.is_empty() {
                let plain = plain_from_synced_lines(&synced_lines).or_else(|| Some(trimmed.into()));
                return Some(ResolvedLyrics {
                    plain_lyrics: plain,
                    synced_lyrics: Some(trimmed.to_string()),
                    synced_lines,
                    source: LyricsSource::SidecarSynced,
                    lrclib_id: None,
                    fetched_at_epoch_sec: now,
                });
            }
            return Some(ResolvedLyrics {
                plain_lyrics: Some(trimmed.to_string()),
                synced_lyrics: None,
                synced_lines: Vec::new(),
                source: LyricsSource::SidecarPlain,
                lrclib_id: None,
                fetched_at_epoch_sec: now,
            });
        }
    }

    for candidate in [path.with_extension("txt"), path.with_extension("TXT")] {
        if !candidate.exists() {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&candidate) {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                continue;
            }
            return Some(ResolvedLyrics {
                plain_lyrics: Some(trimmed.to_string()),
                synced_lyrics: None,
                synced_lines: Vec::new(),
                source: LyricsSource::SidecarPlain,
                lrclib_id: None,
                fetched_at_epoch_sec: now,
            });
        }
    }

    None
}

fn fetch_from_lrclib(
    signature: &LyricsTrackSignature,
    now: i64,
) -> Result<Option<ResolvedLyrics>, String> {
    if signature.duration_sec.is_some() {
        if let Some(record) = fetch_lrclib_signature(signature, true)? {
            return Ok(Some(record_to_lyrics(
                record,
                LyricsSource::LrclibCached,
                now,
            )));
        }
        if let Some(record) = fetch_lrclib_signature(signature, false)? {
            return Ok(Some(record_to_lyrics(
                record,
                LyricsSource::LrclibLive,
                now,
            )));
        }
    }

    if let Some(record) = fetch_lrclib_search(signature)? {
        return Ok(Some(record_to_lyrics(
            record,
            LyricsSource::LrclibSearch,
            now,
        )));
    }

    Ok(None)
}

fn fetch_lrclib_signature(
    signature: &LyricsTrackSignature,
    cached_only: bool,
) -> Result<Option<LrclibRecord>, String> {
    let duration = signature.duration_sec.ok_or_else(|| {
        "duration is required for /api/get and /api/get-cached signature lookup".to_string()
    })?;

    let endpoint = if cached_only {
        "api/get-cached"
    } else {
        "api/get"
    };
    let url = format!(
        "{LRCLIB_BASE_URL}/{endpoint}?track_name={}&artist_name={}&album_name={}&duration={duration}",
        urlencoding::encode(signature.track_name.as_str()),
        urlencoding::encode(signature.artist_name.as_str()),
        urlencoding::encode(signature.album_name.as_str()),
    );

    let Some(json) = lrclib_get_json(&url)? else {
        return Ok(None);
    };
    Ok(parse_lrclib_record(&json))
}

fn fetch_lrclib_search(signature: &LyricsTrackSignature) -> Result<Option<LrclibRecord>, String> {
    let mut url = format!(
        "{LRCLIB_BASE_URL}/api/search?track_name={}&artist_name={}",
        urlencoding::encode(signature.track_name.as_str()),
        urlencoding::encode(signature.artist_name.as_str())
    );
    if !signature.album_name.trim().is_empty() {
        url.push_str("&album_name=");
        url.push_str(&urlencoding::encode(signature.album_name.as_str()));
    }

    let Some(json) = lrclib_get_json(&url)? else {
        return Ok(None);
    };
    let Some(candidates) = json.as_array() else {
        return Ok(None);
    };

    let mut best: Option<(i32, LrclibRecord)> = None;
    for candidate in candidates {
        let Some(record) = parse_lrclib_record(candidate) else {
            continue;
        };
        let score = score_search_candidate(&record, signature);
        match &best {
            Some((best_score, _)) if score <= *best_score => {}
            _ => best = Some((score, record)),
        }
    }

    let Some((score, record)) = best else {
        return Ok(None);
    };
    if score < 120 {
        return Ok(None);
    }
    Ok(Some(record))
}

fn lrclib_get_json(url: &str) -> Result<Option<Value>, String> {
    let request = ureq::get(url)
        .header("User-Agent", lrclib_user_agent().as_str())
        .config()
        .timeout_global(Some(Duration::from_secs(LRCLIB_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();

    let mut response = request
        .call()
        .map_err(|e| format!("LRCLIB request failed ({url}): {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .read_to_string()
        .unwrap_or_else(|_| String::new());

    if status == 404 {
        return Ok(None);
    }
    if status >= 400 {
        return Err(format!(
            "LRCLIB request failed ({status}) for {url}: {}",
            body.trim()
        ));
    }

    serde_json::from_str::<Value>(&body)
        .map(Some)
        .map_err(|e| format!("Failed parsing LRCLIB JSON ({url}): {e}"))
}

fn lrclib_user_agent() -> String {
    std::env::var("HEAVEN_LRCLIB_USER_AGENT")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_LRCLIB_USER_AGENT.to_string())
}

fn parse_lrclib_record(value: &Value) -> Option<LrclibRecord> {
    let track_name = value.get("trackName")?.as_str()?.trim().to_string();
    if track_name.is_empty() {
        return None;
    }
    let artist_name = value
        .get("artistName")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("Unknown Artist")
        .to_string();
    let album_name = value
        .get("albumName")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    let id = value.get("id").and_then(Value::as_i64);
    let duration_sec = value.get("duration").and_then(Value::as_u64);
    let plain_lyrics = value
        .get("plainLyrics")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);
    let synced_lyrics = value
        .get("syncedLyrics")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    Some(LrclibRecord {
        id,
        track_name,
        artist_name,
        album_name,
        duration_sec,
        plain_lyrics,
        synced_lyrics,
    })
}

fn record_to_lyrics(record: LrclibRecord, source: LyricsSource, now: i64) -> ResolvedLyrics {
    let synced_lines = record
        .synced_lyrics
        .as_deref()
        .map(parse_synced_lyrics)
        .unwrap_or_default();
    maybe_log_suspicious_synced_timing(
        "lrclib",
        &record.track_name,
        &record.artist_name,
        record.duration_sec,
        &synced_lines,
    );
    let plain_lyrics = record
        .plain_lyrics
        .or_else(|| plain_from_synced_lines(&synced_lines));

    ResolvedLyrics {
        plain_lyrics,
        synced_lyrics: record.synced_lyrics,
        synced_lines,
        source,
        lrclib_id: record.id,
        fetched_at_epoch_sec: now,
    }
}

fn maybe_log_suspicious_synced_timing(
    source: &str,
    track_name: &str,
    artist_name: &str,
    duration_sec: Option<u64>,
    lines: &[LyricsLine],
) {
    let Some((median_gap, min_gap, last_start)) = synced_timing_stats(lines) else {
        return;
    };
    let dense_timing = lines.len() >= 24 && median_gap < 0.55;
    let short_coverage = duration_sec.is_some_and(|duration| {
        let duration = duration as f64;
        duration >= 120.0 && lines.len() >= 20 && last_start < duration * 0.45
    });
    if !dense_timing && !short_coverage {
        return;
    }

    log::warn!(
        "[lyrics] suspicious synced timing source={} track='{}' artist='{}' lines={} median_gap={:.3}s min_gap={:.3}s last_start={:.3}s duration_sec={:?}",
        source,
        track_name,
        artist_name,
        lines.len(),
        median_gap,
        min_gap,
        last_start,
        duration_sec,
    );
}

fn synced_timing_stats(lines: &[LyricsLine]) -> Option<(f64, f64, f64)> {
    if lines.len() < 2 {
        return None;
    }

    let mut deltas = Vec::with_capacity(lines.len().saturating_sub(1));
    let mut previous = lines.first()?.start_sec;
    for line in lines.iter().skip(1) {
        let delta = line.start_sec - previous;
        if delta.is_finite() && delta > 0.0 {
            deltas.push(delta);
        }
        previous = line.start_sec;
    }

    if deltas.len() < 4 {
        return None;
    }

    deltas.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let mid = deltas.len() / 2;
    let median_gap = if deltas.len() % 2 == 0 {
        (deltas[mid - 1] + deltas[mid]) / 2.0
    } else {
        deltas[mid]
    };
    let min_gap = *deltas.first().unwrap_or(&0.0);
    let last_start = lines.last()?.start_sec;

    Some((median_gap, min_gap, last_start))
}

fn score_search_candidate(record: &LrclibRecord, signature: &LyricsTrackSignature) -> i32 {
    let track_a = normalize_lookup_text(&record.track_name);
    let track_b = normalize_lookup_text(&signature.track_name);
    let artist_a = normalize_lookup_text(&record.artist_name);
    let artist_b = normalize_lookup_text(&signature.artist_name);
    let album_a = normalize_lookup_text(&record.album_name);
    let album_b = normalize_lookup_text(&signature.album_name);

    let mut score = 0;

    if track_a == track_b {
        score += 100;
    } else if track_a.contains(&track_b) || track_b.contains(&track_a) {
        score += 45;
    }

    if artist_a == artist_b {
        score += 80;
    } else if artist_a.contains(&artist_b) || artist_b.contains(&artist_a) {
        score += 35;
    }

    if !album_b.is_empty() {
        if album_a == album_b {
            score += 30;
        } else if album_a.contains(&album_b) || album_b.contains(&album_a) {
            score += 15;
        }
    }

    if let (Some(expected), Some(found)) = (signature.duration_sec, record.duration_sec) {
        let diff = expected.abs_diff(found);
        if diff <= 2 {
            score += 40;
        } else if diff <= 5 {
            score += 22;
        } else if diff <= 10 {
            score += 8;
        } else {
            score -= 10;
        }
    }

    score
}

fn normalize_lookup_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_space = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_space = false;
        } else if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        }
    }
    out.trim().to_string()
}

fn parse_synced_lyrics(raw: &str) -> Vec<LyricsLine> {
    let mut lines = Vec::new();

    for raw_line in raw.lines() {
        let mut remaining = raw_line.trim();
        if remaining.is_empty() {
            continue;
        }

        let mut timestamps = Vec::new();
        while let Some(stripped) = remaining.strip_prefix('[') {
            let Some(close) = stripped.find(']') else {
                break;
            };
            let stamp = stripped[..close].trim();
            let Some(start_sec) = parse_lrc_timestamp(stamp) else {
                break;
            };
            timestamps.push(start_sec);
            remaining = stripped[close + 1..].trim_start();
        }

        if timestamps.is_empty() {
            continue;
        }

        let text = remaining.trim().to_string();
        if text.is_empty() {
            continue;
        }
        for start_sec in timestamps {
            lines.push(LyricsLine {
                start_sec,
                text: text.clone(),
            });
        }
    }

    lines.sort_by(|a, b| {
        a.start_sec
            .partial_cmp(&b.start_sec)
            .unwrap_or(Ordering::Equal)
    });
    lines
}

fn parse_lrc_timestamp(stamp: &str) -> Option<f64> {
    let (minutes, rest) = stamp.split_once(':')?;
    let minutes = minutes.parse::<u64>().ok()?;
    let seconds = rest.parse::<f64>().ok()?;
    if seconds >= 60.0 {
        return None;
    }
    Some(minutes as f64 * 60.0 + seconds)
}

fn plain_from_synced_lines(lines: &[LyricsLine]) -> Option<String> {
    if lines.is_empty() {
        return None;
    }
    let mut merged = Vec::new();
    let mut last = String::new();
    for line in lines {
        let text = line.text.trim();
        if text.is_empty() {
            continue;
        }
        if text == last {
            continue;
        }
        merged.push(text.to_string());
        last = text.to_string();
    }
    if merged.is_empty() {
        None
    } else {
        Some(merged.join("\n"))
    }
}

fn load_fresh_cached_lyrics(
    db_handle: &Arc<Mutex<MusicDb>>,
    signature: &LyricsTrackSignature,
    now: i64,
) -> Result<Option<ResolvedLyrics>, String> {
    let cache_key = signature.cache_key();
    let row = {
        let db = db_handle
            .lock()
            .map_err(|e| format!("lyrics cache lock failed: {e}"))?;
        db.get_lyrics_cache(&cache_key)?
    };
    let Some(row) = row else {
        return Ok(None);
    };

    let source = LyricsSource::from_db_key(&row.source);
    let age = now.saturating_sub(row.fetched_at_epoch_sec);
    let ttl = if source == LyricsSource::NoMatch {
        NEGATIVE_CACHE_TTL_SECS
    } else {
        REMOTE_CACHE_TTL_SECS
    };
    if age > ttl {
        return Ok(None);
    }

    let synced_lines = row
        .synced_lyrics
        .as_deref()
        .map(parse_synced_lyrics)
        .unwrap_or_default();
    maybe_log_suspicious_synced_timing(
        "cache",
        &signature.track_name,
        &signature.artist_name,
        signature.duration_sec,
        &synced_lines,
    );
    let plain_lyrics = row
        .plain_lyrics
        .clone()
        .or_else(|| plain_from_synced_lines(&synced_lines));

    Ok(Some(ResolvedLyrics {
        plain_lyrics,
        synced_lyrics: row.synced_lyrics,
        synced_lines,
        source,
        lrclib_id: row.lrclib_id,
        fetched_at_epoch_sec: row.fetched_at_epoch_sec,
    }))
}

fn persist_cached_lyrics(
    db_handle: &Arc<Mutex<MusicDb>>,
    signature: &LyricsTrackSignature,
    lyrics: &ResolvedLyrics,
) -> Result<(), String> {
    let payload = LyricsCacheRow {
        cache_key: signature.cache_key(),
        track_name: signature.track_name.clone(),
        artist_name: signature.artist_name.clone(),
        album_name: signature.album_name.clone(),
        duration_sec: signature.duration_sec.map(|secs| secs as i64),
        plain_lyrics: lyrics.plain_lyrics.clone(),
        synced_lyrics: lyrics.synced_lyrics.clone(),
        lrclib_id: lyrics.lrclib_id,
        source: lyrics.source.as_db_key().to_string(),
        fetched_at_epoch_sec: lyrics.fetched_at_epoch_sec,
    };

    let db = db_handle
        .lock()
        .map_err(|e| format!("lyrics cache lock failed: {e}"))?;
    db.upsert_lyrics_cache(&payload)
}
