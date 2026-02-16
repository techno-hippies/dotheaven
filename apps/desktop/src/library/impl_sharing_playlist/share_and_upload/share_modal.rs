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
                    let resolved = svc.resolve_registered_content_for_track(
                        &auth,
                        &path_for_lookup,
                        TrackMetaInput {
                            title: Some(track_for_lookup.title.clone()),
                            artist: Some(track_for_lookup.artist.clone()),
                            album: Some(track_for_lookup.album.clone()),
                            mbid: track_for_lookup.mbid.clone(),
                            ip_id: track_for_lookup.ip_id.clone(),
                        },
                    )?;
                    UploadedTrackRecord {
                        owner_address: owner_for_lookup.clone(),
                        file_path: path_for_lookup.clone(),
                        title: track_for_lookup.title.clone(),
                        artist: track_for_lookup.artist.clone(),
                        album: track_for_lookup.album.clone(),
                        track_id: resolved
                            .get("trackId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        content_id: resolved
                            .get("contentId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        piece_cid: resolved
                            .get("pieceCid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        gateway_url: resolved
                            .get("gatewayUrl")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        tx_hash: resolved
                            .get("txHash")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a")
                            .to_string(),
                        register_version: resolved
                            .get("registerVersion")
                            .and_then(|v| v.as_str())
                            .unwrap_or("onchain-recovered")
                            .to_string(),
                        created_at_ms: chrono::Utc::now().timestamp_millis(),
                        saved_forever: false,
                    }
                };

                let grant_resp =
                    svc.content_grant_access(&auth, &uploaded.content_id, &grantee_for_request)?;
                Ok::<(UploadedTrackRecord, serde_json::Value), String>((uploaded, grant_resp))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
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

                        this.share_modal_open = false;
                        this.share_modal_track_index = None;
                        this.share_modal_error = None;
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
                        this.share_modal_error = Some(summarize_status_error(&err));
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
