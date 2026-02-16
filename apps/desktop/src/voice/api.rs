mod agent_chat;
mod duet_rooms;
mod models;
mod songs;
mod util;

use super::auth::WorkerAuthContext;

pub use agent_chat::{send_chat_message, start_agent, stop_agent};
pub use duet_rooms::{
    create_duet_room_from_disk, discover_duet_rooms, end_duet_room_from_disk, get_duet_public_info,
    start_duet_room_from_disk, start_duet_segment_from_disk,
};
pub use models::{
    ChatHistoryItem, CreateDuetRoomRequest, DiscoverDuetRoomItem, SongSearchItem, VoiceEndpoints,
};
pub use songs::search_songs;

pub fn send_chat_message_from_disk_auth(
    endpoints: &VoiceEndpoints,
    message: &str,
    history: &[ChatHistoryItem],
) -> Result<String, String> {
    let mut auth = WorkerAuthContext::from_disk()?;
    send_chat_message(&mut auth, endpoints, message, history)
}
