use super::*;

impl LibraryView {
    pub(in crate::library) fn submit_scrobble_for_track(
        &mut self,
        track: TrackRow,
        played_at_sec: u64,
        cx: &mut Context<Self>,
    ) {
        let Some(auth) = auth::load_from_disk() else {
            log::warn!("[Scrobble] skipped: user not authenticated");
            return;
        };
        let user_address = auth
            .wallet_address()
            .as_deref()
            .map(str::to_string)
            .unwrap_or_else(|| "-".to_string());

        let dedupe_key = format!("{}:{}:{}", track.file_path, track.title, played_at_sec);
        if self.last_scrobbled_key.as_deref() == Some(dedupe_key.as_str()) {
            return;
        }
        self.last_scrobbled_key = Some(dedupe_key);
        log::info!(
            "[Scrobble] queue submit: user={} title='{}' artist='{}' playedAt={} coverPath={}",
            user_address,
            track.title,
            track.artist,
            played_at_sec,
            track
                .cover_path
                .as_deref()
                .filter(|v| !v.trim().is_empty())
                .unwrap_or("-")
        );

        let Some(service) = self.scrobble_service.clone() else {
            log::warn!("[Scrobble] skipped: scrobble service unavailable");
            return;
        };
        let db_handle = self.db.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let scrobble_cover_path = track.cover_path.clone();
            let scrobble_track_path = track.file_path.clone();
            let scrobble_track_title = track.title.clone();
            let scrobble_track_artist = track.artist.clone();
            let scrobble_track_album = track.album.clone();
            let scrobble_track_duration = track.duration.clone();
            let service_for_submit = service.clone();
            let service_for_cover_sync = service.clone();
            let service_for_lyrics_sync = service.clone();
            let auth_for_cover_sync = auth.clone();
            let auth_for_lyrics_sync = auth.clone();
            let db_for_cover_sync = db_handle.clone();
            let db_for_lyrics_sync = db_handle.clone();
            let result = smol::unblock(move || {
                let mut service = service_for_submit
                    .lock()
                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                service.submit_track(&auth, &track, played_at_sec)
            })
            .await;

            match result {
                Ok(ok) => {
                    let scrobble_track_id = ok.track_id.clone();
                    let scrobble_already_registered = ok.already_registered;
                    log::info!(
                        "[Scrobble] submitted: txHash={} sender={} trackId={} alreadyRegistered={}",
                        ok.tx_hash,
                        ok.sender,
                        scrobble_track_id,
                        scrobble_already_registered
                    );
                    let _ = this.update(cx, |_this, cx| {
                        _this.enqueue_scrobble_media_pending(
                            &scrobble_track_id,
                            scrobble_cover_path.as_deref(),
                        );
                        log::info!("[Scrobble] refresh signal bump: immediate");
                        cx.update_global::<crate::scrobble_refresh::ScrobbleRefreshSignal, _>(
                            |signal, _| {
                                signal.bump();
                            },
                        );
                        // Tempo confirmation can lag behind initial broadcast acceptance.
                        // Schedule a few delayed bumps to catch post-broadcast confirmation.
                        for delay_ms in [6_000_u64, 20_000_u64, 60_000_u64] {
                            cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
                                smol::Timer::after(std::time::Duration::from_millis(delay_ms)).await;
                                let _ = this.update(cx, |_this, cx| {
                                    log::info!("[Scrobble] refresh signal bump: delayed={}ms", delay_ms);
                                    cx.update_global::<crate::scrobble_refresh::ScrobbleRefreshSignal, _>(
                                        |signal, _| {
                                            signal.bump();
                                        },
                                    );
                                });
                            })
                            .detach();
                        }
                    });

                    let cover_sync_track_id = scrobble_track_id.clone();
                    let cover_sync_cover_path = scrobble_cover_path.clone();
                    let cover_sync_result = smol::unblock(move || {
                        let track_id = cover_sync_track_id.trim().to_ascii_lowercase();
                        if track_id.is_empty() {
                            return Err("cover sync missing track_id".to_string());
                        }

                        let cover_sync_supported = {
                            let mut service = service_for_cover_sync
                                .lock()
                                .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                            service.supports_track_cover_sync(&auth_for_cover_sync)?
                        };
                        if !cover_sync_supported {
                            if let Some(db_handle) = db_for_cover_sync.as_ref() {
                                let db = db_handle
                                    .lock()
                                    .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                                db.set_track_media_state_skipped(&track_id)?;
                            }
                            return Ok(
                                "skipped: setTrackCoverFor is not deployed on configured contract"
                                    .to_string(),
                            );
                        }

                        let mut existing_cover_ref: Option<String> = None;
                        let mut existing_cover_local: Option<String> = None;
                        let mut existing_status: Option<String> = None;

                        if let Some(db_handle) = db_for_cover_sync.as_ref() {
                            let db = db_handle
                                .lock()
                                .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                            if let Some(row) = db.get_track_media_state(&track_id)? {
                                existing_cover_ref = row
                                    .cover_ref
                                    .as_deref()
                                    .map(str::trim)
                                    .filter(|v| !v.is_empty())
                                    .map(str::to_string);
                                existing_cover_local = row
                                    .cover_local
                                    .as_deref()
                                    .map(str::trim)
                                    .filter(|v| !v.is_empty())
                                    .map(str::to_string);
                                existing_status = Some(row.cover_status.trim().to_ascii_lowercase());
                            }
                        }

                        if existing_status.as_deref() == Some("synced") {
                            if let Some(existing_cover_ref) = existing_cover_ref {
                                return Ok(format!("already synced: {}", existing_cover_ref));
                            }
                            return Ok("already synced".to_string());
                        }

                        let mut cover_ref = existing_cover_ref;
                        if cover_ref.is_none() {
                            let onchain_cover_ref = {
                                let mut service = service_for_cover_sync
                                    .lock()
                                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                                service.read_track_cover_ref(&auth_for_cover_sync, &track_id)?
                            };
                            if let Some(onchain_cover_ref) = onchain_cover_ref {
                                if let Some(db_handle) = db_for_cover_sync.as_ref() {
                                    let db = db_handle
                                        .lock()
                                        .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                                    db.set_track_media_state_synced(&track_id, &onchain_cover_ref)?;
                                }
                                return Ok(format!("already onchain: {}", onchain_cover_ref));
                            }

                            let cover_local = cover_sync_cover_path
                                .as_deref()
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                                .map(str::to_string)
                                .or(existing_cover_local);

                            let Some(cover_local) = cover_local else {
                                if let Some(db_handle) = db_for_cover_sync.as_ref() {
                                    let db = db_handle
                                        .lock()
                                        .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                                    db.set_track_media_state_skipped(&track_id)?;
                                }
                                return Ok("skipped: no local cover".to_string());
                            };

                            let uploaded_cover_ref = {
                                let mut service = service_for_cover_sync
                                    .lock()
                                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                                service.upload_track_cover_ref(&auth_for_cover_sync, &cover_local)?
                            };

                            if let Some(db_handle) = db_for_cover_sync.as_ref() {
                                let db = db_handle
                                    .lock()
                                    .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                                db.set_track_media_state_uploaded(&track_id, &uploaded_cover_ref)?;
                            }
                            cover_ref = Some(uploaded_cover_ref);
                        }

                        let cover_ref = cover_ref.unwrap_or_default();
                        if cover_ref.trim().is_empty() {
                            return Err("cover sync failed to resolve a cover ref".to_string());
                        }

                        let synced_cover_ref = {
                            let mut service = service_for_cover_sync
                                .lock()
                                .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                            service.ensure_track_cover_synced(
                                &auth_for_cover_sync,
                                &track_id,
                                &cover_ref,
                            )?
                        };

                        if let Some(db_handle) = db_for_cover_sync.as_ref() {
                            let db = db_handle
                                .lock()
                                .map_err(|e| format!("cover sync db lock failed: {e}"))?;
                            db.set_track_media_state_synced(&track_id, &synced_cover_ref)?;
                        }

                        Ok(format!("synced: {}", synced_cover_ref))
                    })
                    .await;

                    match cover_sync_result {
                        Ok(message) => {
                            log::info!(
                                "[Scrobble] cover sync: trackId={} {}",
                                scrobble_track_id,
                                message
                            );
                        }
                        Err(err) => {
                            log::warn!(
                                "[Scrobble] cover sync failed: trackId={} err={}",
                                scrobble_track_id,
                                err
                            );
                        }
                    }

                    let lyrics_sync_track_id = scrobble_track_id.clone();
                    let lyrics_sync_track_path = scrobble_track_path.clone();
                    let lyrics_sync_track_title = scrobble_track_title.clone();
                    let lyrics_sync_track_artist = scrobble_track_artist.clone();
                    let lyrics_sync_track_album = scrobble_track_album.clone();
                    let lyrics_sync_track_duration = scrobble_track_duration.clone();
                    let lyrics_sync_result = smol::unblock(move || {
                        let track_id = lyrics_sync_track_id.trim().to_ascii_lowercase();
                        if track_id.is_empty() {
                            return Err("lyrics sync missing track_id".to_string());
                        }

                        let lyrics_sync_supported = {
                            let mut service = service_for_lyrics_sync
                                .lock()
                                .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                            service.supports_track_lyrics_sync(&auth_for_lyrics_sync)?
                        };
                        if !lyrics_sync_supported {
                            if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                                let db = db_handle
                                    .lock()
                                    .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                                db.set_track_lyrics_state_skipped(&track_id)?;
                            }
                            return Ok(
                                "skipped: setTrackLyricsFor is not deployed on configured contract"
                                    .to_string(),
                            );
                        }

                        let mut existing_lyrics_ref: Option<String> = None;
                        let mut existing_status: Option<String> = None;

                        if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                            let db = db_handle
                                .lock()
                                .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                            if let Some(row) = db.get_track_lyrics_state(&track_id)? {
                                existing_lyrics_ref = row
                                    .lyrics_ref
                                    .as_deref()
                                    .map(str::trim)
                                    .filter(|v| !v.is_empty())
                                    .map(str::to_string);
                                existing_status = Some(row.lyrics_status.trim().to_ascii_lowercase());
                            }
                        }

                        if existing_status.as_deref() == Some("synced") {
                            if let Some(existing_lyrics_ref) = existing_lyrics_ref {
                                return Ok(format!("already synced: {}", existing_lyrics_ref));
                            }
                            return Ok("already synced".to_string());
                        }

                        let mut lyrics_ref = existing_lyrics_ref;
                        if lyrics_ref.is_none() {
                            let onchain_lyrics_ref = {
                                let mut service = service_for_lyrics_sync
                                    .lock()
                                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                                service.read_track_lyrics_ref(&auth_for_lyrics_sync, &track_id)?
                            };
                            if let Some(onchain_lyrics_ref) = onchain_lyrics_ref {
                                if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                                    let db = db_handle
                                        .lock()
                                        .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                                    db.set_track_lyrics_state_synced(&track_id, &onchain_lyrics_ref)?;
                                }
                                return Ok(format!("already onchain: {}", onchain_lyrics_ref));
                            }

                            let signature = crate::lyrics::LyricsTrackSignature {
                                track_path: lyrics_sync_track_path.clone(),
                                track_name: lyrics_sync_track_title.clone(),
                                artist_name: lyrics_sync_track_artist.clone(),
                                album_name: lyrics_sync_track_album.clone(),
                                duration_sec: crate::lyrics::parse_duration_label_to_seconds(
                                    &lyrics_sync_track_duration,
                                ),
                            };
                            let resolved =
                                crate::lyrics::resolve_lyrics_for_track(&signature, db_for_lyrics_sync.clone())?;
                            if !resolved.has_any_lyrics() {
                                if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                                    let db = db_handle
                                        .lock()
                                        .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                                    db.set_track_lyrics_state_skipped(&track_id)?;
                                }
                                return Ok("skipped: no lyrics".to_string());
                            }

                            let payload = serde_json::json!({
                                "trackId": track_id.clone(),
                                "trackName": lyrics_sync_track_title,
                                "artistName": lyrics_sync_track_artist,
                                "albumName": lyrics_sync_track_album,
                                "durationSec": signature.duration_sec,
                                "source": resolved.source.label(),
                                "lrclibId": resolved.lrclib_id,
                                "fetchedAt": resolved.fetched_at_epoch_sec,
                                "plainLyrics": resolved.plain_lyrics,
                                "syncedLyrics": resolved.synced_lyrics,
                            });
                            let payload_str = serde_json::to_string(&payload)
                                .map_err(|e| format!("lyrics payload encode failed: {e}"))?;
                            let uploaded_lyrics_ref = {
                                let mut service = service_for_lyrics_sync
                                    .lock()
                                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                                service.upload_track_lyrics_ref(
                                    &auth_for_lyrics_sync,
                                    &track_id,
                                    &payload_str,
                                )?
                            };

                            if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                                let db = db_handle
                                    .lock()
                                    .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                                db.set_track_lyrics_state_uploaded(&track_id, &uploaded_lyrics_ref)?;
                            }
                            lyrics_ref = Some(uploaded_lyrics_ref);
                        }

                        let lyrics_ref = lyrics_ref.unwrap_or_default();
                        if lyrics_ref.trim().is_empty() {
                            return Err("lyrics sync failed to resolve a lyrics ref".to_string());
                        }

                        let synced_lyrics_ref = {
                            let mut service = service_for_lyrics_sync
                                .lock()
                                .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                            service.ensure_track_lyrics_synced(
                                &auth_for_lyrics_sync,
                                &track_id,
                                &lyrics_ref,
                            )?
                        };

                        if let Some(db_handle) = db_for_lyrics_sync.as_ref() {
                            let db = db_handle
                                .lock()
                                .map_err(|e| format!("lyrics sync db lock failed: {e}"))?;
                            db.set_track_lyrics_state_synced(&track_id, &synced_lyrics_ref)?;
                        }

                        Ok(format!("synced: {}", synced_lyrics_ref))
                    })
                    .await;

                    match lyrics_sync_result {
                        Ok(message) => {
                            log::info!(
                                "[Scrobble] lyrics sync: trackId={} {}",
                                scrobble_track_id,
                                message
                            );
                        }
                        Err(err) => {
                            log::warn!(
                                "[Scrobble] lyrics sync failed: trackId={} err={}",
                                scrobble_track_id,
                                err
                            );
                        }
                    }
                }
                Err(err) => {
                    log::error!("[Scrobble] submit failed: {}", err);
                }
            }
        })
        .detach();
    }
}
