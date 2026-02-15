use super::*;

impl LibraryView {
    pub(in crate::library) fn pick_and_update_playlist_cover(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        visibility: u8,
        cx: &mut Context<Self>,
    ) {
        if self.playlist_cover_update_busy {
            return;
        }

        let playlist_id_norm = playlist_id.trim().to_lowercase();
        if playlist_id_norm.is_empty() {
            self.set_status_message("Playlist is missing an ID.", cx);
            return;
        }
        if !playlist_id_norm.starts_with("0x") || playlist_id_norm.starts_with("optimistic:") {
            self.set_status_message(
                "Playlist is still syncing. Try updating the cover again in a moment.",
                cx,
            );
            return;
        }

        let playlist_name = sanitize_detail_value(playlist_name, "Untitled Playlist");
        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in before updating playlist covers.", cx);
                return;
            }
        };

        // Clear any stale sticky progress status for the library (e.g. older cover-picker messages).
        cx.update_global::<crate::status_center::StatusCenter, _>(|status, _| {
            status.dismiss_key("library");
        });

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let picked = smol::unblock(|| {
                rfd::FileDialog::new()
                    .set_title("Choose Playlist Cover")
                    .add_filter("Image", &["jpg", "jpeg", "png", "webp", "bmp"])
                    .pick_file()
            })
            .await;

            let Some(path) = picked else {
                return;
            };

            let selected = path.to_string_lossy().to_string();
            let _ = this.update(cx, |this, cx| {
                this.playlist_cover_update_busy = true;
                this.playlist_cover_update_playlist_id = Some(playlist_id_norm.clone());
                this.playlist_cover_update_optimistic_path = Some(selected.clone());
                this.playlist_cover_update_error = None;
                cx.notify();
            });

            let cover_input = smol::unblock({
                let selected = selected.clone();
                move || {
                    playlist_cover_image_input_from_path(Some(selected.as_str()))?
                        .ok_or_else(|| "Cover selection returned no bytes.".to_string())
                }
            })
            .await;

            let result: Result<String, String> = match cover_input {
                Ok(cover_image) => {
                    smol::unblock({
                        let storage = storage.clone();
                        let auth = auth.clone();
                        let selected = selected.clone();
                        let playlist_id = playlist_id_norm.clone();
                        let playlist_name = playlist_name.clone();
                        move || {
                            let mut svc =
                                storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                            let cover_ref = svc.playlist_upload_cover_to_arweave_turbo(
                                &auth,
                                &cover_image,
                                Some(selected.as_str()),
                            )?;
                            let payload = svc.playlist_update_meta(
                                &auth,
                                &playlist_id,
                                &playlist_name,
                                Some(cover_ref.as_str()),
                                visibility,
                                None,
                            )?;
                            let returned_cover = payload
                                .get("coverCid")
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                                .map(str::to_string)
                                .unwrap_or(cover_ref);
                            Ok(returned_cover)
                        }
                    })
                    .await
                }
                Err(err) => Err(err),
            };

            let _ = this.update(cx, |this, cx| {
                this.playlist_cover_update_busy = false;
                this.playlist_cover_update_optimistic_path = None;

                match result {
                    Ok(cover_cid) => {
                        this.playlist_cover_update_playlist_id = None;
                        if let Some(pl) = this
                            .sidebar_playlists
                            .iter_mut()
                            .find(|pl| pl.id.eq_ignore_ascii_case(&playlist_id_norm))
                        {
                            pl.cover_cid = Some(cover_cid.clone());
                        }
                        if let Some(pl) = this
                            .playlist_modal_playlists
                            .iter_mut()
                            .find(|pl| pl.id.eq_ignore_ascii_case(&playlist_id_norm))
                        {
                            pl.cover_cid = Some(cover_cid.clone());
                        }

                        this.set_status_message("Playlist cover saved to chain.", cx);
                    }
                    Err(err) => {
                        this.playlist_cover_update_playlist_id = Some(playlist_id_norm.clone());
                        this.playlist_cover_update_error = Some(format!(
                            "Cover update failed: {}",
                            summarize_status_error(&err)
                        ));
                    }
                }

                cx.notify();
            });
        })
        .detach();
    }
}
