use super::*;

pub(crate) fn now_unix_ns() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as i64
}

pub(crate) fn make_user_message(content: String) -> ChatMessage {
    let sent_at_ns = now_unix_ns();
    ChatMessage {
        id: format!("msg-user-{sent_at_ns}"),
        sender_address: "you".to_string(),
        content,
        sent_at_ns,
        expires_at_ns: None,
        is_own: true,
    }
}

pub(crate) fn make_scarlett_message(content: String) -> ChatMessage {
    let sent_at_ns = now_unix_ns();
    ChatMessage {
        id: format!("msg-scarlett-{sent_at_ns}"),
        sender_address: SCARLETT_NAME.to_string(),
        content,
        sent_at_ns,
        expires_at_ns: None,
        is_own: false,
    }
}
