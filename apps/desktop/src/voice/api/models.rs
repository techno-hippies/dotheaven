use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct VoiceEndpoints {
    pub voice_worker_url: String,
    pub chat_worker_url: String,
    pub agora_app_id: String,
    pub china_cn_only: bool,
}

impl Default for VoiceEndpoints {
    fn default() -> Self {
        // Explicit config: don't silently fall back to a random Agora app id.
        // If you need native Agora features (Scarlett voice / native bridge), set HEAVEN_AGORA_APP_ID.
        let default_voice_agent_url = "https://voice-agent.deletion-backup782.workers.dev".to_string();
        let voice_worker_url = std::env::var("VOICE_AGENT_URL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("HEAVEN_VOICE_WORKER_URL")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .unwrap_or_else(|| default_voice_agent_url.clone());
        let chat_worker_url = std::env::var("CHAT_WORKER_URL")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("HEAVEN_CHAT_WORKER_URL")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .unwrap_or_else(|| default_voice_agent_url.clone());

        Self {
            voice_worker_url,
            chat_worker_url,
            agora_app_id: std::env::var("HEAVEN_AGORA_APP_ID").unwrap_or_default(),
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
    pub visibility: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub room_kind: Option<String>,
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
    pub agora_app_id: Option<String>,
    pub bridge_ticket: Option<String>,
    pub agora_channel: Option<String>,
    pub agora_broadcaster_uid: Option<u32>,
    pub agora_broadcaster_token: Option<String>,
    pub token_expires_in_seconds: Option<u32>,
    pub already_live: Option<bool>,
    pub recording_mode: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct EndDuetRoomResponse {
    pub status: Option<String>,
    pub ended_at: Option<u64>,
    pub already_ended: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DuetPublicInfoResponse {
    pub room_id: String,
    pub status: Option<String>,
    pub audience_mode: Option<String>,
    pub can_enter: Option<bool>,
    pub broadcast_state: Option<String>,
    pub broadcast_mode: Option<String>,
    pub broadcast_heartbeat_at: Option<u64>,
    pub broadcaster_online: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DiscoverDuetRoomItem {
    pub room_id: String,
    pub host_wallet: String,
    pub guest_wallet: Option<String>,
    pub status: Option<String>,
    pub title: Option<String>,
    pub room_kind: Option<String>,
    pub live_amount: Option<String>,
    pub replay_amount: Option<String>,
    pub audience_mode: Option<String>,
    pub listener_count: Option<u32>,
    pub live_started_at: Option<u64>,
    pub started_at: Option<u64>,
    pub created_at: Option<u64>,
    pub updated_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DiscoverDuetRoomsResponse {
    pub rooms: Vec<DiscoverDuetRoomItem>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SongSearchItem {
    pub song_id: String,
    pub title: String,
    pub artist: String,
    pub story_ip_id: String,
    pub payout_chain_id: u64,
    pub payout_address: String,
    pub default_upstream_bps: u32,
    pub license_preset_id: Option<String>,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SongSearchResponse {
    pub songs: Vec<SongSearchItem>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SegmentPricing {
    pub live_amount: String,
    pub replay_amount: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SegmentRights {
    pub kind: String,
    pub source_story_ip_ids: Option<Vec<String>>,
    pub upstream_bps: Option<u32>,
    pub upstream_payout: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DuetRoomSegment {
    pub id: String,
    pub started_at: u64,
    pub pay_to: String,
    pub pricing: SegmentPricing,
    pub rights: Option<SegmentRights>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct StartDuetSegmentResponse {
    pub ok: bool,
    pub current_segment_id: String,
    pub segment: DuetRoomSegment,
}
