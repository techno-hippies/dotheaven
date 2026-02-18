use super::share_and_upload::shared_library_target_path;
use super::*;

impl LibraryView {
    pub(in crate::library) fn play_shared_record(&mut self, index: usize, cx: &mut Context<Self>) {
        if self.shared_play_busy {
            return;
        }
        let Some(record) = self.shared_records.get(index).cloned() else {
            self.set_status_message("Shared track not found.", cx);
            return;
        };

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in before playing shared tracks.", cx);
                return;
            }
        };

        self.shared_play_busy = true;
        self.set_status_message(
            format!("Decrypting shared track \"{}\"...", record.title),
            cx,
        );

        let storage = self.storage.clone();
        let audio = self.audio.clone();
        let record_for_request = record.clone();
        let record_for_ui = record;
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.decrypt_shared_content_to_local_file(
                    &auth,
                    &record_for_request.content_id,
                    &record_for_request.piece_cid,
                    Some(&record_for_request.gateway_url),
                    Some(&record_for_request.title),
                    Some(&record_for_request.owner_address),
                    Some(&record_for_request.grantee_address),
                )
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.shared_play_busy = false;
                match result {
                    Ok(payload) => {
                        let local_path = payload
                            .get("localPath")
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        match local_path {
                            Some(path) => {
                                audio.play(&path, None, Some(record_for_ui.artist.clone()), None);
                                this.active_shared_playback = Some(ActiveSharedPlayback {
                                    content_id: record_for_ui.content_id.clone(),
                                    title: record_for_ui.title.clone(),
                                    artist: record_for_ui.artist.clone(),
                                    album: record_for_ui.album.clone(),
                                    local_path: path.clone(),
                                });
                                this.active_track_path = None;
                                this.playback_queue_paths.clear();
                                this.active_queue_pos = None;
                                this.track_started_at_sec = Some(now_epoch_sec());
                                let cache_hit = payload
                                    .get("cacheHit")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                if cache_hit {
                                    this.set_status_message(
                                        format!(
                                            "Playing shared track \"{}\" (cached decrypt).",
                                            record_for_ui.title
                                        ),
                                        cx,
                                    );
                                } else {
                                    this.set_status_message(
                                        format!(
                                            "Playing shared track \"{}\".",
                                            record_for_ui.title
                                        ),
                                        cx,
                                    );
                                }
                            }
                            None => {
                                this.set_status_message(
                                    "Shared decrypt succeeded but no local file was produced.",
                                    cx,
                                );
                            }
                        }
                    }
                    Err(err) => {
                        log::error!("[Library] shared playback failed: {}", err);
                        this.set_status_message(
                            format!("Shared playback failed: {}", summarize_status_error(&err)),
                            cx,
                        );
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }

    pub(in crate::library) fn decrypt_download_shared_record(
        &mut self,
        index: usize,
        cx: &mut Context<Self>,
    ) {
        if self.shared_play_busy {
            return;
        }
        let Some(record) = self.shared_records.get(index).cloned() else {
            self.set_status_message("Shared track not found.", cx);
            return;
        };

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.set_status_message("Sign in before downloading shared tracks.", cx);
                return;
            }
        };
        let library_root = match self.folder.clone() {
            Some(path) => path,
            None => {
                self.set_status_message(
                    "Pick a music folder first so shared downloads can be saved to <library>/Shared.",
                    cx,
                );
                return;
            }
        };
        let db = match self.db.clone() {
            Some(db) => db,
            None => {
                self.set_status_message("Local library DB is unavailable.", cx);
                return;
            }
        };

        self.shared_play_busy = true;
        self.set_status_message(
            format!("Decrypting and downloading \"{}\"...", record.title),
            cx,
        );

        let storage = self.storage.clone();
        let record_for_request = record.clone();
        let library_root_for_worker = library_root.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let payload = svc.decrypt_shared_content_to_local_file(
                    &auth,
                    &record_for_request.content_id,
                    &record_for_request.piece_cid,
                    Some(&record_for_request.gateway_url),
                    Some(&record_for_request.title),
                    Some(&record_for_request.owner_address),
                    Some(&record_for_request.grantee_address),
                )?;
                let local_path = payload
                    .get("localPath")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
                    .ok_or_else(|| {
                        "Shared decrypt succeeded but no local file was produced.".to_string()
                    })?;
                let source_path = PathBuf::from(&local_path);
                if !source_path.exists() {
                    return Err(format!(
                        "Decrypted shared file is missing on disk: {}",
                        source_path.display()
                    ));
                }

                let target_path = shared_library_target_path(
                    &library_root_for_worker,
                    &record_for_request.title,
                    &record_for_request.content_id,
                    &source_path,
                );
                let target_parent = target_path
                    .parent()
                    .ok_or_else(|| format!("Invalid target path: {}", target_path.display()))?;
                fs::create_dir_all(target_parent).map_err(|e| {
                    format!(
                        "Failed creating shared library folder ({}): {e}",
                        target_parent.display()
                    )
                })?;
                let copied = if target_path.exists() {
                    false
                } else {
                    fs::copy(&source_path, &target_path).map_err(|e| {
                        format!(
                            "Failed copying shared track into library ({} -> {}): {e}",
                            source_path.display(),
                            target_path.display()
                        )
                    })?;
                    true
                };

                let incremental_insert_error = match db.lock() {
                    Ok(db) => db
                        .insert_single_track(&library_root_for_worker, &target_path)
                        .err(),
                    Err(e) => Some(format!("db lock: {e}")),
                };

                let cache_hit = payload
                    .get("cacheHit")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                Ok::<(String, String, bool, bool, String, Option<String>), String>((
                    record_for_request.title.clone(),
                    target_path.to_string_lossy().to_string(),
                    cache_hit,
                    copied,
                    library_root_for_worker.clone(),
                    incremental_insert_error,
                ))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.shared_play_busy = false;
                match result {
                    Ok((title, target_path, cache_hit, copied, library_root, incremental_insert_error)) => {
                        let mut triggered_rescan = false;
                        if this.folder.as_deref() == Some(library_root.as_str()) {
                            if let Some(insert_err) = incremental_insert_error.as_ref() {
                                log::warn!(
                                    "[Library] incremental insert failed for shared download; falling back to full rescan: {}",
                                    insert_err
                                );
                                this.rescan(cx);
                                triggered_rescan = true;
                            } else if let Some(db) = &this.db {
                                this.loading = true;
                                Self::load_tracks_paged(db.clone(), library_root.clone(), cx);
                            }
                        }

                        let cache_note = if cache_hit { " (cached decrypt)" } else { "" };
                        if copied {
                            this.set_status_message(
                                format!(
                                    "Downloaded shared track \"{}\"{} to {}.",
                                    title, cache_note, target_path
                                ),
                                cx,
                            );
                        } else {
                            this.set_status_message(
                                format!(
                                    "Shared track \"{}\" already exists{} at {}.",
                                    title, cache_note, target_path
                                ),
                                cx,
                            );
                        }

                        if let Some(insert_err) = incremental_insert_error {
                            let recovery_note = if triggered_rescan {
                                "Running full rescan."
                            } else {
                                "Open Library and run Rescan."
                            };
                            this.set_status_message(
                                format!(
                                    "Downloaded \"{}\" but incremental library update failed ({}). {}",
                                    title,
                                    summarize_status_error(&insert_err),
                                    recovery_note
                                ),
                                cx,
                            );
                        }
                    }
                    Err(err) => {
                        log::error!("[Library] shared download failed: {}", err);
                        this.set_status_message(
                            format!("Shared download failed: {}", summarize_status_error(&err)),
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
