use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::auth::WorkerAuthContext;

#[derive(Clone, Debug)]
pub struct VoiceEndpoints {
    pub voice_worker_url: String,
    pub chat_worker_url: String,
    pub agora_app_id: String,
    pub china_cn_only: bool,
}

const DEFAULT_DUET_WORKER_URL: &str = "https://session-voice.deletion-backup782.workers.dev";

impl Default for VoiceEndpoints {
    fn default() -> Self {
        Self {
            voice_worker_url: std::env::var("HEAVEN_VOICE_WORKER_URL").unwrap_or_else(|_| {
                "https://neodate-voice.deletion-backup782.workers.dev".to_string()
            }),
            chat_worker_url: std::env::var("HEAVEN_CHAT_WORKER_URL").unwrap_or_else(|_| {
                "https://neodate-voice.deletion-backup782.workers.dev".to_string()
            }),
            agora_app_id: std::env::var("HEAVEN_AGORA_APP_ID")
                .unwrap_or_else(|_| "df4fd87bd1bf4dc9891dbb8626b5b1c5".to_string()),
            china_cn_only: std::env::var("HEAVEN_AGORA_CN_ONLY")
                .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes"))
                .unwrap_or(false),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatHistoryItem {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StartAgentResponse {
    pub session_id: String,
    pub channel: String,
    pub agora_token: String,
    pub user_uid: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct CreateDuetRoomRequest {
    pub split_address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guest_wallet: Option<String>,
    pub network: String,
    pub live_amount: String,
    pub replay_amount: String,
    pub access_window_minutes: u32,
    pub replay_mode: String,
    pub recording_mode: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct CreateDuetRoomResponse {
    pub room_id: String,
    pub agora_channel: String,
    pub status: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StartDuetRoomResponse {
    pub status: Option<String>,
    pub bridge_ticket: Option<String>,
    pub agora_channel: Option<String>,
    pub agora_broadcaster_token: Option<String>,
    pub token_expires_in_seconds: Option<u32>,
    pub already_live: Option<bool>,
    pub recording_mode: Option<String>,
}

#[derive(Deserialize)]
struct ChatSendResponse {
    message: Option<String>,
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: Option<String>,
}

pub fn start_agent(
    auth: &mut WorkerAuthContext,
    endpoints: &VoiceEndpoints,
) -> Result<StartAgentResponse, String> {
    let token = auth.bearer_token(&endpoints.voice_worker_url)?;
    let url = format!(
        "{}/agent/start",
        endpoints.voice_worker_url.trim_end_matches('/')
    );

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({}))
        .map_err(|e| format!("start agent request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        let err = parse_error_message(&err_body);
        return Err(format!("start agent failed (HTTP {status}): {err}"));
    }

    response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid start agent response: {e}"))
}

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

fn create_duet_room(
    auth: &mut WorkerAuthContext,
    _endpoints: &VoiceEndpoints,
    request: &CreateDuetRoomRequest,
) -> Result<CreateDuetRoomResponse, String> {
    let duet_base = std::env::var("HEAVEN_DUET_WORKER_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("HEAVEN_VOICE_WORKER_URL")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .unwrap_or_else(|| DEFAULT_DUET_WORKER_URL.to_string());
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
                "create duet room failed (HTTP 404): endpoint not found at {}. Set HEAVEN_DUET_WORKER_URL (or HEAVEN_VOICE_WORKER_URL) to the session-voice worker that serves /duet/* routes. Raw response: {}",
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
    let duet_base = std::env::var("HEAVEN_DUET_WORKER_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("HEAVEN_VOICE_WORKER_URL")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .unwrap_or_else(|| DEFAULT_DUET_WORKER_URL.to_string());
    let token = auth.bearer_token(&duet_base)?;
    let url = format!("{}/duet/{}/start", duet_base.trim_end_matches('/'), room_id);

    log::info!("[Rooms] Starting duet room: url={}, room_id={}", url, room_id);

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
                "start duet room failed (HTTP 404): endpoint not found at {}. Ensure session-voice worker serves /duet/:id/start. Raw response: {}",
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

pub fn stop_agent(
    auth: &mut WorkerAuthContext,
    endpoints: &VoiceEndpoints,
    session_id: &str,
) -> Result<(), String> {
    let token = auth.bearer_token(&endpoints.voice_worker_url)?;
    let url = format!(
        "{}/agent/{}/stop",
        endpoints.voice_worker_url.trim_end_matches('/'),
        session_id
    );

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({}))
        .map_err(|e| format!("stop agent request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        let err = parse_error_message(&err_body);
        return Err(format!("stop agent failed (HTTP {status}): {err}"));
    }
    Ok(())
}

pub fn send_chat_message(
    auth: &mut WorkerAuthContext,
    endpoints: &VoiceEndpoints,
    message: &str,
    history: &[ChatHistoryItem],
) -> Result<String, String> {
    let token = auth.bearer_token(&endpoints.chat_worker_url)?;
    let url = format!(
        "{}/chat/send",
        endpoints.chat_worker_url.trim_end_matches('/')
    );
    let payload = serde_json::json!({
        "message": message,
        "history": history,
    });

    let mut response = ureq::post(&url)
        .config()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .header("content-type", "application/json")
        .header("authorization", &format!("Bearer {token}"))
        .send_json(payload)
        .map_err(|e| format!("chat request failed: {e}"))?;

    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        let err_body = response.body_mut().read_to_string().unwrap_or_default();
        let err = parse_error_message(&err_body);
        return Err(format!("chat request failed (HTTP {status}): {err}"));
    }

    let body: ChatSendResponse = response
        .body_mut()
        .read_json()
        .map_err(|e| format!("invalid chat response: {e}"))?;
    Ok(body
        .message
        .unwrap_or_else(|| "Sorry, I could not generate a response.".to_string()))
}

fn parse_error_message(body: &str) -> String {
    serde_json::from_str::<ErrorResponse>(&body)
        .ok()
        .and_then(|e| e.error)
        .filter(|e| !e.trim().is_empty())
        .unwrap_or_else(|| body.to_string())
}

fn truncate_for_log(value: &str, max_chars: usize) -> String {
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
