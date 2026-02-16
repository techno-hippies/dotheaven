use super::*;

const JACKTRIP_INVITE_PREFIX: &str = "[heaven-jacktrip-room-v1]"; // legacy format
const JACKTRIP_INVITE_HEADER: &str = "Heaven JackTrip Invite";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct JackTripRoomInvite {
    pub version: u8,
    pub invite_id: String,
    pub room_id: String,
    pub host_wallet: String,
    pub host_display: String,
    pub created_at_ms: i64,
    pub join_url: String,
}

pub(crate) fn encode_jacktrip_invite(invite: &JackTripRoomInvite) -> Result<String, String> {
    if invite.join_url.trim().is_empty() {
        return Err("invite join URL is empty".to_string());
    }
    Ok(format!(
        "{JACKTRIP_INVITE_HEADER}\nInvite: {}\nRoom: {}\nHost: {}\nHost Wallet: {}\nJoin: {}",
        invite.invite_id, invite.room_id, invite.host_display, invite.host_wallet, invite.join_url
    ))
}

pub(crate) fn parse_jacktrip_invite(content: &str) -> Option<JackTripRoomInvite> {
    let trimmed = content.trim();
    if let Some(payload) = trimmed.strip_prefix(JACKTRIP_INVITE_PREFIX) {
        // Backward compatibility for the initial machine-only payload.
        return serde_json::from_str(payload).ok();
    }

    let mut lines = trimmed.lines();
    if lines.next()?.trim() != JACKTRIP_INVITE_HEADER {
        return None;
    }

    let mut invite_id: Option<String> = None;
    let mut room_id: Option<String> = None;
    let mut host_display: Option<String> = None;
    let mut host_wallet: Option<String> = None;
    let mut join_url: Option<String> = None;

    for line in lines {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("Invite:") {
            invite_id = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Room:") {
            room_id = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Host:") {
            host_display = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Host Wallet:") {
            host_wallet = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Join:") {
            join_url = Some(value.trim().to_string());
        }
    }

    Some(JackTripRoomInvite {
        version: 1,
        invite_id: invite_id?,
        room_id: room_id?,
        host_wallet: host_wallet?,
        host_display: host_display?,
        created_at_ms: 0,
        join_url: join_url?,
    })
}

pub(crate) fn preview_text_for_content(content: &str) -> String {
    if let Some(invite) = parse_jacktrip_invite(content) {
        return normalize_preview_text(&format!("JackTrip invite from {}", invite.host_display));
    }
    normalize_preview_text(content)
}
