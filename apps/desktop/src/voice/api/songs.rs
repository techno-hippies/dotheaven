use std::time::Duration;

use crate::shared::config::duet_worker_base_url;

use super::models::{SongSearchResponse, VoiceEndpoints};
use super::util::{parse_error_message, truncate_for_log};

pub fn search_songs(
    _endpoints: &VoiceEndpoints,
    query: &str,
) -> Result<SongSearchResponse, String> {
    let q = query.trim();
    if q.len() < 2 {
        return Ok(SongSearchResponse { songs: vec![] });
    }

    let base = duet_worker_base_url();
    let url = format!(
        "{}/songs/search?q={}",
        base.trim_end_matches('/'),
        urlencoding::encode(q)
    );

    let mut response = ureq::get(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .call()
        .map_err(|e| format!("song search request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        log::warn!(
            "[Songs] search failed: status={}, url={}, body={}",
            status,
            url,
            truncate_for_log(&err_body, 400)
        );
        let err = parse_error_message(&err_body);
        if status == 404 {
            return Err(format!(
                "song search failed (HTTP 404): endpoint not found at {}. Ensure session-voice worker serves /songs/search. Raw response: {}",
                url, err
            ));
        }
        return Err(format!(
            "song search failed (HTTP {status}) at {url}: {err}"
        ));
    }

    response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid song search response: {e}"))
}
