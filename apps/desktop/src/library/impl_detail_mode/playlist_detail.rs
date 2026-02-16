use super::*;

const PLAYLIST_DETAIL_CACHE_TTL_MS: i64 = 45_000;

impl LibraryView {
    pub fn open_playlist_detail(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        cx: &mut Context<Self>,
    ) {
        self.open_playlist_detail_internal(playlist_id, playlist_name, false, cx);
    }

    pub(in crate::library) fn open_playlist_detail_force_refresh(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        cx: &mut Context<Self>,
    ) {
        self.open_playlist_detail_internal(playlist_id, playlist_name, true, cx);
    }

    fn open_playlist_detail_internal(
        &mut self,
        playlist_id: String,
        playlist_name: String,
        force_refresh: bool,
        cx: &mut Context<Self>,
    ) {
        let playlist_id = playlist_id.trim().to_lowercase();
        if playlist_id.is_empty() {
            self.set_status_message("Playlist is missing an ID.", cx);
            return;
        }
        let playlist_name = sanitize_detail_value(playlist_name, "Untitled Playlist");
        let now_ms = chrono::Utc::now().timestamp_millis();
        let mut cache_is_fresh = false;
        let mut cache_age_ms = None::<i64>;
        if let Some(cache_entry) = self.playlist_detail_cache.get(&playlist_id) {
            let age_ms = now_ms.saturating_sub(cache_entry.fetched_at_ms);
            cache_is_fresh = age_ms < PLAYLIST_DETAIL_CACHE_TTL_MS;
            cache_age_ms = Some(age_ms);
            self.playlist_detail_tracks = cache_entry.tracks.clone();
            self.detail_loading = false;
            self.detail_error = None;
            log::info!(
                "[Library] playlist detail cache hit: id={}, rows={}, ageMs={}, fresh={}",
                abbreviate_for_status(&playlist_id),
                self.playlist_detail_tracks.len(),
                age_ms,
                cache_is_fresh
            );
        } else {
            self.playlist_detail_tracks.clear();
            log::info!(
                "[Library] playlist detail cache miss: id={}",
                abbreviate_for_status(&playlist_id)
            );
        }

        self.mode = LibraryMode::Library;
        self.navigate_to_detail(
            LibraryDetailRoute::Playlist {
                playlist_id,
                playlist_name,
            },
            cx,
        );
        if cache_is_fresh && !force_refresh {
            return;
        }
        if let Some(age_ms) = cache_age_ms {
            log::info!(
                "[Library] playlist detail cache stale; refreshing: ageMs={}, ttlMs={}",
                age_ms,
                PLAYLIST_DETAIL_CACHE_TTL_MS
            );
        }
        self.prefetch_playlist_detail_tracks(cx);
    }

    fn prefetch_playlist_detail_tracks(&mut self, cx: &mut Context<Self>) {
        let playlist_id = match &self.detail_route {
            LibraryDetailRoute::Playlist { playlist_id, .. } => playlist_id.clone(),
            _ => return,
        };
        log::info!(
            "[Library] playlist detail fetch start: id={}",
            abbreviate_for_status(&playlist_id)
        );
        let mut local_track_lookup = HashMap::<String, (usize, String, StorageStatus)>::new();
        let mut local_track_by_path = HashMap::<String, (usize, String, StorageStatus)>::new();
        for (index, track) in self.tracks.iter().enumerate() {
            let local_track = (index, track.duration.clone(), track.storage_status);
            let key = format!(
                "{}\n{}\n{}",
                normalize_lookup_key(&track.title),
                normalize_lookup_key(&track.artist),
                normalize_lookup_key(&track.album),
            );
            local_track_lookup
                .entry(key)
                .or_insert_with(|| local_track.clone());
            local_track_by_path.insert(track.file_path.clone(), local_track);
        }
        let mut local_track_by_track_id = HashMap::<String, (usize, String, StorageStatus)>::new();
        let mut uploaded_track_statuses = HashMap::<String, StorageStatus>::new();
        for record in self.uploaded_index.values() {
            let track_id = record.track_id.trim().to_lowercase();
            if track_id.is_empty() {
                continue;
            }
            let status = if record.saved_forever {
                StorageStatus::Permanent
            } else {
                StorageStatus::Uploaded
            };
            uploaded_track_statuses
                .entry(track_id.clone())
                .and_modify(|existing| {
                    if *existing != StorageStatus::Permanent {
                        *existing = status;
                    }
                })
                .or_insert(status);
            if let Some(local_track) = local_track_by_path.get(&record.file_path).cloned() {
                local_track_by_track_id
                    .entry(track_id)
                    .or_insert(local_track);
            }
        }
        self.detail_loading = true;
        self.detail_error = None;
        self.detail_fetch_seq = self.detail_fetch_seq.wrapping_add(1);
        let request_seq = self.detail_fetch_seq;
        let storage = self.storage.clone();
        let playlist_id_for_fetch = playlist_id.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                svc.playlist_fetch_tracks_with_metadata(&playlist_id_for_fetch, 1000)
            })
            .await;
            let _ = this.update(cx, |this, cx| {
                if request_seq != this.detail_fetch_seq {
                    return;
                }
                this.detail_loading = false;
                match result {
                    Ok(raw_tracks) => {
                        let mut parsed_tracks = Vec::<PlaylistDetailTrack>::new();
                        for row in raw_tracks {
                            let Some(track_id) = row.get("trackId").and_then(Value::as_str) else {
                                continue;
                            };
                            let track_id = track_id.trim().to_lowercase();
                            if track_id.is_empty() {
                                continue;
                            }
                            let title = row
                                .get("title")
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                                .map(str::to_string)
                                .unwrap_or_else(|| {
                                    format!("Track {}", abbreviate_for_status(&track_id))
                                });
                            let artist = row
                                .get("artist")
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                                .map(str::to_string)
                                .unwrap_or_else(|| "Unknown Artist".to_string());
                            let album = row
                                .get("album")
                                .and_then(Value::as_str)
                                .map(str::trim)
                                .filter(|v| !v.is_empty())
                                .map(str::to_string)
                                .unwrap_or_else(|| "Unknown Album".to_string());
                            let lookup_key = format!(
                                "{}\n{}\n{}",
                                normalize_lookup_key(&title),
                                normalize_lookup_key(&artist),
                                normalize_lookup_key(&album),
                            );
                            let local_track = local_track_by_track_id
                                .get(&track_id)
                                .cloned()
                                .or_else(|| local_track_lookup.get(&lookup_key).cloned());
                            let (local_track_index, duration, storage_status) = match local_track {
                                Some((index, duration, storage_status)) => {
                                    (Some(index), duration, storage_status)
                                }
                                None => (
                                    None,
                                    "--:--".to_string(),
                                    uploaded_track_statuses
                                        .get(&track_id)
                                        .copied()
                                        .unwrap_or(StorageStatus::Local),
                                ),
                            };

                            parsed_tracks.push(PlaylistDetailTrack {
                                track_id,
                                title,
                                artist,
                                album,
                                duration,
                                storage_status,
                                local_track_index,
                            });
                        }
                        // Merge in any optimistic/local tracks already present in cache (e.g. user just
                        // added a track and subgraph indexing hasn't caught up yet).
                        let cached_tracks = this
                            .playlist_detail_cache
                            .get(&playlist_id)
                            .map(|entry| entry.tracks.clone())
                            .unwrap_or_default();
                        if !cached_tracks.is_empty() {
                            let mut track_id_to_index = HashMap::<String, usize>::new();
                            for (idx, track) in parsed_tracks.iter().enumerate() {
                                track_id_to_index
                                    .insert(track.track_id.trim().to_lowercase(), idx);
                            }
                            let mut appended = 0_usize;
                            let mut patched_mapping = 0_usize;
                            for cached in cached_tracks {
                                let cached_id = cached.track_id.trim().to_lowercase();
                                if cached_id.is_empty() {
                                    continue;
                                }
                                if let Some(idx) = track_id_to_index.get(&cached_id).copied() {
                                    let parsed = &mut parsed_tracks[idx];
                                    if parsed.local_track_index.is_none()
                                        && cached.local_track_index.is_some()
                                    {
                                        parsed.local_track_index = cached.local_track_index;
                                        if parsed.duration.trim() == "--:--"
                                            && cached.duration.trim() != "--:--"
                                        {
                                            parsed.duration = cached.duration;
                                        }
                                        if matches!(parsed.storage_status, StorageStatus::Local)
                                            && !matches!(cached.storage_status, StorageStatus::Local)
                                        {
                                            parsed.storage_status = cached.storage_status;
                                        }
                                        patched_mapping = patched_mapping.saturating_add(1);
                                    }
                                } else if cached.local_track_index.is_some()
                                    || cached.track_id.starts_with("optimistic-track:")
                                {
                                    track_id_to_index
                                        .insert(cached_id, parsed_tracks.len());
                                    parsed_tracks.push(cached);
                                    appended = appended.saturating_add(1);
                                }
                            }
                            if appended > 0 || patched_mapping > 0 {
                                log::info!(
                                    "[Library] playlist detail merged cached rows: id={}, appended={}, patchedMapping={}, totalRows={}",
                                    abbreviate_for_status(&playlist_id),
                                    appended,
                                    patched_mapping,
                                    parsed_tracks.len()
                                );
                            }
                        }
                        let playable = parsed_tracks
                            .iter()
                            .filter(|track| track.local_track_index.is_some())
                            .count();
                        log::info!(
                            "[Library] playlist detail loaded: rows={}, playableLocal={}, unmapped={}",
                            parsed_tracks.len(),
                            playable,
                            parsed_tracks.len().saturating_sub(playable),
                        );
                        this.playlist_detail_cache.insert(
                            playlist_id.clone(),
                            PlaylistDetailCacheEntry {
                                tracks: parsed_tracks.clone(),
                                fetched_at_ms: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                        this.playlist_detail_tracks = parsed_tracks;
                        this.detail_error = None;
                    }
                    Err(err) => {
                        let has_cached =
                            this.playlist_detail_cache.contains_key(&playlist_id);
                        if !has_cached {
                            this.playlist_detail_tracks.clear();
                        }
                        log::warn!(
                            "[Library] playlist detail fetch failed: id={}, hasCached={}, err={}",
                            abbreviate_for_status(&playlist_id),
                            has_cached,
                            summarize_status_error(&err)
                        );
                        this.detail_error = Some(err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
