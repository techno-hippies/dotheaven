use serde::Deserialize;

#[derive(Deserialize)]
struct ErrorResponse {
    error: Option<String>,
}

pub(super) fn parse_error_message(body: &str) -> String {
    serde_json::from_str::<ErrorResponse>(body)
        .ok()
        .and_then(|e| e.error)
        .filter(|e| !e.trim().is_empty())
        .unwrap_or_else(|| body.to_string())
}

pub(super) fn truncate_for_log(value: &str, max_chars: usize) -> String {
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
