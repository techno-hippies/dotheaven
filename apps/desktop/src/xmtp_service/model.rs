use super::*;

// ---------------------------------------------------------------------------
// Type alias
// ---------------------------------------------------------------------------

pub(super) type XmtpClient = Client<MlsContext>;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationInfo {
    pub id: String,
    pub peer_address: String,
    pub last_message: Option<String>,
    pub last_message_at: Option<i64>,
    pub last_message_sender: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct DisappearingMessageSettings {
    pub from_ns: i64,
    pub in_ns: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct XmtpMessage {
    pub id: String,
    pub conversation_id: String,
    pub sender_address: String,
    pub content: String,
    pub sent_at_ns: String,
    pub kind: String,
}
