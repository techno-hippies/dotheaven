use super::*;

impl LibraryView {
    pub(in crate::library) fn submit_playlist_modal_create(&mut self, cx: &mut Context<Self>) {
        self.playlist_modal_selected_playlist_id = None;
        self.submit_playlist_modal(cx);
    }

    pub(in crate::library) fn submit_playlist_modal(&mut self, cx: &mut Context<Self>) {
        if self.playlist_modal_submitting {
            return;
        }

        let Some(track_index) = self.playlist_modal_track_index else {
            self.playlist_modal_error = Some("No track selected.".to_string());
            cx.notify();
            return;
        };
        let Some(track) = self.tracks.get(track_index).cloned() else {
            self.playlist_modal_error = Some("Selected track no longer exists.".to_string());
            cx.notify();
            return;
        };

        let auth = match auth::load_from_disk() {
            Some(auth) => auth,
            None => {
                self.playlist_modal_error = Some("Sign in before using playlists.".to_string());
                cx.notify();
                return;
            }
        };

        let selected_playlist = self
            .playlist_modal_selected_playlist_id
            .as_ref()
            .and_then(|id| self.playlist_modal_playlists.iter().find(|p| p.id == *id))
            .cloned();
        let new_name = self
            .playlist_name_input_state
            .read(cx)
            .value()
            .trim()
            .to_string();

        if selected_playlist.is_none() && new_name.is_empty() {
            self.playlist_modal_error =
                Some("Select a playlist or enter a new playlist name.".to_string());
            cx.notify();
            return;
        }

        let playlist_cover_image = if selected_playlist.is_none() {
            match playlist_cover_image_input_from_path(
                self.playlist_modal_cover_image_path.as_deref(),
            ) {
                Ok(image) => image,
                Err(err) => {
                    self.playlist_modal_error = Some(summarize_status_error(&err));
                    cx.notify();
                    return;
                }
            }
        } else {
            None
        };

        self.playlist_modal_submitting = true;
        self.playlist_modal_error = None;
        self.playlist_modal_needs_reauth = false;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let mutation_kind = if selected_playlist.is_some() {
            PendingPlaylistMutationKind::AddTrack
        } else {
            PendingPlaylistMutationKind::Create
        };
        let optimistic_track_count = if let Some(pl) = selected_playlist.as_ref() {
            pl.track_count.saturating_add(1)
        } else {
            1
        };
        if let Some(pl) = selected_playlist.as_ref() {
            self.set_status_message(
                format!("Adding \"{}\" to \"{}\"...", track.title, pl.name),
                cx,
            );
            self.record_pending_playlist_mutation(
                &pl.id,
                &pl.name,
                PendingPlaylistMutationKind::AddTrack,
                optimistic_track_count,
                now_ms,
            );
        } else {
            self.set_status_message(format!("Creating playlist \"{}\"...", new_name), cx);
            self.record_pending_playlist_mutation(
                &format!("optimistic:playlist:{now_ms}"),
                &new_name,
                PendingPlaylistMutationKind::Create,
                1,
                now_ms,
            );
        }
        let pending_id = if let Some(pl) = selected_playlist.as_ref() {
            pl.id.clone()
        } else {
            format!("optimistic:playlist:{now_ms}")
        };
        let pending_label = if let Some(pl) = selected_playlist.as_ref() {
            pl.name.clone()
        } else {
            new_name.clone()
        };
        log::info!(
            "[Library] queued playlist mutation: kind={:?}, id={}, name=\"{}\", optimisticTrackCount={}, pendingMutations={}",
            mutation_kind,
            abbreviate_for_status(&pending_id),
            pending_label,
            optimistic_track_count,
            self.pending_playlist_mutations.len()
        );
        self.refresh_local_playlists_with_pending(now_ms);
        let force_detail_refresh = mutation_kind == PendingPlaylistMutationKind::AddTrack;
        let optimistic_track = PlaylistDetailTrack {
            track_id: if track.id.trim().is_empty() {
                format!("optimistic-track:{now_ms}")
            } else {
                track.id.trim().to_lowercase()
            },
            title: track.title.clone(),
            artist: sanitize_detail_value(track.artist.clone(), "Unknown Artist"),
            album: sanitize_detail_value(track.album.clone(), "Unknown Album"),
            duration: if track.duration.trim().is_empty() {
                "--:--".to_string()
            } else {
                track.duration.clone()
            },
            storage_status: track.storage_status,
            local_track_index: Some(track_index),
        };
        let detail_tracks_before_optimistic = self
            .playlist_detail_cache
            .get(&pending_id)
            .map(|entry| entry.tracks.clone())
            .or_else(|| {
                if matches!(
                    &self.detail_route,
                    LibraryDetailRoute::Playlist { playlist_id, .. }
                    if playlist_id.eq_ignore_ascii_case(&pending_id)
                ) {
                    Some(self.playlist_detail_tracks.clone())
                } else {
                    None
                }
            })
            .unwrap_or_default();
        let mut optimistic_detail_tracks = detail_tracks_before_optimistic.clone();
        let optimistic_track_exists = optimistic_detail_tracks.iter().any(|existing| {
            existing.local_track_index == Some(track_index)
                || (!track.id.trim().is_empty()
                    && existing.track_id.eq_ignore_ascii_case(&track.id))
        });
        if !optimistic_track_exists {
            optimistic_detail_tracks.push(optimistic_track);
        }
        log::info!(
            "[Library] seeded playlist detail cache (optimistic): kind={:?}, id={}, beforeRows={}, afterRows={}, forceRefresh={}",
            mutation_kind,
            abbreviate_for_status(&pending_id),
            detail_tracks_before_optimistic.len(),
            optimistic_detail_tracks.len(),
            force_detail_refresh
        );
        self.playlist_detail_tracks = optimistic_detail_tracks.clone();
        self.playlist_detail_cache.insert(
            pending_id.clone(),
            PlaylistDetailCacheEntry {
                tracks: optimistic_detail_tracks,
                fetched_at_ms: now_ms,
            },
        );
        self.detail_loading = false;
        self.detail_error = None;
        if force_detail_refresh {
            self.open_playlist_detail_force_refresh(pending_id.clone(), pending_label.clone(), cx);
        } else {
            self.open_playlist_detail(pending_id.clone(), pending_label.clone(), cx);
        }
        // Optimistic UX: close immediately and run the network mutation in background.
        self.playlist_modal_open = false;
        self.playlist_modal_track_index = None;
        self.playlist_modal_error = None;
        self.playlist_modal_loading = false;
        self.playlist_modal_needs_reauth = false;
        self.playlist_modal_reauth_busy = false;
        self.playlist_modal_selected_playlist_id = None;
        self.playlist_modal_cover_image_path = None;
        self.playlist_modal_playlists.clear();
        cx.notify();

        let playlist_input = playlist_track_input_from_track(&track);
        let track_title = track.title.clone();
        let status_name = selected_playlist
            .as_ref()
            .map(|playlist| playlist.name.clone())
            .or_else(|| {
                if new_name.is_empty() {
                    None
                } else {
                    Some(new_name.clone())
                }
            })
            .unwrap_or_else(|| "Playlist".to_string());

        self.spawn_playlist_modal_mutation_task(
            pending_id,
            mutation_kind,
            optimistic_track_count,
            detail_tracks_before_optimistic,
            selected_playlist,
            new_name,
            playlist_cover_image,
            auth,
            playlist_input,
            track_title,
            status_name,
            cx,
        );
    }
}
