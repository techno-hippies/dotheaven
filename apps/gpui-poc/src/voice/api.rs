use serde::{Deserialize, Serialize};

use super::auth::WorkerAuthContext;

#[derive(Clone, Debug)]
pub struct VoiceEndpoints {
    pub voice_worker_url: String,
    pub chat_worker_url: String,
    pub agora_app_id: String,
    pub china_cn_only: bool,
}

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
