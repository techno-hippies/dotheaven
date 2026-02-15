use super::*;
use crate::lyrics::{parse_duration_label_to_seconds, LyricsTrackSignature};

impl LibraryView {
    pub fn set_mode(&mut self, mode: LibraryMode, cx: &mut Context<Self>) {
        self.mode = mode;
        match self.mode {
            LibraryMode::Library => {
                self.refresh_uploaded_index_from_auth();
            }
            LibraryMode::SharedWithMe => {
                self.refresh_shared_records_for_auth(cx);
            }
        }
        if self.mode != LibraryMode::Library {
            self.reset_detail_navigation();
        }
        cx.notify();
    }

    pub fn sidebar_playlists(&self) -> &[PlaylistSummary] {
        &self.sidebar_playlists
    }

    /// Returns the active playlist ID when the library is currently showing a playlist detail page.
    pub fn active_playlist_detail_id(&self) -> Option<String> {
        match &self.detail_route {
            LibraryDetailRoute::Playlist { playlist_id, .. } => Some(playlist_id.clone()),
            _ => None,
        }
    }

    /// Navigate to the root library list and clear any detail-page route.
    pub fn open_library_root(&mut self, cx: &mut Context<Self>) {
        self.mode = LibraryMode::Library;
        self.refresh_uploaded_index_from_auth();
        self.reset_detail_navigation();
        cx.notify();
    }

    pub fn track_metadata_for_path(&self, path: &str) -> Option<(String, String, String)> {
        if let Some(track) = self.tracks.iter().find(|track| track.file_path == path) {
            return Some((
                track.title.clone(),
                track.artist.clone(),
                track.album.clone(),
            ));
        }

        self.active_shared_playback
            .as_ref()
            .filter(|shared| shared.local_path == path)
            .map(|shared| {
                (
                    shared.title.clone(),
                    shared.artist.clone(),
                    shared.album.clone(),
                )
            })
    }

    pub fn lyrics_db_handle(&self) -> Option<Arc<Mutex<MusicDb>>> {
        self.db.clone()
    }

    pub fn lyrics_signature_for_path(
        &self,
        path: &str,
        duration_hint_sec: Option<u64>,
    ) -> Option<LyricsTrackSignature> {
        if let Some(track) = self.tracks.iter().find(|track| track.file_path == path) {
            return Some(LyricsTrackSignature {
                track_path: track.file_path.clone(),
                track_name: track.title.clone(),
                artist_name: track.artist.clone(),
                album_name: track.album.clone(),
                duration_sec: parse_duration_label_to_seconds(&track.duration)
                    .or(duration_hint_sec),
            });
        }

        self.active_shared_playback
            .as_ref()
            .filter(|shared| shared.local_path == path)
            .map(|shared| LyricsTrackSignature {
                track_path: shared.local_path.clone(),
                track_name: shared.title.clone(),
                artist_name: shared.artist.clone(),
                album_name: shared.album.clone(),
                duration_sec: duration_hint_sec,
            })
    }
}
