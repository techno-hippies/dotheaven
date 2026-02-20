use std::time::Duration;

use crate::shared::config::duet_worker_base_url;
use crate::voice::auth::WorkerAuthContext;

use super::models::{
    CreateDuetRoomRequest, CreateDuetRoomResponse, DiscoverDuetRoomsResponse,
    DuetPublicInfoResponse, EndDuetRoomResponse, StartDuetRoomResponse, StartDuetSegmentResponse,
    VoiceEndpoints,
};
use super::util::{parse_error_message, truncate_for_log};

pub fn create_duet_room_from_disk(
    endpoints: &VoiceEndpoints,
    request: &CreateDuetRoomRequest,
) -> Result<CreateDuetRoomResponse, String> {
    let mut auth = WorkerAuthContext::from_disk()?;
    create_duet_room(&mut auth, endpoints, request)
}

pub fn start_duet_room_from_disk(
    endpoints: &VoiceEndpoints,
    room_id: &str,
) -> Result<StartDuetRoomResponse, String> {
    let mut auth = WorkerAuthContext::from_disk()?;
    start_duet_room(&mut auth, endpoints, room_id)
}

pub fn end_duet_room_from_disk(
    endpoints: &VoiceEndpoints,
    room_id: &str,
) -> Result<EndDuetRoomResponse, String> {
    let mut auth = WorkerAuthContext::from_disk()?;
    end_duet_room(&mut auth, endpoints, room_id)
}

pub fn start_duet_segment_from_disk(
    endpoints: &VoiceEndpoints,
    room_id: &str,
    pay_to: &str,
    song_id: Option<&str>,
) -> Result<StartDuetSegmentResponse, String> {
    let mut auth = WorkerAuthContext::from_disk()?;
    start_duet_segment(&mut auth, endpoints, room_id, pay_to, song_id)
}

pub fn get_duet_public_info(
    _endpoints: &VoiceEndpoints,
    room_id: &str,
) -> Result<DuetPublicInfoResponse, String> {
    let duet_base = duet_worker_base_url();
    let url = format!(
        "{}/duet/{}/public-info",
        duet_base.trim_end_matches('/'),
        room_id
    );

    let mut response = ureq::get(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .call()
        .map_err(|e| format!("duet public-info request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        let err = parse_error_message(&err_body);
        return Err(format!(
            "duet public-info failed (HTTP {status}) at {url}: {err}"
        ));
    }

    response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid duet public-info response: {e}"))
}

pub fn discover_duet_rooms(
    _endpoints: &VoiceEndpoints,
) -> Result<DiscoverDuetRoomsResponse, String> {
    let duet_base = duet_worker_base_url();
    let url = format!("{}/duet/discover", duet_base.trim_end_matches('/'));
    let auth_token = WorkerAuthContext::from_disk()
        .ok()
        .and_then(|mut auth| auth.bearer_token(&duet_base).ok());

    let mut request = ureq::get(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(10)))
        .build();
    if let Some(token) = auth_token {
        request = request.header("authorization", &format!("Bearer {token}"));
    }

    let mut response = request
        .call()
        .map_err(|e| format!("duet discover request failed: {e}"))?;

    let status = response.status().as_u16();
    if status == 404 {
        log::warn!(
            "[Rooms] duet discover endpoint not found at {}. Returning empty list. Deploy the latest voice-control-plane worker or set DUET_WORKER_URL/VOICE_CONTROL_PLANE_URL (legacy: HEAVEN_DUET_WORKER_URL) to a worker serving /duet/discover.",
            url
        );
        return Ok(DiscoverDuetRoomsResponse { rooms: vec![] });
    }
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        let err = parse_error_message(&err_body);
        return Err(format!(
            "duet discover failed (HTTP {status}) at {url}: {err}"
        ));
    }

    response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid duet discover response: {e}"))
}

fn create_duet_room(
    auth: &mut WorkerAuthContext,
    _endpoints: &VoiceEndpoints,
    request: &CreateDuetRoomRequest,
) -> Result<CreateDuetRoomResponse, String> {
    let duet_base = duet_worker_base_url();
    let token = auth.bearer_token(&duet_base)?;
    let url = format!("{}/duet/create", duet_base.trim_end_matches('/'));

    log::info!(
        "[Rooms] Creating duet room: url={}, network={}, replay_mode={}, recording_mode={}, has_guest={}, access_window_minutes={}",
        url,
        request.network,
        request.replay_mode,
        request.recording_mode,
        request.guest_wallet.is_some(),
        request.access_window_minutes
    );

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(request)
        .map_err(|e| format!("create duet room request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        log::warn!(
            "[Rooms] create duet room failed: status={}, url={}, body={}",
            status,
            url,
            truncate_for_log(&err_body, 400)
        );
        let err = parse_error_message(&err_body);
        if status == 404 {
            return Err(format!(
                "create duet room failed (HTTP 404): endpoint not found at {}. Set DUET_WORKER_URL (or VOICE_CONTROL_PLANE_URL; legacy: HEAVEN_DUET_WORKER_URL/HEAVEN_VOICE_WORKER_URL) to the voice-control-plane worker that serves /duet/* routes. Raw response: {}",
                url, err
            ));
        }
        return Err(format!(
            "create duet room failed (HTTP {status}) at {url}: {err}"
        ));
    }

    let parsed: CreateDuetRoomResponse = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid create duet room response: {e}"))?;

    log::info!(
        "[Rooms] Duet room created: room_id={}, agora_channel={}, status={}",
        parsed.room_id,
        parsed.agora_channel,
        parsed
            .status
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    );

    Ok(parsed)
}

fn start_duet_room(
    auth: &mut WorkerAuthContext,
    _endpoints: &VoiceEndpoints,
    room_id: &str,
) -> Result<StartDuetRoomResponse, String> {
    let duet_base = duet_worker_base_url();
    let token = auth.bearer_token(&duet_base)?;
    let url = format!("{}/duet/{}/start", duet_base.trim_end_matches('/'), room_id);

    log::info!(
        "[Rooms] Starting duet room: url={}, room_id={}",
        url,
        room_id
    );

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({}))
        .map_err(|e| format!("start duet room request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        log::warn!(
            "[Rooms] start duet room failed: status={}, url={}, body={}",
            status,
            url,
            truncate_for_log(&err_body, 400)
        );
        let err = parse_error_message(&err_body);
        if status == 404 {
            return Err(format!(
                "start duet room failed (HTTP 404): endpoint not found at {}. Ensure voice-control-plane serves /duet/:id/start. Raw response: {}",
                url, err
            ));
        }
        return Err(format!(
            "start duet room failed (HTTP {status}) at {url}: {err}"
        ));
    }

    let parsed: StartDuetRoomResponse = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid start duet room response: {e}"))?;

    log::info!(
        "[Rooms] Duet room started: room_id={}, status={}, has_bridge_ticket={}, has_broadcaster_token={}",
        room_id,
        parsed
            .status
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        parsed.bridge_ticket.is_some(),
        parsed.agora_broadcaster_token.is_some()
    );

    Ok(parsed)
}

fn end_duet_room(
    auth: &mut WorkerAuthContext,
    _endpoints: &VoiceEndpoints,
    room_id: &str,
) -> Result<EndDuetRoomResponse, String> {
    let duet_base = duet_worker_base_url();
    let token = auth.bearer_token(&duet_base)?;
    let url = format!("{}/duet/{}/end", duet_base.trim_end_matches('/'), room_id);

    log::info!("[Rooms] Ending duet room: url={}, room_id={}", url, room_id);

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({}))
        .map_err(|e| format!("end duet room request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        log::warn!(
            "[Rooms] end duet room failed: status={}, url={}, body={}",
            status,
            url,
            truncate_for_log(&err_body, 400)
        );
        let err = parse_error_message(&err_body);
        if status == 404 {
            return Err(format!(
                "end duet room failed (HTTP 404): endpoint not found at {}. Ensure voice-control-plane serves /duet/:id/end. Raw response: {}",
                url, err
            ));
        }
        return Err(format!(
            "end duet room failed (HTTP {status}) at {url}: {err}"
        ));
    }

    let parsed: EndDuetRoomResponse = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid end duet room response: {e}"))?;

    log::info!(
        "[Rooms] Duet room ended: room_id={}, status={}, already_ended={}",
        room_id,
        parsed
            .status
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        parsed.already_ended.unwrap_or(false)
    );

    Ok(parsed)
}

fn start_duet_segment(
    auth: &mut WorkerAuthContext,
    _endpoints: &VoiceEndpoints,
    room_id: &str,
    pay_to: &str,
    song_id: Option<&str>,
) -> Result<StartDuetSegmentResponse, String> {
    let duet_base = duet_worker_base_url();
    let token = auth.bearer_token(&duet_base)?;
    let url = format!(
        "{}/duet/{}/segments/start",
        duet_base.trim_end_matches('/'),
        room_id
    );

    log::info!(
        "[Rooms] Starting duet segment: url={}, room_id={}, has_song_id={}",
        url,
        room_id,
        song_id.is_some()
    );

    let request = serde_json::json!({
        "pay_to": pay_to,
        "song_id": song_id,
    });

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(request)
        .map_err(|e| format!("start duet segment request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        log::warn!(
            "[Rooms] start duet segment failed: status={}, url={}, body={}",
            status,
            url,
            truncate_for_log(&err_body, 400)
        );
        let err = parse_error_message(&err_body);
        if status == 404 {
            return Err(format!(
                "start duet segment failed (HTTP 404): endpoint not found at {}. Ensure voice-control-plane serves /duet/:id/segments/start. Raw response: {}",
                url, err
            ));
        }
        return Err(format!(
            "start duet segment failed (HTTP {status}) at {url}: {err}"
        ));
    }

    let parsed: StartDuetSegmentResponse = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid start duet segment response: {e}"))?;

    Ok(parsed)
}
