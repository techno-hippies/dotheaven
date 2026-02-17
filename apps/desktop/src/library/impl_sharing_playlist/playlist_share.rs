use super::*;

mod grant;
mod repair;
mod task;

#[derive(Debug, Clone)]
struct PlaylistSharePreparedTrack {
    track_id: String,
    title: String,
    artist: String,
    album: String,
    local_track: Option<TrackRow>,
    uploaded_record: Option<UploadedTrackRecord>,
}

#[derive(Debug, Clone)]
struct PlaylistShareResolvedTrack {
    title: String,
    artist: String,
    album: String,
    track_id: Option<String>,
    content_id: String,
    piece_cid: String,
    gateway_url: String,
}

fn extract_field_string(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty() && *v != "n/a")
        .map(str::to_string)
}

impl LibraryView {
    pub(in crate::library) fn open_playlist_share_modal(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        cx: &mut Context<Self>,
    ) {
        self.refresh_uploaded_index_from_auth();
        self.playlist_share_modal_open = true;
        self.playlist_share_modal_playlist_id = Some(playlist_id);
        self.playlist_share_modal_playlist_name = Some(playlist_name);
        self.playlist_share_modal_submitting = false;
        self.playlist_share_modal_error = None;

        // Defensive: avoid overlapping modals.
        if self.share_modal_open {
            self.share_modal_open = false;
            self.share_modal_track_index = None;
            self.share_modal_submitting = false;
            self.share_modal_error = None;
        }

        cx.notify();
    }

    pub(in crate::library) fn close_playlist_share_modal(&mut self, cx: &mut Context<Self>) {
        self.playlist_share_modal_open = false;
        self.playlist_share_modal_playlist_id = None;
        self.playlist_share_modal_playlist_name = None;
        self.playlist_share_modal_submitting = false;
        self.playlist_share_modal_error = None;
        cx.notify();
    }

    pub(in crate::library) fn submit_playlist_share_modal(&mut self, cx: &mut Context<Self>) {
        if self.playlist_share_modal_submitting || self.upload_busy {
            return;
        }

        let playlist_id = match self.playlist_share_modal_playlist_id.clone() {
            Some(v) => v,
            None => {
                self.playlist_share_modal_error =
                    Some("No playlist selected for sharing.".to_string());
                cx.notify();
                return;
            }
        };
        let playlist_name = self
            .playlist_share_modal_playlist_name
            .clone()
            .unwrap_or_else(|| "Selected playlist".to_string());
        match &self.detail_route {
            LibraryDetailRoute::Playlist {
                playlist_id: current,
                ..
            } if current.eq_ignore_ascii_case(&playlist_id) => {}
            _ => {
                self.playlist_share_modal_error = Some(
                    "Playlist view changed; open the playlist again before sharing.".to_string(),
                );
                cx.notify();
                return;
            }
        }

        let raw_wallet = self
            .share_wallet_input_state
            .read(cx)
            .value()
            .trim()
            .to_string();
        if raw_wallet.is_empty() {
            self.playlist_share_modal_error =
                Some("Enter recipient EVM wallet address.".to_string());
            cx.notify();
            return;
        }
        let grantee_addr = match raw_wallet.parse::<Address>() {
            Ok(addr) => addr,
            Err(_) => {
                self.playlist_share_modal_error = Some("Invalid EVM wallet address.".to_string());
                cx.notify();
                return;
            }
        };
        let grantee_hex = format!("{:#x}", grantee_addr).to_lowercase();

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.playlist_share_modal_error =
                    Some("Sign in before sharing playlists.".to_string());
                cx.notify();
                return;
            }
        };
        if let Err(err) = auth.require_lit_auth("Playlist sharing") {
            self.playlist_share_modal_error = Some(err);
            cx.notify();
            return;
        }
        let owner_address = auth
            .primary_wallet_address()
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        if owner_address.is_empty() {
            self.playlist_share_modal_error =
                Some("Authenticated wallet is unavailable; sign in again.".to_string());
            cx.notify();
            return;
        }

        let tracks_snapshot = self.tracks.clone();
        let mut prepared = Vec::<PlaylistSharePreparedTrack>::new();
        let mut seen_track_ids = HashSet::<String>::new();
        for track in self.playlist_detail_tracks.iter() {
            let track_id = track.track_id.trim().to_lowercase();
            if track_id.is_empty() || !seen_track_ids.insert(track_id.clone()) {
                continue;
            }
            let local_track = track
                .local_track_index
                .and_then(|idx| tracks_snapshot.get(idx).cloned());
            let uploaded_record = local_track
                .as_ref()
                .and_then(|t| self.uploaded_index.get(&t.file_path))
                .cloned();
            prepared.push(PlaylistSharePreparedTrack {
                track_id,
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                local_track,
                uploaded_record,
            });
        }

        if prepared.is_empty() {
            self.playlist_share_modal_error =
                Some("No tracks found in this playlist yet.".to_string());
            cx.notify();
            return;
        }

        log::info!(
            "[Library] playlist share submit: playlistId={} name=\"{}\" tracks={} grantee={}",
            abbreviate_for_status(&playlist_id),
            playlist_name,
            prepared.len(),
            grantee_hex
        );

        self.playlist_share_modal_submitting = true;
        self.playlist_share_modal_error = None;
        self.upload_busy = true;
        self.set_status_message(
            format!(
                "Sharing playlist \"{}\" with {} (0/{})...",
                playlist_name,
                abbreviate_for_status(&grantee_hex),
                prepared.len()
            ),
            cx,
        );
        // Keep sharing in the background so the rest of the UI remains interactive.
        self.playlist_share_modal_open = false;
        self.playlist_share_modal_playlist_id = None;
        self.playlist_share_modal_playlist_name = None;
        self.playlist_share_modal_error = None;
        cx.notify();

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            task::run_playlist_share_task(
                this,
                cx,
                storage,
                auth,
                owner_address,
                grantee_hex,
                playlist_id,
                playlist_name,
                prepared,
            )
            .await;
        })
        .detach();
    }
}
