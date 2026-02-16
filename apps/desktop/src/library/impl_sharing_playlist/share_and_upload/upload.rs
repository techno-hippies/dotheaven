use super::*;

pub(in crate::library) fn track_meta_input_from_row(track: &TrackRow) -> TrackMetaInput {
    TrackMetaInput {
        title: Some(track.title.clone()),
        artist: Some(track.artist.clone()),
        album: Some(track.album.clone()),
        mbid: track.mbid.clone(),
        ip_id: track.ip_id.clone(),
    }
}

pub(in crate::library) fn build_uploaded_track_record(
    owner_address: &str,
    track: &TrackRow,
    response: &Value,
    default_register_version: &str,
    saved_forever: bool,
) -> Option<UploadedTrackRecord> {
    let owner_address = owner_address.trim().to_lowercase();
    if owner_address.is_empty() {
        return None;
    }

    let piece_cid = response
        .get("pieceCid")
        .and_then(Value::as_str)
        .unwrap_or("n/a")
        .trim();
    let content_id = response
        .get("contentId")
        .and_then(Value::as_str)
        .unwrap_or("n/a")
        .trim();
    if piece_cid.is_empty() || piece_cid == "n/a" || !content_id.starts_with("0x") {
        return None;
    }

    let track_id = response
        .get("trackId")
        .and_then(Value::as_str)
        .unwrap_or("n/a")
        .trim();
    let tx_hash = response
        .get("txHash")
        .and_then(Value::as_str)
        .unwrap_or("n/a")
        .trim();
    let gateway_url = response
        .get("gatewayUrl")
        .and_then(Value::as_str)
        .unwrap_or("n/a")
        .trim();
    let register_version = response
        .get("registerVersion")
        .and_then(Value::as_str)
        .unwrap_or(default_register_version)
        .trim();

    Some(UploadedTrackRecord {
        owner_address,
        file_path: track.file_path.clone(),
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: track.album.clone(),
        track_id: track_id.to_string(),
        content_id: content_id.to_string(),
        piece_cid: piece_cid.to_string(),
        gateway_url: gateway_url.to_string(),
        tx_hash: tx_hash.to_string(),
        register_version: register_version.to_string(),
        created_at_ms: chrono::Utc::now().timestamp_millis(),
        saved_forever,
    })
}

pub(in crate::library) fn upload_track_with_diagnostics(
    svc: &mut LoadStorageService,
    auth: &auth::PersistedAuth,
    file_path: &str,
    track_meta: TrackMetaInput,
) -> Result<Value, String> {
    match svc.content_encrypt_upload_register(auth, file_path, true, track_meta) {
        Ok(resp) => Ok(resp),
        Err(upload_err) => {
            let health = svc.health().ok();
            let storage_status = svc.storage_status(auth).ok();
            let diagnostic = serde_json::json!({
                "uploadError": upload_err,
                "storageHealth": health,
                "storageStatus": storage_status,
            });
            Err(serde_json::to_string_pretty(&diagnostic)
                .unwrap_or_else(|_| "Upload failed (diagnostic encoding failed)".to_string()))
        }
    }
}

pub(in crate::library) fn is_turbo_credit_blocker(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.contains("turbo credit is below minimum")
        || lower.contains("turbo balance check failed before upload")
        || (lower.contains("turbo") && lower.contains("use add funds"))
}

impl LibraryView {
    pub(in crate::library) fn encrypt_upload_track(
        &mut self,
        track: TrackRow,
        cx: &mut Context<Self>,
    ) {
        if self.upload_busy {
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in from Wallet before uploading.", cx);
                return;
            }
        };

        if track.file_path.is_empty() || !std::path::Path::new(&track.file_path).exists() {
            self.set_status_message("Track file is missing on disk; upload cancelled.", cx);
            return;
        }

        let track_title = track.title.clone();
        let track_for_record = track;
        let track_meta = track_meta_input_from_row(&track_for_record);
        let path = track_for_record.file_path.clone();
        let owner_address = auth.pkp_address.clone().unwrap_or_default().to_lowercase();

        self.upload_busy = true;
        self.set_status_message(
            format!("Encrypting and uploading \"{}\"...", track_title),
            cx,
        );

        let storage = self.storage.clone();
        let path_for_request = path.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                upload_track_with_diagnostics(&mut svc, &auth, &path_for_request, track_meta)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.upload_busy = false;
                match result {
                    Ok(resp) => {
                        let piece_cid = resp
                            .get("pieceCid")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let track_id = resp
                            .get("trackId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let tx_hash = resp.get("txHash").and_then(|v| v.as_str()).unwrap_or("n/a");
                        let gateway_url = resp
                            .get("gatewayUrl")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");
                        let reg_ver = resp
                            .get("registerVersion")
                            .and_then(|v| v.as_str())
                            .unwrap_or("n/a");

                        if let Some(record) = build_uploaded_track_record(
                            &owner_address,
                            &track_for_record,
                            &resp,
                            "n/a",
                            false,
                        ) {
                            this.persist_uploaded_record(
                                &track_title,
                                path.clone(),
                                owner_address.clone(),
                                record,
                                StorageStatus::Uploaded,
                            );
                        }

                        log::info!(
                            "[Library] encrypt+upload success for '{}' pieceCid={} trackId={} txHash={} registerVersion={} gatewayUrl={}",
                            track_title,
                            piece_cid,
                            track_id,
                            tx_hash,
                            reg_ver,
                            gateway_url,
                        );
                        log::debug!(
                            "[Library] encrypt+upload response for '{}': {}",
                            track_title,
                            serde_json::to_string_pretty(&resp)
                                .unwrap_or_else(|_| "<invalid response>".to_string())
                        );
                        this.set_status_message(
                            format!("Upload complete: \"{}\".", track_title),
                            cx,
                        );
                        this.fetch_storage_status(cx);
                    }
                    Err(err) => {
                        log::error!(
                            "[Library] encrypt+upload failed for '{}': {}",
                            track_title,
                            err
                        );
                        this.set_status_message(
                            format!(
                                "Encrypt + upload failed for \"{}\": {}",
                                track_title,
                                summarize_status_error(&err),
                            ),
                            cx,
                        );
                    }
                }
            });
        })
        .detach();
    }

    pub(in crate::library) fn save_track_forever(
        &mut self,
        track: TrackRow,
        cx: &mut Context<Self>,
    ) {
        if self.upload_busy {
            return;
        }

        if matches!(track.storage_status, StorageStatus::Permanent) {
            self.set_status_message(
                format!("\"{}\" is already marked as stored forever.", track.title),
                cx,
            );
            return;
        }

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in from Wallet before saving forever.", cx);
                return;
            }
        };

        let owner_address = auth.pkp_address.clone().unwrap_or_default().to_lowercase();
        if owner_address.is_empty() {
            self.set_status_message("PKP wallet is unavailable; sign in again.", cx);
            return;
        }

        let track_title = track.title.clone();
        log::info!(
            "[Library] save forever requested: title='{}' status={:?} file_path='{}'",
            track_title,
            track.storage_status,
            track.file_path
        );
        let path = track.file_path.clone();
        let existing_record = self.uploaded_index.get(&path).cloned();
        let track_for_request = track.clone();

        self.upload_busy = true;
        self.set_status_message(format!("Saving \"{}\" forever...", track_title), cx);

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let track_title_for_request = track_title.clone();
            let path_for_request = path.clone();
            let owner_for_request = owner_address.clone();
            let result = smol::unblock(move || {
                if let Some(mut existing) = existing_record {
                    existing.saved_forever = true;
                    return Ok::<(UploadedTrackRecord, bool, &'static str), String>((
                        existing,
                        false,
                        "existing-record",
                    ));
                }

                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let track_meta = track_meta_input_from_row(&track_for_request);

                match svc.resolve_registered_content_for_track(
                    &auth,
                    &path_for_request,
                    track_meta.clone(),
                ) {
                    Ok(resolved) => {
                        if let Some(record) = build_uploaded_track_record(
                            &owner_for_request,
                            &track_for_request,
                            &resolved,
                            "onchain-recovered",
                            true,
                        ) {
                            return Ok((record, false, "resolved-onchain"));
                        }
                        log::warn!(
                            "[Library] resolve registered content succeeded but payload was incomplete for '{}'",
                            track_title_for_request
                        );
                    }
                    Err(_resolve_err) => {}
                }

                if path_for_request.is_empty() || !std::path::Path::new(&path_for_request).exists()
                {
                    return Err("Track file is missing on disk; save forever cancelled.".to_string());
                }

                let upload_resp = upload_track_with_diagnostics(
                    &mut svc,
                    &auth,
                    &path_for_request,
                    track_meta,
                )?;
                let record = build_uploaded_track_record(
                    &owner_for_request,
                    &track_for_request,
                    &upload_resp,
                    "n/a",
                    true,
                )
                .ok_or_else(|| {
                    "Save forever upload succeeded but response was incomplete".to_string()
                })?;
                Ok((record, true, "uploaded-now"))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.upload_busy = false;
                match result {
                    Ok((record, used_upload, branch)) => {
                        this.persist_uploaded_record(
                            &track_title,
                            path.clone(),
                            owner_address.clone(),
                            record,
                            StorageStatus::Permanent,
                        );
                        log::info!(
                            "[Library] save forever success: title='{}' branch={} used_upload={}",
                            track_title,
                            branch,
                            used_upload
                        );

                        if used_upload {
                            this.set_status_message(
                                format!(
                                    "Upload complete and saved forever: \"{}\".",
                                    track_title
                                ),
                                cx,
                            );
                        } else if branch == "existing-record" {
                            this.set_status_message(
                                format!(
                                    "Marked \"{}\" as Saved Forever (already uploaded; no new upload).",
                                    track_title
                                ),
                                cx,
                            );
                        } else {
                            this.set_status_message(
                                format!(
                                    "Saved forever: \"{}\" (no new upload required).",
                                    track_title
                                ),
                                cx,
                            );
                        }
                        this.fetch_storage_status(cx);
                    }
                    Err(err) => {
                        if is_turbo_credit_blocker(&err) {
                            log::warn!(
                                "[Library] save forever blocked by turbo credit: title='{}' err={}",
                                track_title,
                                summarize_status_error(&err)
                            );
                            this.set_status_message(
                                "Turbo credits are low. Opening Add Credits...",
                                cx,
                            );
                            this.add_funds(cx);
                            return;
                        }
                        log::error!("[Library] save forever failed for '{}': {}", track_title, err);
                        this.set_status_message(
                            format!(
                                "Save forever failed for \"{}\": {}",
                                track_title,
                                summarize_status_error(&err),
                            ),
                            cx,
                        );
                    }
                }
            });
        })
        .detach();
    }

    pub(in crate::library) fn persist_uploaded_record(
        &mut self,
        track_title: &str,
        path: String,
        owner_address: String,
        record: UploadedTrackRecord,
        status: StorageStatus,
    ) {
        log::info!(
            "[Library] persist uploaded record (local): title='{}' status={:?} saved_forever={} contentId={} pieceCid={}",
            track_title,
            status,
            record.saved_forever,
            record.content_id,
            record.piece_cid,
        );
        if let Err(e) = upsert_uploaded_track_record(record.clone()) {
            log::error!(
                "[Library] failed to persist uploaded track record for '{}': {}",
                track_title,
                e
            );
            return;
        }

        self.uploaded_index_owner = Some(owner_address);
        self.uploaded_index.insert(path.clone(), record);
        self.set_track_storage_status(&path, status);
    }
}
