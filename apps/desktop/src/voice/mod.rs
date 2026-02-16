mod agora_engine;
mod api;
mod auth;
mod controller;
pub mod desktop_handoff;
pub mod duet_bridge;
pub mod jacktrip;
pub mod session;
pub mod transport;

pub use api::{
    create_duet_room_from_disk, end_duet_room_from_disk, get_duet_public_info, search_songs,
    send_chat_message_from_disk_auth, start_duet_room_from_disk, start_duet_segment_from_disk,
    ChatHistoryItem, CreateDuetRoomRequest, DuetRoomSegment, SongSearchItem, SongSearchResponse,
    StartDuetSegmentResponse, VoiceEndpoints,
};
pub use controller::{ScarlettVoiceController, VoiceSnapshot, VoiceState};
