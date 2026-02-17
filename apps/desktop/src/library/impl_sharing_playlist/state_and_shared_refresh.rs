use super::*;

fn decode_subgraph_bytes_to_utf8(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if !trimmed.starts_with("0x") {
        return trimmed.to_string();
    }

    let body = &trimmed[2..];
    if body.is_empty() || body.len() % 2 != 0 {
        return trimmed.to_string();
    }

    let mut bytes = Vec::<u8>::with_capacity(body.len() / 2);
    let mut i = 0usize;
    while i + 2 <= body.len() {
        match u8::from_str_radix(&body[i..i + 2], 16) {
            Ok(b) => bytes.push(b),
            Err(_) => return trimmed.to_string(),
        }
        i = i.saturating_add(2);
    }

    match String::from_utf8(bytes) {
        Ok(s) => s.trim_matches('\u{0}').trim().to_string(),
        Err(_) => trimmed.to_string(),
    }
}

fn parse_i64_field(value: Option<&serde_json::Value>) -> Option<i64> {
    match value {
        Some(v) if v.is_i64() => v.as_i64(),
        Some(v) if v.is_u64() => v.as_u64().and_then(|n| i64::try_from(n).ok()),
        Some(v) if v.is_string() => v.as_str()?.trim().parse::<i64>().ok(),
        _ => None,
    }
}

impl LibraryView {
    pub(in crate::library) fn refresh_uploaded_index_from_auth(&mut self) {
        let owner = auth::load_from_disk()
            .and_then(|a| a.primary_wallet_address().map(|value| value.to_string()))
            .unwrap_or_default()
            .to_lowercase();

        if owner.is_empty() {
            self.uploaded_index_owner = None;
            self.uploaded_index.clear();
            self.apply_uploaded_index_to_track_statuses();
            return;
        }
        if self.uploaded_index_owner.as_deref() == Some(owner.as_str()) {
            // Tracks may have changed due paging; re-apply mapped statuses.
            self.apply_uploaded_index_to_track_statuses();
            return;
        }

        let records = load_uploaded_track_records_for_owner(&owner);
        self.uploaded_index = records
            .into_iter()
            .map(|r| (r.file_path.clone(), r))
            .collect();
        self.uploaded_index_owner = Some(owner);
        self.apply_uploaded_index_to_track_statuses();
    }

    pub(in crate::library) fn apply_uploaded_index_to_track_statuses(&mut self) {
        if self.tracks.is_empty() {
            return;
        }

        let mut changed = false;
        let mut next_tracks = Vec::with_capacity(self.tracks.len());
        for existing in self.tracks.iter() {
            let mut track = existing.clone();
            let next_status = match track.storage_status {
                // Preserve explicit permanent markers once that flow is wired.
                StorageStatus::Permanent => StorageStatus::Permanent,
                _ => match self.uploaded_index.get(&track.file_path) {
                    Some(record) if record.saved_forever => StorageStatus::Permanent,
                    Some(_) => StorageStatus::Uploaded,
                    None => StorageStatus::Local,
                },
            };
            if track.storage_status != next_status {
                changed = true;
                track.storage_status = next_status;
            }
            next_tracks.push(track);
        }
        if changed {
            self.tracks = Arc::new(next_tracks);
        }
    }

    pub(in crate::library) fn set_track_storage_status(
        &mut self,
        file_path: &str,
        status: StorageStatus,
    ) {
        if self.tracks.is_empty() {
            return;
        }

        let mut changed = false;
        let mut next_tracks = Vec::with_capacity(self.tracks.len());
        for existing in self.tracks.iter() {
            let mut track = existing.clone();
            if track.file_path == file_path && track.storage_status != status {
                track.storage_status = status;
                changed = true;
            }
            next_tracks.push(track);
        }
        if changed {
            self.tracks = Arc::new(next_tracks);
        }
    }

    pub(in crate::library) fn refresh_shared_records_for_auth(&mut self, cx: &mut Context<Self>) {
        let grantee = auth::load_from_disk()
            .and_then(|a| a.primary_wallet_address().map(|value| value.to_string()))
            .unwrap_or_default()
            .to_lowercase();

        if grantee.is_empty() {
            self.shared_records_for = None;
            self.shared_records.clear();
            return;
        }

        // Seed from local cache for offline/optimistic UX.
        let mut local_records = load_shared_grant_records_for_grantee(&grantee);
        local_records.sort_by(|a, b| b.shared_at_ms.cmp(&a.shared_at_ms));
        self.shared_records = local_records.clone();
        self.shared_records_for = Some(grantee.clone());

        // Background: reconcile with subgraph grants so "Shared With Me" works cross-device.
        let local_for_merge = local_records.clone();
        let grantee_for_subgraph = grantee.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let grantee = grantee_for_subgraph;
            let grantee_for_fetch = grantee.clone();
            let fetched: Result<Vec<SharedGrantRecord>, String> = smol::unblock(move || {
                let gql_grantee = escape_gql(&grantee_for_fetch);
                // Keep responses bounded; if this becomes a problem, paginate with `skip`.
                let limit = 200_usize;
                let query = format!(
                    "{{ accessGrants(where: {{ grantee: \"{gql_grantee}\", granted: true }}, orderBy: updatedAt, orderDirection: desc, first: {limit}) {{ updatedAt grantee granted content {{ id owner pieceCid trackId }} }} }}"
                );
                let payload = http_post_json(
                    &subgraph_activity_url(),
                    serde_json::json!({
                        "query": query,
                    }),
                )?;

                if let Some(errors) = payload.get("errors") {
                    return Err(format!("Subgraph query failed: {errors}"));
                }

                let entries = payload
                    .get("data")
                    .and_then(|v| v.get("accessGrants"))
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                let mut out = Vec::<SharedGrantRecord>::with_capacity(entries.len());
                for entry in entries {
                    let Some(content) = entry.get("content").and_then(|v| v.as_object()) else {
                        continue;
                    };
                    let Some(content_id) = content.get("id").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let content_id = content_id.trim().to_lowercase();
                    if content_id.is_empty() {
                        continue;
                    }

                    let owner_address = content
                        .get("owner")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .trim()
                        .to_lowercase();
                    let grantee_address = entry
                        .get("grantee")
                        .and_then(|v| v.as_str())
                        .unwrap_or(grantee_for_fetch.as_str())
                        .trim()
                        .to_lowercase();
                    let piece_cid = content
                        .get("pieceCid")
                        .and_then(|v| v.as_str())
                        .map(decode_subgraph_bytes_to_utf8)
                        .unwrap_or_default();
                    if piece_cid.is_empty() {
                        // Without a pieceCid, decrypt can't proceed; skip the record.
                        continue;
                    }
                    let track_id = content
                        .get("trackId")
                        .and_then(|v| v.as_str())
                        .map(|v| v.trim().to_lowercase())
                        .filter(|v| !v.is_empty());

                    let updated_at = parse_i64_field(entry.get("updatedAt"));
                    let now_ms = chrono::Utc::now().timestamp_millis();
                    let shared_at_ms = updated_at
                        .map(|raw| {
                            // The subgraph stores timestamps as seconds (BigInt).
                            if raw > 1_000_000_000_000 {
                                raw
                            } else {
                                raw.saturating_mul(1000)
                            }
                        })
                        .unwrap_or(now_ms);

                    out.push(SharedGrantRecord {
                        owner_address,
                        grantee_address,
                        title: String::new(),
                        artist: String::new(),
                        album: String::new(),
                        track_id,
                        content_id,
                        piece_cid,
                        gateway_url: String::new(),
                        tx_hash: "n/a".to_string(),
                        mirror_tx_hash: "n/a".to_string(),
                        shared_at_ms,
                    });
                }
                Ok(out)
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                let remote_records = match fetched {
                    Ok(records) => records,
                    Err(err) => {
                        log::warn!("[Library] shared grants fetch failed: {}", err);
                        // Still attempt enrichment of whatever we have locally.
                        this.spawn_shared_metadata_enrichment(grantee.clone(), local_for_merge, cx);
                        cx.notify();
                        return;
                    }
                };

                if this.shared_records_for.as_deref() != Some(grantee.as_str()) {
                    return;
                }

                let mut by_content = HashMap::<String, SharedGrantRecord>::new();
                for record in remote_records {
                    by_content.insert(record.content_id.to_lowercase(), record);
                }
                for record in local_for_merge {
                    let key = record.content_id.to_lowercase();
                    match by_content.get_mut(&key) {
                        Some(existing) => {
                            if existing.owner_address.trim().is_empty()
                                && !record.owner_address.trim().is_empty()
                            {
                                existing.owner_address = record.owner_address.clone();
                            }
                            if existing.grantee_address.trim().is_empty()
                                && !record.grantee_address.trim().is_empty()
                            {
                                existing.grantee_address = record.grantee_address.clone();
                            }
                            if existing.title.trim().is_empty() && !record.title.trim().is_empty() {
                                existing.title = record.title.clone();
                            }
                            if existing.artist.trim().is_empty()
                                && !record.artist.trim().is_empty()
                            {
                                existing.artist = record.artist.clone();
                            }
                            if existing.album.trim().is_empty() && !record.album.trim().is_empty() {
                                existing.album = record.album.clone();
                            }
                            if existing.track_id.is_none() && record.track_id.is_some() {
                                existing.track_id = record.track_id.clone();
                            }
                            if existing.piece_cid.trim().is_empty()
                                && !record.piece_cid.trim().is_empty()
                            {
                                existing.piece_cid = record.piece_cid.clone();
                            }
                            if existing.gateway_url.trim().is_empty()
                                && !record.gateway_url.trim().is_empty()
                            {
                                existing.gateway_url = record.gateway_url.clone();
                            }
                            if existing.tx_hash.trim().is_empty()
                                && !record.tx_hash.trim().is_empty()
                            {
                                existing.tx_hash = record.tx_hash.clone();
                            }
                            if existing.mirror_tx_hash.trim().is_empty()
                                && !record.mirror_tx_hash.trim().is_empty()
                            {
                                existing.mirror_tx_hash = record.mirror_tx_hash.clone();
                            }
                            if record.shared_at_ms > existing.shared_at_ms {
                                existing.shared_at_ms = record.shared_at_ms;
                            }
                        }
                        None => {
                            by_content.insert(key, record);
                        }
                    }
                }

                let mut merged = by_content.into_values().collect::<Vec<_>>();
                merged.sort_by(|a, b| b.shared_at_ms.cmp(&a.shared_at_ms));
                this.shared_records = merged.clone();

                if let Err(err) = upsert_shared_grant_records_for_grantee(&grantee, &merged) {
                    log::warn!("[Library] failed to persist shared records: {}", err);
                }

                this.spawn_shared_metadata_enrichment(grantee.clone(), merged, cx);
                cx.notify();
            });
        })
        .detach();
    }

    fn spawn_shared_metadata_enrichment(
        &mut self,
        grantee: String,
        mut records: Vec<SharedGrantRecord>,
        cx: &mut Context<Self>,
    ) {
        let needs_enrichment = records.iter().any(needs_shared_metadata_enrichment);
        if !needs_enrichment {
            return;
        }

        let storage = self.storage.clone();
        cx.spawn(async move |this: WeakEntity<Self>, cx: &mut AsyncApp| {
            let enriched = smol::unblock(move || {
                let mut svc = storage.lock().map_err(|e| format!("storage lock: {e}"))?;
                let mut changed = false;
                for record in &mut records {
                    if !needs_shared_metadata_enrichment(record) {
                        continue;
                    }
                    let metadata = match svc.resolve_shared_track_metadata(
                        &record.content_id,
                        record.track_id.as_deref(),
                    ) {
                        Ok(v) => v,
                        Err(err) => {
                            log::warn!(
                                "[Library] shared metadata lookup failed for contentId={}: {}",
                                record.content_id,
                                err
                            );
                            continue;
                        }
                    };

                    let mut record_changed = false;
                    if let Some(track_id) = metadata.get("trackId").and_then(|v| v.as_str()) {
                        let norm = track_id.trim().to_lowercase();
                        if !norm.is_empty()
                            && record
                                .track_id
                                .as_deref()
                                .unwrap_or_default()
                                .to_lowercase()
                                != norm
                        {
                            record.track_id = Some(norm);
                            record_changed = true;
                        }
                    }
                    if let Some(title) = metadata.get("title").and_then(|v| v.as_str()) {
                        let title = title.trim();
                        if !title.is_empty() && record.title != title {
                            record.title = title.to_string();
                            record_changed = true;
                        }
                    }
                    if let Some(artist) = metadata.get("artist").and_then(|v| v.as_str()) {
                        let artist = artist.trim();
                        if !artist.is_empty() && record.artist != artist {
                            record.artist = artist.to_string();
                            record_changed = true;
                        }
                    }
                    if let Some(album) = metadata.get("album").and_then(|v| v.as_str()) {
                        let album = album.trim();
                        if record.album != album {
                            record.album = album.to_string();
                            record_changed = true;
                        }
                    }

                    if record_changed {
                        changed = true;
                    }
                }

                Ok::<(Vec<SharedGrantRecord>, bool), String>((records, changed))
            })
            .await;

            let _ = this.update(cx, |this, cx| {
                match enriched {
                    Ok((records, changed)) => {
                        if changed && this.shared_records_for.as_deref() == Some(grantee.as_str()) {
                            if let Err(err) =
                                upsert_shared_grant_records_for_grantee(&grantee, &records)
                            {
                                log::warn!(
                                    "[Library] failed to persist enriched shared records: {}",
                                    err
                                );
                            }
                            this.shared_records = records;
                        }
                    }
                    Err(err) => {
                        log::warn!("[Library] shared metadata enrichment failed: {}", err);
                    }
                }
                cx.notify();
            });
        })
        .detach();
    }
}
