use super::*;
use crate::load_storage::PlaylistCoverImageInput;

impl LibraryView {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn spawn_playlist_modal_mutation_task(
        &mut self,
        pending_id: String,
        mutation_kind: PendingPlaylistMutationKind,
        optimistic_track_count: usize,
        detail_tracks_before_optimistic: Vec<PlaylistDetailTrack>,
        selected_playlist: Option<PlaylistSummary>,
        new_name: String,
        playlist_cover_image: Option<PlaylistCoverImageInput>,
        auth: auth::PersistedAuth,
        playlist_input: PlaylistTrackInput,
        track_title: String,
        status_name: String,
        cx: &mut Context<Self>,
    ) {
        let cover_b64_kb = playlist_input
            .cover_image
            .as_ref()
            .map(|img| img.base64.trim().len() / 1024)
            .unwrap_or(0);
        let playlist_label = selected_playlist
            .as_ref()
            .map(|p| p.name.as_str())
            .unwrap_or(new_name.as_str());
        log::info!(
            "[Library] playlist mutation submit: kind={:?}, pendingId={}, playlist=\"{}\", track=\"{}\" artist=\"{}\", coverB64KB={}",
            mutation_kind,
            abbreviate_for_status(&pending_id),
            playlist_label,
            playlist_input.title.trim(),
            playlist_input.artist.trim(),
            cover_b64_kb
        );

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let result: Result<PlaylistMutationResult, String> = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;

                if let Some(playlist) = selected_playlist {
                    let existing_ids = if playlist.track_count > 0 {
                        svc.playlist_fetch_track_ids(&playlist.id, 1000)?
                    } else {
                        Vec::new()
                    };
                    if playlist.track_count > 0 && existing_ids.is_empty() {
                        return Err(format!(
                            "Could not load existing tracks for \"{}\" yet. Retry after subgraph indexing catches up.",
                            playlist.name
                        ));
                    }

                    let track_id = svc.playlist_track_id_from_input(&playlist_input)?;
                    let already_exists = existing_ids
                        .iter()
                        .any(|existing| existing.eq_ignore_ascii_case(&track_id));
                    if already_exists {
                        return Ok::<PlaylistMutationResult, String>(
                            PlaylistMutationResult::DuplicateTrack {
                                playlist_name: playlist.name,
                            },
                        );
                    }

                    let existing_slice = if existing_ids.is_empty() {
                        None
                    } else {
                        Some(existing_ids.as_slice())
                    };
                    let payload = svc.playlist_set_tracks(
                        &auth,
                        &playlist.id,
                        std::slice::from_ref(&playlist_input),
                        existing_slice,
                    )?;
                    Ok::<PlaylistMutationResult, String>(PlaylistMutationResult::Mutated {
                        playlist_name: playlist.name,
                        payload,
                        cover_warning: None,
                        cover_cid: None,
                    })
                } else {
                    let payload = svc.playlist_create(
                        &auth,
                        &new_name,
                        Some(""),
                        0,
                        std::slice::from_ref(&playlist_input),
                    )?;
                    let mut cover_warning = None;
                    let mut cover_cid = None::<String>;
                    if let Some(cover_image) = playlist_cover_image.as_ref() {
                        if let Some(created_playlist_id) = extract_playlist_id_from_payload(&payload)
                        {
                            match svc.playlist_upload_cover_to_arweave_turbo(
                                &auth,
                                cover_image,
                                None,
                            ) {
                                Ok(cover_ref) => match svc.playlist_update_meta(
                                    &auth,
                                    &created_playlist_id,
                                    &new_name,
                                    Some(cover_ref.as_str()),
                                    0,
                                    None,
                                ) {
                                    Ok(payload) => {
                                        cover_cid = payload
                                            .get("coverCid")
                                            .and_then(Value::as_str)
                                            .map(str::trim)
                                            .filter(|v| !v.is_empty())
                                            .map(str::to_string)
                                            .or_else(|| Some(cover_ref));
                                    }
                                    Err(err) => {
                                        cover_warning = Some(format!(
                                            "Cover update failed: {}",
                                            summarize_status_error(&err)
                                        ));
                                    }
                                },
                                Err(err) => {
                                    cover_warning = Some(format!(
                                        "Cover upload failed: {}",
                                        summarize_status_error(&err)
                                    ));
                                }
                            }
                        } else {
                            cover_warning = Some(
                                "Cover update skipped: create response did not include playlist id."
                                    .to_string(),
                            );
                        }
                    }
                    Ok::<PlaylistMutationResult, String>(PlaylistMutationResult::Mutated {
                        playlist_name: new_name,
                        payload,
                        cover_warning,
                        cover_cid,
                    })
                }
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                this.playlist_modal_submitting = false;
                let now_ms = chrono::Utc::now().timestamp_millis();
                match result {
                    Ok(PlaylistMutationResult::Mutated {
                        playlist_name,
                        payload,
                        cover_warning,
                        cover_cid,
                    }) => {
                        let mut effective_pending_id = pending_id.clone();
                        if let Some(actual_id) = extract_playlist_id_from_payload(&payload) {
                            if !actual_id.is_empty() && actual_id != effective_pending_id {
                                this.remap_playlist_detail_id(
                                    &effective_pending_id,
                                    &actual_id,
                                    &playlist_name,
                                );
                                this.remap_pending_playlist_id(&effective_pending_id, &actual_id);
                                effective_pending_id = actual_id;
                            }
                        }
                        let detail_cache_invalidated = false;
                        log::info!(
                            "[Library] playlist mutation accepted: kind={:?}, pendingId={}, resolvedId={}, name=\"{}\", invalidatedDetailCache={}",
                            mutation_kind,
                            abbreviate_for_status(&pending_id),
                            abbreviate_for_status(&effective_pending_id),
                            playlist_name,
                            detail_cache_invalidated
                        );

                        match mutation_kind {
                            PendingPlaylistMutationKind::AddTrack => {
                                if let Some(playlist) = this
                                    .sidebar_playlists
                                    .iter_mut()
                                    .find(|playlist| {
                                        playlist.id.eq_ignore_ascii_case(&effective_pending_id)
                                    })
                                {
                                    playlist.track_count =
                                        playlist.track_count.max(optimistic_track_count);
                                }
                                this.remove_pending_playlist_mutation(&effective_pending_id);
                                this.set_status_message(
                                    format!("Added \"{}\" to \"{}\".", track_title, playlist_name),
                                    cx,
                                );
                            }
                            PendingPlaylistMutationKind::Create => {
                                let created_msg = if let Some(warning) = cover_warning {
                                    format!(
                                        "Playlist \"{}\" created, but {}",
                                        playlist_name, warning
                                    )
                                } else {
                                    format!(
                                        "Playlist \"{}\" created. Syncing sidebar...",
                                        playlist_name
                                    )
                                };
                                this.set_status_message(created_msg, cx);
                            }
                        }
                        this.refresh_sidebar_playlists(cx);
                        this.refresh_local_playlists_with_pending(now_ms);
                        if let Some(cover_cid) = cover_cid {
                            let mut applied = false;
                            for playlist in &mut this.sidebar_playlists {
                                if playlist.id.eq_ignore_ascii_case(&effective_pending_id) {
                                    playlist.cover_cid = Some(cover_cid.clone());
                                    applied = true;
                                }
                            }
                            for playlist in &mut this.playlist_modal_playlists {
                                if playlist.id.eq_ignore_ascii_case(&effective_pending_id) {
                                    playlist.cover_cid = Some(cover_cid.clone());
                                    applied = true;
                                }
                            }
                            if applied {
                                log::info!(
                                    "[Library] applied playlist coverCid locally: id={}, coverCid={}",
                                    abbreviate_for_status(&effective_pending_id),
                                    cover_cid
                                );
                            }
                        }
                        this.remove_pending_playlist_mutation_if_stale(now_ms);
                        log::info!(
                            "[Library] playlist mutation post-refresh: resolvedId={}, pendingMutations={}, sidebarRows={}",
                            abbreviate_for_status(&effective_pending_id),
                            this.pending_playlist_mutations.len(),
                            this.sidebar_playlists.len()
                        );
                    }
                    Ok(PlaylistMutationResult::DuplicateTrack { playlist_name }) => {
                        log::info!(
                            "[Library] skipped duplicate playlist add: pendingId={}, playlist=\"{}\", track=\"{}\"",
                            abbreviate_for_status(&pending_id),
                            playlist_name,
                            track_title
                        );
                        this.remove_pending_playlist_mutation(&pending_id);
                        if mutation_kind == PendingPlaylistMutationKind::AddTrack {
                            if detail_tracks_before_optimistic.is_empty() {
                                this.playlist_detail_cache.remove(&pending_id);
                                let is_active_playlist = matches!(
                                    &this.detail_route,
                                    LibraryDetailRoute::Playlist { playlist_id, .. }
                                    if playlist_id.eq_ignore_ascii_case(&pending_id)
                                );
                                if is_active_playlist {
                                    this.open_playlist_detail(
                                        pending_id.clone(),
                                        playlist_name.clone(),
                                        cx,
                                    );
                                }
                            } else {
                                this.playlist_detail_cache.insert(
                                    pending_id.clone(),
                                    PlaylistDetailCacheEntry {
                                        tracks: detail_tracks_before_optimistic.clone(),
                                        fetched_at_ms: now_ms,
                                    },
                                );
                                let is_active_playlist = matches!(
                                    &this.detail_route,
                                    LibraryDetailRoute::Playlist { playlist_id, .. }
                                    if playlist_id.eq_ignore_ascii_case(&pending_id)
                                );
                                if is_active_playlist {
                                    this.playlist_detail_tracks =
                                        detail_tracks_before_optimistic.clone();
                                    this.detail_loading = false;
                                    this.detail_error = None;
                                }
                            }
                        }
                        this.refresh_local_playlists_with_pending(now_ms);
                        this.set_status_message(
                            format!("\"{}\" is already in \"{}\".", track_title, playlist_name),
                            cx,
                        );
                    }
                    Err(err) => {
                        log::error!("[Library] playlist update failed: {}", err);
                        this.remove_pending_playlist_mutation(&pending_id);
                        if mutation_kind == PendingPlaylistMutationKind::AddTrack {
                            if detail_tracks_before_optimistic.is_empty() {
                                this.playlist_detail_cache.remove(&pending_id);
                                let failed_playlist_active = matches!(
                                    &this.detail_route,
                                    LibraryDetailRoute::Playlist { playlist_id, .. }
                                    if playlist_id.eq_ignore_ascii_case(&pending_id)
                                );
                                if failed_playlist_active {
                                    this.open_playlist_detail(
                                        pending_id.clone(),
                                        status_name.clone(),
                                        cx,
                                    );
                                }
                            } else {
                                this.playlist_detail_cache.insert(
                                    pending_id.clone(),
                                    PlaylistDetailCacheEntry {
                                        tracks: detail_tracks_before_optimistic.clone(),
                                        fetched_at_ms: now_ms,
                                    },
                                );
                                let failed_playlist_active = matches!(
                                    &this.detail_route,
                                    LibraryDetailRoute::Playlist { playlist_id, .. }
                                    if playlist_id.eq_ignore_ascii_case(&pending_id)
                                );
                                if failed_playlist_active {
                                    this.playlist_detail_tracks =
                                        detail_tracks_before_optimistic.clone();
                                    this.detail_loading = false;
                                    this.detail_error = None;
                                }
                            }
                        } else {
                            this.playlist_detail_cache.remove(&pending_id);
                            let failed_playlist_active = matches!(
                                &this.detail_route,
                                LibraryDetailRoute::Playlist { playlist_id, .. }
                                if playlist_id.eq_ignore_ascii_case(&pending_id)
                            );
                            if failed_playlist_active {
                                this.reset_detail_navigation();
                            }
                        }
                        this.refresh_local_playlists_with_pending(now_ms);
                        this.set_status_message(
                            format!(
                                "Playlist update failed for \"{}\": {}",
                                status_name,
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
