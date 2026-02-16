use super::*;

pub(super) async fn grant_access_in_chunks(
    this: WeakEntity<LibraryView>,
    cx: &mut AsyncApp,
    storage: Arc<Mutex<LoadStorageService>>,
    auth: auth::PersistedAuth,
    owner_address: String,
    grantee_hex: String,
    playlist_name: String,
    tracks: Vec<PlaylistShareResolvedTrack>,
) -> (usize, Vec<String>) {
    // Chunking reduces tx gas risk for very large playlists while preserving the batch fast-path.
    const GRANT_CHUNK_SIZE: usize = 25;

    let mut granted = 0usize;
    let mut grant_errors = Vec::<String>::new();

    for chunk_start in (0..tracks.len()).step_by(GRANT_CHUNK_SIZE) {
        let chunk_end = (chunk_start + GRANT_CHUNK_SIZE).min(tracks.len());
        let chunk_tracks = tracks[chunk_start..chunk_end].to_vec();
        let content_ids = chunk_tracks
            .iter()
            .map(|t| t.content_id.clone())
            .collect::<Vec<_>>();

        let _ = this.update(cx, |this, cx| {
            this.set_status_message(
                format!(
                    "Granting access ({}/{}) for playlist \"{}\"...",
                    chunk_end,
                    tracks.len(),
                    playlist_name
                ),
                cx,
            );
        });

        let storage = storage.clone();
        let auth = auth.clone();
        let grantee_hex_for_grant = grantee_hex.clone();
        let grant_result = smol::unblock(move || {
            let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
            svc.content_grant_access_batch(&auth, &content_ids, &grantee_hex_for_grant)
        })
        .await;

        match grant_result {
            Ok(resp) => {
                let tx_hash = resp.get("txHash").and_then(|v| v.as_str()).unwrap_or("n/a");
                let mirror_tx_hash = resp
                    .get("mirrorTxHash")
                    .and_then(|v| v.as_str())
                    .unwrap_or("n/a");
                let now_ms = chrono::Utc::now().timestamp_millis();

                let owner_address = owner_address.clone();
                let grantee_hex = grantee_hex.clone();
                let tx_hash = tx_hash.to_string();
                let mirror_tx_hash = mirror_tx_hash.to_string();
                let _ = this.update(cx, |this, cx| {
                    for track in &chunk_tracks {
                        let record = SharedGrantRecord {
                            owner_address: owner_address.clone(),
                            grantee_address: grantee_hex.clone(),
                            title: track.title.clone(),
                            artist: track.artist.clone(),
                            album: track.album.clone(),
                            track_id: track.track_id.clone(),
                            content_id: track.content_id.clone(),
                            piece_cid: track.piece_cid.clone(),
                            gateway_url: track.gateway_url.clone(),
                            tx_hash: tx_hash.clone(),
                            mirror_tx_hash: mirror_tx_hash.clone(),
                            shared_at_ms: now_ms,
                        };
                        if let Err(e) = append_shared_grant_record(record) {
                            log::error!("[Library] failed to persist shared grant record: {}", e);
                        }
                    }

                    if this.mode == LibraryMode::SharedWithMe {
                        this.refresh_shared_records_for_auth(cx);
                    }
                });

                granted = granted.saturating_add(chunk_tracks.len());
            }
            Err(err) => {
                grant_errors.push(summarize_status_error(&err));
                break;
            }
        }
    }

    (granted, grant_errors)
}
