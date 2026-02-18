use super::storage::format_duration_mmss;
use super::*;

impl LibraryView {
    fn enqueue_scrobble_media_pending(&mut self, track_id: &str, cover_path: Option<&str>) {
        let Some(db_handle) = self.db.as_ref() else {
            return;
        };
        let cover_path = cover_path.map(str::trim).filter(|v| !v.is_empty());
        let cover_status = if cover_path.is_some() {
            "pending"
        } else {
            "skipped"
        };

        let db = match db_handle.lock() {
            Ok(db) => db,
            Err(err) => {
                log::warn!(
                    "[Scrobble] media enqueue skipped: db lock failed trackId={} err={}",
                    track_id,
                    err
                );
                return;
            }
        };

        if let Err(err) = db.upsert_track_media_state_pending(track_id, cover_path) {
            log::warn!(
                "[Scrobble] media enqueue failed: trackId={} coverStatus={} err={}",
                track_id,
                cover_status,
                err
            );
            return;
        }
        if let Err(err) = db.upsert_track_lyrics_state_pending(track_id) {
            log::warn!(
                "[Scrobble] lyrics enqueue failed: trackId={} lyricsStatus=pending err={}",
                track_id,
                err
            );
            return;
        }

        log::info!(
            "[Scrobble] media enqueue: trackId={} coverStatus={} lyricsStatus=pending",
            track_id,
            cover_status
        );
    }

    pub(in crate::library) fn sync_search_query_from_input(&mut self, cx: &mut Context<Self>) {
        self.search_query = self.library_search_input_state.read(cx).value().to_string();
    }

    pub(in crate::library) fn apply_sort_to_indices(&self, indices: &mut Vec<usize>) {
        let Some(sort_state) = self.sort_state else {
            return;
        };
        let tracks = &self.tracks;

        indices.sort_unstable_by(|a, b| {
            let track_a = &tracks[*a];
            let track_b = &tracks[*b];
            let primary = match sort_state.field {
                LibrarySortField::Title => cmp_case_insensitive(&track_a.title, &track_b.title),
                LibrarySortField::Artist => cmp_case_insensitive(&track_a.artist, &track_b.artist),
                LibrarySortField::Album => cmp_case_insensitive(&track_a.album, &track_b.album),
                LibrarySortField::Duration => parse_duration_seconds(&track_a.duration)
                    .cmp(&parse_duration_seconds(&track_b.duration)),
                LibrarySortField::Storage => {
                    let rank = |status: StorageStatus| match status {
                        StorageStatus::Permanent => 0_u8,
                        StorageStatus::Uploaded => 1_u8,
                        StorageStatus::Local => 2_u8,
                    };
                    rank(track_a.storage_status).cmp(&rank(track_b.storage_status))
                }
            };
            let tie_break = cmp_case_insensitive(&track_a.title, &track_b.title)
                .then_with(|| cmp_case_insensitive(&track_a.artist, &track_b.artist))
                .then_with(|| cmp_case_insensitive(&track_a.album, &track_b.album))
                .then_with(|| track_a.file_path.cmp(&track_b.file_path));
            let cmp = if primary == Ordering::Equal {
                tie_break
            } else {
                primary
            };

            match sort_state.direction {
                LibrarySortDirection::Asc => cmp,
                LibrarySortDirection::Desc => cmp.reverse(),
            }
        });
    }

    pub(in crate::library) fn cycle_sort(
        &mut self,
        field: LibrarySortField,
        cx: &mut Context<Self>,
    ) {
        self.sort_state = match self.sort_state {
            Some(state) if state.field == field && state.direction == LibrarySortDirection::Asc => {
                Some(LibrarySortState {
                    field,
                    direction: LibrarySortDirection::Desc,
                })
            }
            Some(state)
                if state.field == field && state.direction == LibrarySortDirection::Desc =>
            {
                None
            }
            _ => Some(LibrarySortState {
                field,
                direction: LibrarySortDirection::Asc,
            }),
        };
        self.recompute_filtered_indices();
        cx.notify();
    }

    pub(in crate::library) fn recompute_filtered_indices(&mut self) {
        let query = self.search_query.trim().to_ascii_lowercase();
        if query.is_empty() {
            let mut indices: Vec<usize> = (0..self.tracks.len()).collect();
            self.apply_sort_to_indices(&mut indices);
            self.filtered_indices = Arc::new(indices);
            return;
        }

        let mut indices = Vec::with_capacity(self.tracks.len());
        for (index, track) in self.tracks.iter().enumerate() {
            if track.title.to_ascii_lowercase().contains(&query)
                || track.artist.to_ascii_lowercase().contains(&query)
                || track.album.to_ascii_lowercase().contains(&query)
            {
                indices.push(index);
            }
        }
        self.apply_sort_to_indices(&mut indices);
        self.filtered_indices = Arc::new(indices);
    }

    pub(in crate::library) fn schedule_search_rebuild(&mut self, cx: &mut Context<Self>) {
        self.sync_search_query_from_input(cx);
        self.search_debounce_seq = self.search_debounce_seq.wrapping_add(1);
        let seq = self.search_debounce_seq;

        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            smol::Timer::after(std::time::Duration::from_millis(150)).await;
            let _ = this.update(cx, |this, cx| {
                if this.search_debounce_seq != seq {
                    return;
                }
                this.recompute_filtered_indices();
                cx.notify();
            });
        })
        .detach();
    }

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
            .primary_wallet_address()
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

    /// Auto-advance to next track if current one ended.
    pub fn check_auto_advance(&mut self, cx: &mut Context<Self>) {
        let state = self.audio.read_state();
        // Track ended: has a path, not playing, and position >= duration
        if state.track_path.is_some() && !state.playing {
            if let Some(dur) = state.duration {
                if state.position >= dur - 0.5 && dur > 0.0 {
                    let played_at_sec = self.track_started_at_sec.unwrap_or_else(now_epoch_sec);
                    if let Some(idx) = self.active_track_index() {
                        if let Some(track) = self.tracks.get(idx).cloned() {
                            self.submit_scrobble_for_track(track, played_at_sec, cx);
                        }

                        if self.advance_queue(1, cx) {
                            cx.notify();
                            return;
                        }

                        let next = idx + 1;
                        if next < self.tracks.len() {
                            log::info!(
                                "[Playback] auto_advance: from_index={} to_index={}",
                                idx,
                                next
                            );
                            self.play_track(next, cx);
                            cx.notify();
                        }
                    } else if let Some(shared) = self.active_shared_playback.take() {
                        let duration_seconds = if dur.is_finite() && dur > 0.0 {
                            dur.round() as u64
                        } else {
                            0
                        };
                        let synthetic_track = TrackRow {
                            id: format!("shared-{}", shared.content_id),
                            title: if shared.title.trim().is_empty() {
                                "Shared Track".to_string()
                            } else {
                                shared.title
                            },
                            artist: if shared.artist.trim().is_empty() {
                                "Unknown Artist".to_string()
                            } else {
                                shared.artist
                            },
                            album: shared.album,
                            duration: format_duration_mmss(duration_seconds),
                            file_path: shared.local_path,
                            mbid: None,
                            ip_id: None,
                            cover_path: None,
                            storage_status: StorageStatus::default(),
                        };
                        self.submit_scrobble_for_track(synthetic_track, played_at_sec, cx);
                    }
                }
            }
        }
    }

    pub fn play_next(&mut self, cx: &mut Context<Self>) {
        if self.advance_queue(1, cx) {
            cx.notify();
            return;
        }
        if let Some(idx) = self.active_track_index() {
            let next = idx + 1;
            if next < self.tracks.len() {
                self.play_track(next, cx);
                cx.notify();
            }
        }
    }

    pub fn play_prev(&mut self, cx: &mut Context<Self>) {
        if self.advance_queue(-1, cx) {
            cx.notify();
            return;
        }
        if let Some(idx) = self.active_track_index() {
            if idx > 0 {
                self.play_track(idx - 1, cx);
                cx.notify();
            }
        }
    }

    pub(in crate::library) fn play_all(&mut self, cx: &mut Context<Self>) {
        let queue_snapshot = self.filtered_indices.clone();
        if let Some(first_index) = queue_snapshot.first().copied() {
            self.play_track_in_visible_context(first_index, queue_snapshot.as_ref(), cx);
        }
    }
}
