use super::upload::{
    build_uploaded_track_record, track_meta_input_from_row, upload_track_with_diagnostics,
};
use super::*;

impl LibraryView {
    pub(in crate::library) fn open_share_modal(
        &mut self,
        track_index: usize,
        cx: &mut Context<Self>,
    ) {
        self.refresh_uploaded_index_from_auth();
        self.share_modal_open = true;
        self.share_modal_track_index = Some(track_index);
        self.share_modal_submitting = false;
        self.share_modal_error = None;
        cx.notify();
    }

    pub(in crate::library) fn close_share_modal(&mut self, cx: &mut Context<Self>) {
        self.share_modal_open = false;
        self.share_modal_track_index = None;
        self.share_modal_submitting = false;
        self.share_modal_error = None;
        cx.notify();
    }

    pub(in crate::library) fn submit_share_modal(&mut self, cx: &mut Context<Self>) {
        if self.share_modal_submitting {
            return;
        }

        let raw_wallet = self
            .share_wallet_input_state
            .read(cx)
            .value()
            .trim()
            .to_string();
        if raw_wallet.is_empty() {
            self.share_modal_error = Some("Enter recipient EVM wallet address.".to_string());
            cx.notify();
            return;
        }
        let grantee_addr = match raw_wallet.parse::<Address>() {
            Ok(addr) => addr,
            Err(_) => {
                self.share_modal_error = Some("Invalid EVM wallet address.".to_string());
                cx.notify();
                return;
            }
        };
        let grantee_hex = format!("{:#x}", grantee_addr).to_lowercase();

        let Some(track_index) = self.share_modal_track_index else {
            self.share_modal_error = Some("No track selected for sharing.".to_string());
            cx.notify();
            return;
        };
        let Some(track) = self.tracks.get(track_index).cloned() else {
            self.share_modal_error = Some("Track not found.".to_string());
            cx.notify();
            return;
        };

        self.refresh_uploaded_index_from_auth();
        let uploaded = self.uploaded_index.get(&track.file_path).cloned();

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.share_modal_error = Some("Sign in before sharing tracks.".to_string());
                cx.notify();
                return;
            }
        };
        let owner_address = auth.pkp_address.clone().unwrap_or_default().to_lowercase();

        self.share_modal_submitting = true;
        self.share_modal_error = None;
        self.set_status_message(
            format!(
                "Granting access for \"{}\" to {}...",
                track.title,
                abbreviate_for_status(&grantee_hex)
            ),
            cx,
        );
        // Keep sharing in the background so the rest of the UI remains interactive.
        self.share_modal_open = false;
        self.share_modal_track_index = None;
        self.share_modal_error = None;
        cx.notify();

        let storage = self.storage.clone();
        let grantee_for_request = grantee_hex.clone();
        let uploaded_for_request = uploaded.clone();
        let track_for_lookup = track.clone();
        let path_for_lookup = track.file_path.clone();
        let owner_for_lookup = owner_address.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let uploaded = if let Some(existing) = uploaded_for_request {
                    existing
                } else {
                    let track_meta = track_meta_input_from_row(&track_for_lookup);
                    let (resolved, default_register_version) = match svc
                        .resolve_registered_content_for_track(
                            &auth,
                            &path_for_lookup,
                            track_meta.clone(),
                        ) {
                        Ok(resolved) => (resolved, "onchain-recovered"),
                        Err(resolve_err) => {
                            log::warn!(
                                "[Library] direct share resolve failed: title=\"{}\" path=\"{}\" err={}",
                                track_for_lookup.title,
                                path_for_lookup,
                                resolve_err
                            );
                            if path_for_lookup.is_empty()
                                || !std::path::Path::new(&path_for_lookup).exists()
                            {
                                return Err(format!(
                                    "Track is not registered and file is missing on disk: {}",
                                    summarize_status_error(&resolve_err)
                                ));
                            }
                            match upload_track_with_diagnostics(
                                &mut svc,
                                &auth,
                                &path_for_lookup,
                                track_meta.clone(),
                            ) {
                                Ok(upload_resp) => (upload_resp, "n/a"),
                                Err(upload_err) => {
                                    if super::super::is_already_uploaded_error(&upload_err) {
                                        match svc.resolve_registered_content_for_track(
                                            &auth,
                                            &path_for_lookup,
                                            track_meta,
                                        ) {
                                            Ok(resolved_after_upload) => {
                                                (resolved_after_upload, "onchain-recovered")
                                            }
                                            Err(resolve_after_err) => {
                                                return Err(format!(
                                                    "{upload_err}\nResolve after already-uploaded error failed: {resolve_after_err}"
                                                ));
                                            }
                                        }
                                    } else {
                                        return Err(upload_err);
                                    }
                                }
                            }
                        }
                    };

                    build_uploaded_track_record(
                        &owner_for_lookup,
                        &track_for_lookup,
                        &resolved,
                        default_register_version,
                        false,
                    )
                    .ok_or_else(|| {
                        "Share prep failed: register/resolve response missing content details."
                            .to_string()
                    })?
                };

                let grant_resp =
                    svc.content_grant_access(&auth, &uploaded.content_id, &grantee_for_request)?;
                Ok::<(UploadedTrackRecord, serde_json::Value), String>((uploaded, grant_resp))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let was_modal_submitting = this.share_modal_submitting;
                this.share_modal_submitting = false;
                match result {
                    Ok((uploaded_resolved, resp)) => {
                        if let Err(e) = upsert_uploaded_track_record(uploaded_resolved.clone()) {
                            log::error!(
                                "[Library] failed to persist recovered uploaded track record: {}",
                                e
                            );
                        } else {
                            this.uploaded_index_owner = Some(owner_address.clone());
                            this.uploaded_index.insert(
                                uploaded_resolved.file_path.clone(),
                                uploaded_resolved.clone(),
                            );
                        }

                        let tx_hash = resp.get("txHash").and_then(|v| v.as_str()).unwrap_or("n/a");
                        let mirror_tx_hash = resp
                            .get("mirrorTxHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");

                        let record = SharedGrantRecord {
                            owner_address,
                            grantee_address: grantee_hex.clone(),
                            title: uploaded_resolved.title.clone(),
                            artist: uploaded_resolved.artist.clone(),
                            album: uploaded_resolved.album.clone(),
                            track_id: Some(uploaded_resolved.track_id.clone()),
                            content_id: uploaded_resolved.content_id.clone(),
                            piece_cid: uploaded_resolved.piece_cid.clone(),
                            gateway_url: uploaded_resolved.gateway_url.clone(),
                            tx_hash: tx_hash.to_string(),
                            mirror_tx_hash: mirror_tx_hash.to_string(),
                            shared_at_ms: chrono::Utc::now().timestamp_millis(),
                        };
                        if let Err(e) = append_shared_grant_record(record) {
                            log::error!("[Library] failed to persist shared grant record: {}", e);
                        }

                        if this.share_modal_open && was_modal_submitting {
                            this.share_modal_open = false;
                            this.share_modal_track_index = None;
                            this.share_modal_error = None;
                        }
                        this.set_status_message(
                            format!(
                                "Shared \"{}\" with {}.",
                                uploaded_resolved.title,
                                abbreviate_for_status(&grantee_hex),
                            ),
                            cx,
                        );
                        if this.mode == LibraryMode::SharedWithMe {
                            this.refresh_shared_records_for_auth(cx);
                        }
                    }
                    Err(err) => {
                        log::error!("[Library] content share failed: {}", err);
                        if this.share_modal_open && was_modal_submitting {
                            this.share_modal_error = Some(summarize_status_error(&err));
                        }
                        this.set_status_message(
                            format!(
                                "Share failed for \"{}\": {}",
                                track.title,
                                summarize_status_error(&err)
                            ),
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
