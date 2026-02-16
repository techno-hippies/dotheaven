use super::*;

mod playlist_cover_picker;
mod playlist_modal;
mod playlist_share;
mod share_and_upload;
mod shared_playback;
mod state_and_shared_refresh;

fn is_already_uploaded_error(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.contains("already uploaded")
        || lower.contains("already exists")
        || lower.contains("content already registered")
        || (lower.contains("simulation failed") && lower.contains("already"))
}
