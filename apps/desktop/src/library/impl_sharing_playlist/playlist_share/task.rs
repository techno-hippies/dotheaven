use super::*;

use super::share_and_upload::upload::{
    build_uploaded_track_record, is_turbo_credit_blocker, track_meta_input_from_row,
    upload_track_with_diagnostics,
};

use serde_json::json;

pub(super) async fn run_playlist_share_task(
    this: WeakEntity<LibraryView>,
    cx: &mut AsyncApp,
    storage: Arc<Mutex<LoadStorageService>>,
    auth: auth::PersistedAuth,
    owner_address: String,
    grantee_hex: String,
    playlist_id: String,
    playlist_name: String,
    prepared: Vec<PlaylistSharePreparedTrack>,
) {
    let total = prepared.len();
    let mut resolved_tracks = Vec::<PlaylistShareResolvedTrack>::new();
    let mut failures = Vec::<String>::new();
    let mut turbo_blocked = false;

    for (idx, track) in prepared.iter().enumerate() {
        let pos = idx + 1;
        let track_label = format!("\"{}\"", track.title);
        let _ = this.update(cx, |this, cx| {
            this.set_status_message(
                format!(
                    "Sharing playlist \"{}\" with {} ({}/{}): {}",
                    playlist_name,
                    abbreviate_for_status(&grantee_hex),
                    pos,
                    total,
                    track_label
                ),
                cx,
            );
        });

        let storage = storage.clone();
        let auth = auth.clone();
        let track_id = track.track_id.clone();
        let title = track.title.clone();
        let artist = track.artist.clone();
        let album = track.album.clone();
        let local_track = track.local_track.clone();
        let uploaded_record = track.uploaded_record.clone();
        let allow_upload = !turbo_blocked;
        let per_track = smol::unblock(move || {
            let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
            let (payload, local_track_out, branch) =
                match svc.resolve_registered_content_by_track_id(&auth, &track_id) {
                    Ok(resolved) => Ok::<(Value, Option<TrackRow>, &'static str), String>((
                        resolved,
                        local_track,
                        "resolved",
                    )),
                    Err(resolve_err) => {
                        log::warn!(
                            "[Library] playlist share resolve failed: trackId={} err={}",
                            track_id,
                            resolve_err
                        );
                        if let Some(record) = uploaded_record {
                            if !record.content_id.trim().is_empty()
                                && record.content_id.trim() != "n/a"
                                && !record.piece_cid.trim().is_empty()
                                && record.piece_cid.trim() != "n/a"
                            {
                                log::info!(
                                    "[Library] playlist share falling back to uploaded record: trackId={} contentId={}",
                                    track_id,
                                    record.content_id
                                );
                                return Ok::<(Value, Option<TrackRow>, &'static str), String>((
                                    json!({
                                        "trackId": record.track_id,
                                        "contentId": record.content_id,
                                        "pieceCid": record.piece_cid,
                                        "gatewayUrl": record.gateway_url,
                                        "registerVersion": record.register_version,
                                        "txHash": record.tx_hash,
                                        "blockNumber": Value::Null,
                                    }),
                                    local_track,
                                    "uploaded-record",
                                ));
                            }
                        }
                        let Some(local_track) = local_track else {
                            return Err(format!(
                                "Not registered yet and not available locally: {}",
                                summarize_status_error(&resolve_err)
                            ));
                        };
                        if !allow_upload {
                            return Err(format!(
                                "Not registered yet (uploads blocked by low Turbo credits): {}",
                                summarize_status_error(&resolve_err)
                            ));
                        }
                        if local_track.file_path.is_empty()
                            || !std::path::Path::new(&local_track.file_path).exists()
                        {
                            return Err("Track file is missing on disk; cannot upload.".to_string());
                        }
                        let meta = track_meta_input_from_row(&local_track);
                        match upload_track_with_diagnostics(
                            &mut svc,
                            &auth,
                            &local_track.file_path,
                            meta.clone(),
                        ) {
                            Ok(upload_resp) => Ok((upload_resp, Some(local_track), "uploaded")),
                            Err(upload_err) => {
                                if super::is_already_uploaded_error(&upload_err) {
                                    match svc.resolve_registered_content_for_track(
                                        &auth,
                                        &local_track.file_path,
                                        meta,
                                    ) {
                                        Ok(resolved) => Ok((
                                            resolved,
                                            Some(local_track),
                                            "resolved-after-already-uploaded",
                                        )),
                                        Err(resolve_err) => Err(format!(
                                            "{upload_err}\nResolve after already-uploaded error failed: {resolve_err}"
                                        )),
                                    }
                                } else {
                                    Err(upload_err)
                                }
                            }
                        }
                    }
                }?;

            let (payload, branch) = super::repair::maybe_repair_legacy_content_encryption(
                &mut svc,
                &auth,
                payload,
                branch,
                local_track_out.as_ref(),
                allow_upload,
                &title,
                &artist,
                &album,
            )?;

            Ok::<(Value, Option<TrackRow>, &'static str), String>((payload, local_track_out, branch))
        })
        .await;

        match per_track {
            Ok((payload, local_track, branch)) => {
                let content_id = super::extract_field_string(&payload, "contentId")
                    .unwrap_or_else(|| "n/a".to_string());
                let piece_cid = super::extract_field_string(&payload, "pieceCid")
                    .unwrap_or_else(|| "n/a".to_string());
                let gateway_url = super::extract_field_string(&payload, "gatewayUrl")
                    .unwrap_or_else(|| "n/a".to_string());
                let track_id_out = super::extract_field_string(&payload, "trackId")
                    .or_else(|| Some(track.track_id.clone()));

                if content_id == "n/a" || piece_cid == "n/a" {
                    failures.push(format!(
                        "{} ({}): incomplete response (branch={})",
                        track_label, pos, branch
                    ));
                    continue;
                }

                if let Some(local_track) = local_track.clone() {
                    let owner_address = owner_address.clone();
                    let payload_for_record = payload.clone();
                    let track_title = track.title.clone();
                    let storage_status = local_track.storage_status;
                    let _ = this.update(cx, |this, cx| {
                        let saved_forever = matches!(storage_status, StorageStatus::Permanent);
                        if let Some(record) = build_uploaded_track_record(
                            &owner_address,
                            &local_track,
                            &payload_for_record,
                            if branch == "resolved" {
                                "onchain-recovered"
                            } else {
                                "n/a"
                            },
                            saved_forever,
                        ) {
                            let status = if record.saved_forever {
                                StorageStatus::Permanent
                            } else {
                                StorageStatus::Uploaded
                            };
                            this.persist_uploaded_record(
                                &track_title,
                                local_track.file_path.clone(),
                                owner_address.clone(),
                                record,
                                status,
                            );
                        }
                        cx.notify();
                    });
                }

                resolved_tracks.push(PlaylistShareResolvedTrack {
                    title: track.title.clone(),
                    artist: track.artist.clone(),
                    album: track.album.clone(),
                    track_id: track_id_out,
                    content_id,
                    piece_cid,
                    gateway_url,
                });
            }
            Err(err) => {
                if is_turbo_credit_blocker(&err) {
                    turbo_blocked = true;
                }
                log::error!(
                    "[Library] playlist share track failed: pos={}/{} trackId={} title=\"{}\" err={}",
                    pos,
                    total,
                    track.track_id,
                    track.title,
                    err
                );
                failures.push(format!(
                    "{} ({}): {} (trackId={})",
                    track_label,
                    pos,
                    summarize_status_error(&err),
                    abbreviate_for_status(&track.track_id)
                ));
            }
        }
    }

    // De-dupe by contentId to avoid wasting gas / signature payload bytes.
    let mut unique = Vec::<PlaylistShareResolvedTrack>::new();
    let mut seen_content_ids = HashSet::<String>::new();
    for track in resolved_tracks {
        let cid = track.content_id.trim().to_lowercase();
        if cid.is_empty() || cid == "n/a" || !seen_content_ids.insert(cid) {
            continue;
        }
        unique.push(track);
    }

    if unique.is_empty() {
        let summary = if failures.is_empty() {
            "No registered tracks found to share.".to_string()
        } else {
            failures.join("\n")
        };
        let _ = this.update(cx, |this, cx| {
            this.upload_busy = false;
            this.playlist_share_modal_submitting = false;
            this.playlist_share_modal_error = Some(summary);
            this.set_status_message(
                format!(
                    "Playlist share failed: no registered tracks were prepared (\"{}\").",
                    playlist_name
                ),
                cx,
            );
            cx.notify();
        });
        return;
    }

    let unique_len = unique.len();
    let (granted, grant_errors) = super::grant::grant_access_in_chunks(
        this.clone(),
        cx,
        storage.clone(),
        auth.clone(),
        owner_address.clone(),
        grantee_hex.clone(),
        playlist_name.clone(),
        unique,
    )
    .await;

    let mut playlist_share_error: Option<String> = None;
    if granted > 0 {
        let _ = this.update(cx, |this, cx| {
            this.set_status_message(
                format!(
                    "Recording playlist share for \"{}\" ({} tracks)...",
                    playlist_name, granted
                ),
                cx,
            );
        });

        let storage = storage.clone();
        let auth = auth.clone();
        let playlist_id_for_action = playlist_id.clone();
        let grantee_hex_for_action = grantee_hex.clone();
        let playlist_share_result = smol::unblock(move || {
            let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
            svc.playlist_share_with_wallet(
                &auth,
                &playlist_id_for_action,
                &grantee_hex_for_action,
                "share",
            )
        })
        .await;

        if let Err(err) = playlist_share_result {
            log::error!(
                "[Library] playlist share record failed: playlistId={} grantee={} err={}",
                abbreviate_for_status(&playlist_id),
                abbreviate_for_status(&grantee_hex),
                err
            );
            playlist_share_error = Some(summarize_status_error(&err));
        }
    }

    let mut final_msg = if granted == unique_len {
        format!(
            "Shared playlist \"{}\" with {} ({} track{}).",
            playlist_name,
            abbreviate_for_status(&grantee_hex),
            granted,
            if granted == 1 { "" } else { "s" }
        )
    } else {
        format!(
            "Shared playlist \"{}\" with {} ({} of {} track{}).",
            playlist_name,
            abbreviate_for_status(&grantee_hex),
            granted,
            unique_len,
            if unique_len == 1 { "" } else { "s" }
        )
    };
    if !failures.is_empty() {
        final_msg.push_str(&format!(" {} failed to prepare.", failures.len()));
        if failures.len() == 1 {
            final_msg.push_str(&format!(" {}", failures[0]));
        }
    }
    if !grant_errors.is_empty() {
        final_msg.push_str(&format!(" Grant error: {}.", grant_errors.join("; ")));
    }
    if let Some(err) = &playlist_share_error {
        final_msg.push_str(&format!(" Playlist record failed: {}.", err));
    }
    if turbo_blocked {
        final_msg.push_str(" Turbo credits were low; uploads were skipped for some tracks. Use Add Credits to continue.");
    }

    let full_success = granted == unique_len
        && failures.is_empty()
        && grant_errors.is_empty()
        && playlist_share_error.is_none();
    let modal_error = if full_success {
        None
    } else {
        let mut parts = Vec::<String>::new();
        if !failures.is_empty() {
            let preview = failures
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ");
            let more = failures.len().saturating_sub(3);
            if more == 0 {
                parts.push(format!(
                    "Failed to prepare ({}): {}",
                    failures.len(),
                    preview
                ));
            } else {
                parts.push(format!(
                    "Failed to prepare ({}): {}; ...and {} more",
                    failures.len(),
                    preview,
                    more
                ));
            }
        }
        if !grant_errors.is_empty() {
            parts.push(format!("Grant error: {}", grant_errors.join("; ")));
        }
        if let Some(err) = playlist_share_error {
            parts.push(format!("Playlist record failed: {}", err));
        }
        if turbo_blocked {
            parts.push("Turbo credits were low; uploads were skipped for some tracks.".to_string());
        }
        Some(parts.join("\n"))
    };

    let _ = this.update(cx, |this, cx| {
        this.upload_busy = false;
        this.playlist_share_modal_submitting = false;

        if this.playlist_share_modal_open {
            if full_success {
                this.playlist_share_modal_open = false;
                this.playlist_share_modal_playlist_id = None;
                this.playlist_share_modal_playlist_name = None;
                this.playlist_share_modal_error = None;
            } else {
                this.playlist_share_modal_error =
                    modal_error.clone().or_else(|| Some(final_msg.clone()));
            }
        }

        this.set_status_message(final_msg, cx);

        cx.notify();
    });
}
