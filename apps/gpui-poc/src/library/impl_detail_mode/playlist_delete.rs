use super::*;

impl LibraryView {
    pub(in crate::library) fn open_delete_playlist_modal(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        cx: &mut Context<Self>,
    ) {
        let playlist_id = playlist_id.trim().to_lowercase();
        if playlist_id.is_empty() {
            self.set_status_message("Playlist is missing an ID.", cx);
            return;
        }
        if playlist_id.starts_with("optimistic:") {
            self.set_status_message(
                "Playlist is still syncing. Try deleting again in a moment.",
                cx,
            );
            return;
        }

        self.delete_playlist_modal_open = true;
        self.delete_playlist_modal_playlist_id = Some(playlist_id);
        self.delete_playlist_modal_playlist_name =
            Some(sanitize_detail_value(playlist_name, "Untitled Playlist"));
        self.delete_playlist_modal_submitting = false;
        self.delete_playlist_modal_error = None;
        cx.notify();
    }

    pub(in crate::library) fn close_delete_playlist_modal(&mut self, cx: &mut Context<Self>) {
        self.delete_playlist_modal_open = false;
        self.delete_playlist_modal_playlist_id = None;
        self.delete_playlist_modal_playlist_name = None;
        self.delete_playlist_modal_submitting = false;
        self.delete_playlist_modal_error = None;
        cx.notify();
    }

    pub(in crate::library) fn submit_delete_playlist_modal(&mut self, cx: &mut Context<Self>) {
        if self.delete_playlist_modal_submitting {
            return;
        }

        let playlist_id = self
            .delete_playlist_modal_playlist_id
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_lowercase();
        if playlist_id.is_empty() {
            self.delete_playlist_modal_error = Some("No playlist selected.".to_string());
            cx.notify();
            return;
        }
        let playlist_name = self
            .delete_playlist_modal_playlist_name
            .as_deref()
            .unwrap_or("Playlist")
            .to_string();

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.delete_playlist_modal_error =
                    Some("Sign in before deleting playlists.".to_string());
                cx.notify();
                return;
            }
        };

        self.delete_playlist_modal_submitting = true;
        self.delete_playlist_modal_error = None;
        self.set_status_message(format!("Deleting playlist \"{}\"...", playlist_name), cx);
        cx.notify();

        let storage = self.storage.clone();
        let playlist_id_for_request = playlist_id.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.playlist_delete(&auth, &playlist_id_for_request)?;
                Ok::<(), String>(())
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.delete_playlist_modal_submitting = false;
                match result {
                    Ok(()) => {
                        let now_ms = chrono::Utc::now().timestamp_millis();
                        this.delete_playlist_modal_open = false;
                        this.delete_playlist_modal_playlist_id = None;
                        this.delete_playlist_modal_playlist_name = None;
                        this.delete_playlist_modal_error = None;

                        this.remove_pending_playlist_mutation(&playlist_id);
                        this.record_deleted_playlist_tombstone(&playlist_id, now_ms);
                        this.playlist_detail_cache.remove(&playlist_id);
                        this.sidebar_playlists
                            .retain(|pl| !pl.id.eq_ignore_ascii_case(&playlist_id));
                        this.playlist_modal_playlists
                            .retain(|pl| !pl.id.eq_ignore_ascii_case(&playlist_id));

                        let deleted_playlist_active = matches!(
                            &this.detail_route,
                            LibraryDetailRoute::Playlist { playlist_id: active_id, .. }
                            if active_id.eq_ignore_ascii_case(&playlist_id)
                        );
                        if deleted_playlist_active {
                            this.open_library_root(cx);
                        }

                        this.set_status_message(
                            format!("Deleted playlist \"{}\".", playlist_name),
                            cx,
                        );
                        this.refresh_sidebar_playlists(cx);
                    }
                    Err(err) => {
                        log::error!("[Library] playlist delete failed: {}", err);
                        this.delete_playlist_modal_error = Some(summarize_status_error(&err));
                        this.set_status_message(
                            format!("Delete playlist failed: {}", summarize_status_error(&err)),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
