use serde::Deserialize;
use std::time::Duration;

use super::models::{ChatHistoryItem, StartAgentResponse, VoiceEndpoints};
use super::util::parse_error_message;
use crate::voice::auth::WorkerAuthContext;

#[derive(Deserialize)]
struct ChatSendResponse {
    message: Option<String>,
}

fn strip_think_sections(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0usize;
    let lower = input.to_ascii_lowercase();

    while let Some(start_rel) = lower[cursor..].find("<think>") {
        let start = cursor + start_rel;
        output.push_str(&input[cursor..start]);
        let body_start = start + "<think>".len();

        if let Some(end_rel) = lower[body_start..].find("</think>") {
            cursor = body_start + end_rel + "</think>".len();
        } else {
            // If the backend streams an unclosed think block, ignore the remainder.
            cursor = input.len();
            break;
        }
    }

    if cursor < input.len() {
        output.push_str(&input[cursor..]);
    }
    output
}

fn remove_case_insensitive_tag(mut input: String, tag: &str) -> String {
    let tag_len = tag.len();
    let needle = tag.to_ascii_lowercase();
    while let Some(pos) = input.to_ascii_lowercase().find(&needle) {
        input.replace_range(pos..pos + tag_len, "");
    }
    input
}

fn sanitize_chat_message(raw: Option<String>) -> String {
    let base = raw.unwrap_or_default();
    let stripped = strip_think_sections(&base);
    let cleaned =
        remove_case_insensitive_tag(remove_case_insensitive_tag(stripped, "<think>"), "</think>")
            .trim()
            .to_string();

    if cleaned.is_empty() {
        "Sorry, I could not generate a response.".to_string()
    } else {
        cleaned
    }
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
    Ok(sanitize_chat_message(body.message))
}

#[cfg(test)]
mod tests {
    use super::{remove_case_insensitive_tag, sanitize_chat_message, strip_think_sections};

    #[test]
    fn strips_inline_think_block() {
        let input = "Hello <think>internal reasoning</think>world";
        assert_eq!(strip_think_sections(input), "Hello world");
    }

    #[test]
    fn strips_unclosed_think_block() {
        let input = "Hello<think>secret";
        assert_eq!(strip_think_sections(input), "Hello");
    }

    #[test]
    fn sanitizes_empty_after_stripping() {
        let sanitized = sanitize_chat_message(Some("<think>only hidden</think>".to_string()));
        assert_eq!(sanitized, "Sorry, I could not generate a response.");
    }

    #[test]
    fn sanitizes_leftover_tags() {
        let sanitized =
            sanitize_chat_message(Some("<think>Hello</think> <think>again".to_string()));
        assert_eq!(sanitized, "Sorry, I could not generate a response.");
    }

    #[test]
    fn removes_case_insensitive_tags() {
        let cleaned = remove_case_insensitive_tag("A</THINK>B".to_string(), "</think>");
        assert_eq!(cleaned, "AB");
    }
}
