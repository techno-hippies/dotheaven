use super::*;

impl LibraryView {
    pub(in crate::library) fn open_playlist_modal(
        &mut self,
        track_index: usize,
        cx: &mut Context<Self>,
    ) {
        self.playlist_modal_open = true;
        self.playlist_modal_track_index = Some(track_index);
        self.playlist_modal_submitting = false;
        self.playlist_modal_error = None;
        self.playlist_modal_loading = true;
        self.playlist_modal_needs_reauth = false;
        self.playlist_modal_reauth_busy = false;
        self.playlist_modal_selected_playlist_id = None;
        self.playlist_modal_cover_image_path = None;
        self.playlist_modal_playlists.clear();
        self.fetch_playlists_for_modal(cx);
        cx.notify();
    }

    pub(in crate::library) fn close_playlist_modal(&mut self, cx: &mut Context<Self>) {
        self.playlist_modal_open = false;
        self.playlist_modal_track_index = None;
        self.playlist_modal_submitting = false;
        self.playlist_modal_error = None;
        self.playlist_modal_loading = false;
        self.playlist_modal_needs_reauth = false;
        self.playlist_modal_reauth_busy = false;
        self.playlist_modal_selected_playlist_id = None;
        self.playlist_modal_cover_image_path = None;
        self.playlist_modal_playlists.clear();
        cx.notify();
    }

    pub(in crate::library) fn fetch_playlists_for_modal(&mut self, cx: &mut Context<Self>) {
        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.playlist_modal_loading = false;
                self.playlist_modal_error = Some("Sign in before using playlists.".to_string());
                self.playlist_modal_needs_reauth = true;
                cx.notify();
                return;
            }
        };
        let owner = auth.pkp_address.clone().unwrap_or_default().to_lowercase();
        if owner.is_empty() {
            self.playlist_modal_loading = false;
            self.playlist_modal_error = Some("Missing wallet address in auth session.".to_string());
            self.playlist_modal_needs_reauth = true;
            cx.notify();
            return;
        }

        self.playlist_modal_loading = true;
        self.playlist_modal_error = None;
        self.playlist_modal_needs_reauth = false;
        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let raw = svc.playlist_fetch_user_playlists(&owner, 100)?;
                Ok::<Vec<PlaylistSummary>, String>(parse_playlist_summaries(&raw))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_loading = false;
                let now_ms = chrono::Utc::now().timestamp_millis();
                match result {
                    Ok(playlists) => {
                        let playlists = this.merge_pending_playlist_rows(playlists, now_ms);
                        let selected =
                            this.playlist_modal_selected_playlist_id
                                .as_ref()
                                .and_then(|current| {
                                    playlists
                                        .iter()
                                        .find(|playlist| playlist.id.eq_ignore_ascii_case(current))
                                        .map(|playlist| playlist.id.clone())
                                });
                        this.playlist_modal_selected_playlist_id = selected;
                        this.sidebar_playlists = playlists.clone();
                        this.playlist_modal_playlists = playlists;
                    }
                    Err(err) => {
                        this.playlist_modal_error = Some(err);
                        this.refresh_local_playlists_with_pending(now_ms);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
