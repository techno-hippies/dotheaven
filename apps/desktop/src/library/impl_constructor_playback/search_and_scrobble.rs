use super::storage::format_duration_mmss;
use super::*;

impl LibraryView {
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
            .pkp_address
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
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut service = service
                    .lock()
                    .map_err(|e| format!("scrobble service lock failed: {e}"))?;
                service.submit_track(&auth, &track, played_at_sec)
            })
            .await;

            match result {
                Ok(ok) => {
                    log::info!(
                        "[Scrobble] submitted: userOpHash={} sender={}",
                        ok.user_op_hash,
                        ok.sender
                    );
                    let _ = this.update(cx, |_this, cx| {
                        log::info!("[Scrobble] refresh signal bump: immediate");
                        cx.update_global::<crate::scrobble_refresh::ScrobbleRefreshSignal, _>(
                            |signal, _| {
                                signal.bump();
                            },
                        );
                        // One delayed bump helps with subgraph/indexing lag (covers, etc.) without
                        // causing multiple UI refresh flickers.
                        let delay_ms = 6_000_u64;
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
                    });
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
