// =============================================================================
// Data types (UI-side — mapped from xmtp_service types)
// =============================================================================

#[derive(Debug, Clone)]
pub struct ConversationItem {
    pub id: String,
    pub peer_address: String,
    pub peer_display_name: String,
    pub peer_nationality: Option<String>,
    pub last_message: Option<String>,
    pub last_message_at: Option<i64>, // unix millis
    pub unread: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub sender_address: String,
    pub content: String,
    pub sent_at_ns: i64,
    pub expires_at_ns: Option<i64>,
    pub is_own: bool,
}

#[derive(Clone, Debug, Default)]
pub(super) struct SessionHandoffState {
    pub(super) opening: bool,
    pub(super) last_info: Option<String>,
    pub(super) last_error: Option<String>,
}

pub(super) const CHAT_DISAPPEARING_OPTIONS: &[(u64, &str)] = &[
    (0, "Off"),
    (15, "15 seconds"),
    (60, "1 minute"),
    (300, "5 minutes"),
    (900, "15 minutes"),
    (3600, "1 hour"),
];

pub(super) fn format_disappearing_label(seconds: u64) -> String {
    CHAT_DISAPPEARING_OPTIONS
        .iter()
        .find(|(value, _)| *value == seconds)
        .map(|(_, label)| (*label).to_string())
        .unwrap_or_else(|| format!("{seconds}s"))
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(super) struct DisappearingMessageState {
    pub(super) disappear_starting_at_ns: i64,
    pub(super) retention_duration_ns: i64,
}

impl DisappearingMessageState {
    pub(super) fn is_enabled(&self) -> bool {
        self.disappear_starting_at_ns > 0 && self.retention_duration_ns > 0
    }

    pub(super) fn retention_seconds(&self) -> u64 {
        if !self.is_enabled() {
            return 0;
        }
        (self.retention_duration_ns as u64) / 1_000_000_000
    }
}
