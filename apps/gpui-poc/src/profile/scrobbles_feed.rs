use std::collections::HashMap;
use std::env;

use serde_json::Value;

use crate::shared::rpc::http_post_json;

use super::model::ProfileScrobbleRow;

const DEFAULT_SUBGRAPH_ACTIVITY_URL: &str =
    "https://api.goldsky.com/api/public/project_cmjjtjqpvtip401u87vcp20wd/subgraphs/dotheaven-activity/14.0.0/gn";

#[derive(Debug, Clone)]
struct ScrobbleMeta {
    title: String,
    artist: String,
    album: String,
    cover_cid: Option<String>,
}

pub(super) fn fetch_scrobbles_for_user(
    user_address: &str,
    max_entries: usize,
) -> Result<Vec<ProfileScrobbleRow>, String> {
    let addr = user_address.trim().to_ascii_lowercase();
    if addr.is_empty() {
        return Ok(Vec::new());
    }

    let subgraph_url = subgraph_activity_url();
    log::info!(
        "[ProfileFeed] fetch start: user={} max={} subgraph={}",
        addr,
        max_entries,
        subgraph_url
    );
    let scrobbles = fetch_scrobbles_with_track_refs(&subgraph_url, &addr, max_entries)?;
    log::info!(
        "[ProfileFeed] scrobble refs fetched: user={} count={}",
        addr,
        scrobbles.len()
    );
    if scrobbles.is_empty() {
        log::info!("[ProfileFeed] no scrobbles found for user={}", addr);
        return Ok(Vec::new());
    }

    let mut track_ids: Vec<String> = scrobbles
        .iter()
        .filter_map(|row| {
            row.get("track")
                .and_then(|track| track.get("id"))
                .and_then(|id| id.as_str())
                .map(|id| id.trim().to_string())
                .filter(|id| !id.is_empty())
        })
        .collect();
    track_ids.sort();
    track_ids.dedup();

    let track_map = if track_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_track_metadata_map(&subgraph_url, &track_ids)?
    };
    log::info!(
        "[ProfileFeed] track metadata map: user={} uniqueTrackIds={} metadataRows={}",
        addr,
        track_ids.len(),
        track_map.len()
    );

    let mut rows = Vec::with_capacity(scrobbles.len());
    for row in scrobbles {
        let timestamp = parse_u64_field(row.get("timestamp").or_else(|| row.get("blockTimestamp")));
        let played_ago = format_time_ago(timestamp);

        let (track_id, inline_meta) = parse_inline_track_meta(row.get("track"));
        let fallback_meta = track_id.as_ref().and_then(|id| track_map.get(id)).cloned();
        let meta = inline_meta
            .or(fallback_meta)
            .unwrap_or_else(|| ScrobbleMeta {
                title: track_id
                    .as_deref()
                    .map(short_track_label)
                    .unwrap_or_else(|| "Unknown Track".to_string()),
                artist: "Unknown Artist".to_string(),
                album: String::new(),
                cover_cid: None,
            });

        rows.push(ProfileScrobbleRow {
            track_id,
            played_at_sec: timestamp,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            cover_cid: meta.cover_cid,
            played_ago,
        });
    }
    if let Some(first) = rows.first() {
        log::info!(
            "[ProfileFeed] rows built: user={} total={} first='{}' by '{}'",
            addr,
            rows.len(),
            first.title,
            first.artist
        );
    } else {
        log::info!("[ProfileFeed] rows built: user={} total=0", addr);
    }

    Ok(rows)
}

fn subgraph_activity_url() -> String {
    env::var("HEAVEN_SUBGRAPH_ACTIVITY_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_ACTIVITY_URL.to_string())
}

fn fetch_scrobbles_with_track_refs(
    subgraph_url: &str,
    user_address: &str,
    max_entries: usize,
) -> Result<Vec<Value>, String> {
    let query = format!(
        "{{ scrobbles(where: {{ user: \"{}\" }}, orderBy: timestamp, orderDirection: desc, first: {}) {{ timestamp blockTimestamp track {{ id title artist album coverCid }} }} }}",
        escape_gql(user_address),
        max_entries
    );
    let response = http_post_json(subgraph_url, serde_json::json!({ "query": query }))?;
    if let Some(errors) = response.get("errors") {
        log::warn!(
            "[ProfileFeed] scrobble query error: user={} subgraph={} errors={}",
            user_address,
            subgraph_url,
            errors
        );
        return Err(format!("Activity subgraph error: {errors}"));
    }
    let rows = response
        .get("data")
        .and_then(|v| v.get("scrobbles"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if let Some(first) = rows.first() {
        let ts = first
            .get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let track_id = first
            .get("track")
            .and_then(|t| t.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        log::info!(
            "[ProfileFeed] scrobble query result: user={} rows={} firstTs={} firstTrackId={}",
            user_address,
            rows.len(),
            ts,
            track_id
        );
    } else {
        log::info!(
            "[ProfileFeed] scrobble query result: user={} rows=0",
            user_address
        );
    }
    Ok(rows)
}

fn fetch_track_metadata_map(
    subgraph_url: &str,
    track_ids: &[String],
) -> Result<HashMap<String, ScrobbleMeta>, String> {
    if track_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let quoted_ids = track_ids
        .iter()
        .map(|id| format!("\"{}\"", escape_gql(id)))
        .collect::<Vec<_>>()
        .join(",");
    let query = format!(
        "{{ tracks(where: {{ id_in: [{}] }}) {{ id title artist album coverCid }} }}",
        quoted_ids
    );
    let response = http_post_json(subgraph_url, serde_json::json!({ "query": query }))?;
    if let Some(errors) = response.get("errors") {
        log::warn!(
            "[ProfileFeed] track metadata query error: subgraph={} errors={}",
            subgraph_url,
            errors
        );
        return Err(format!("Track metadata subgraph error: {errors}"));
    }

    let mut map = HashMap::new();
    let rows = response
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for row in rows {
        let Some(track_id) = row
            .get("id")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
        else {
            continue;
        };

        let title = sanitize_track_field(row.get("title"), "Unknown Track");
        let artist = sanitize_track_field(row.get("artist"), "Unknown Artist");
        let album = sanitize_track_field(row.get("album"), "");
        let cover_cid = sanitize_cover_cid(row.get("coverCid"));

        map.insert(
            track_id,
            ScrobbleMeta {
                title,
                artist,
                album,
                cover_cid,
            },
        );
    }

    Ok(map)
}

fn parse_inline_track_meta(track: Option<&Value>) -> (Option<String>, Option<ScrobbleMeta>) {
    let Some(track) = track else {
        return (None, None);
    };

    let track_id = track
        .get("id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let title = sanitize_track_field(track.get("title"), "");
    let artist = sanitize_track_field(track.get("artist"), "");
    let album = sanitize_track_field(track.get("album"), "");
    let cover_cid = sanitize_cover_cid(track.get("coverCid"));
    let has_inline_data =
        !title.is_empty() || !artist.is_empty() || !album.is_empty() || cover_cid.is_some();

    let inline_meta = if has_inline_data {
        Some(ScrobbleMeta {
            title: if title.is_empty() {
                track_id
                    .as_deref()
                    .map(short_track_label)
                    .unwrap_or_else(|| "Unknown Track".to_string())
            } else {
                title
            },
            artist: if artist.is_empty() {
                "Unknown Artist".to_string()
            } else {
                artist
            },
            album,
            cover_cid,
        })
    } else {
        None
    };

    (track_id, inline_meta)
}

fn parse_u64_field(value: Option<&Value>) -> u64 {
    match value {
        Some(v) if v.is_number() => v.as_u64().unwrap_or_default(),
        Some(v) if v.is_string() => v
            .as_str()
            .unwrap_or_default()
            .trim()
            .parse::<u64>()
            .unwrap_or_default(),
        _ => 0,
    }
}

fn format_time_ago(played_at_sec: u64) -> String {
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

fn short_track_label(track_id: &str) -> String {
    let trimmed = track_id.trim();
    if trimmed.is_empty() {
        return "Unknown Track".to_string();
    }
    if trimmed.len() <= 14 {
        return trimmed.to_string();
    }
    format!("Track {}...", &trimmed[..10])
}

fn sanitize_track_field(raw: Option<&Value>, fallback: &str) -> String {
    raw.and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn escape_gql(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
        .replace('\r', " ")
}

fn sanitize_cover_cid(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .filter(|v| is_valid_cover_cid(v))
        .map(ToString::to_string)
}

fn is_valid_cover_cid(value: &str) -> bool {
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
