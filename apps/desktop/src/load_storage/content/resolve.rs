use super::*;

impl LoadStorageService {
    pub fn resolve_registered_content_by_track_id(
        &mut self,
        auth: &PersistedAuth,
        track_id_hex: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let owner = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;
        let owner_norm = owner.to_lowercase();

        let track_id_norm = normalize_bytes32_hex(track_id_hex, "trackId")?;
        let track_id_bytes = decode_bytes32_hex(&track_id_norm, "trackId")?;
        let track_id = B256::from(track_id_bytes);
        let content_id = compute_content_id(track_id, owner)?;
        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();

        let entry = fetch_content_registry_entry(&content_id_hex)?;
        if !entry.active {
            return Err(format!(
                "Content is not active on ContentRegistry (contentId={content_id_hex})"
            ));
        }
        if entry.owner.to_lowercase() != owner_norm {
            return Err(format!(
                "Content owner mismatch for contentId={content_id_hex} (owner={}, expected={})",
                entry.owner, owner
            ));
        }
        if entry.piece_cid.is_empty() {
            return Err(format!(
                "Content found but pieceCid is empty (contentId={content_id_hex})"
            ));
        }

        Ok(json!({
            "trackId": track_id_norm,
            "contentId": content_id_hex,
            "pieceCid": entry.piece_cid,
            "gatewayUrl": format!("{}/resolve/{}", load_gateway_url(), entry.piece_cid),
            "registerVersion": "onchain-recovered",
            "txHash": Value::Null,
            "blockNumber": Value::Null,
        }))
    }

    pub fn resolve_registered_content_for_track(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let fallback = infer_title_artist_album(file_path);
        let title = track
            .title
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&fallback.0)
            .to_string();
        let artist = track
            .artist
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(&fallback.1)
            .to_string();
        let album = track
            .album
            .as_deref()
            .map(str::trim)
            .unwrap_or(&fallback.2)
            .to_string();

        let mbid = track
            .mbid
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let ip_id = track
            .ip_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);

        let owner = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;
        let owner_norm = owner.to_lowercase();

        let track_id = build_track_id(&title, &artist, &album, mbid.as_deref(), ip_id.as_deref())?;
        let content_id = compute_content_id(track_id, owner)?;
        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();

        let entry = fetch_content_registry_entry(&content_id_hex)?;
        if !entry.active {
            return Err(format!(
                "Content is not active on ContentRegistry (contentId={content_id_hex})"
            ));
        }
        if entry.owner.to_lowercase() != owner_norm {
            return Err(format!(
                "Content owner mismatch for contentId={content_id_hex} (owner={}, expected={})",
                entry.owner, owner
            ));
        }
        if entry.piece_cid.is_empty() {
            return Err(format!(
                "Content found but pieceCid is empty (contentId={content_id_hex})"
            ));
        }

        Ok(json!({
            "trackId": to_hex_prefixed(track_id.as_slice()).to_lowercase(),
            "contentId": content_id_hex,
            "pieceCid": entry.piece_cid,
            "gatewayUrl": format!("{}/resolve/{}", load_gateway_url(), entry.piece_cid),
            "registerVersion": "onchain-recovered",
            "txHash": Value::Null,
            "blockNumber": Value::Null,
        }))
    }

    pub fn resolve_shared_track_metadata(
        &mut self,
        content_id_hex: &str,
        track_id_hint: Option<&str>,
    ) -> Result<Value, String> {
        let content_id = normalize_content_id_hex(content_id_hex)?;
        let track_id = if let Some(hint) = track_id_hint.filter(|v| !v.trim().is_empty()) {
            normalize_bytes32_hex(hint, "trackId")?
        } else {
            fetch_track_id_for_content_subgraph(&content_id)?
                .ok_or_else(|| format!("No trackId found for contentId={content_id}"))?
        };

        if let Some((title, artist, album)) = fetch_track_metadata_subgraph(&track_id)? {
            return Ok(json!({
                "trackId": track_id,
                "contentId": content_id,
                "title": title,
                "artist": artist,
                "album": album,
                "source": "subgraph",
            }));
        }

        if let Some((title, artist, album)) = fetch_track_metadata_onchain(&track_id)? {
            return Ok(json!({
                "trackId": track_id,
                "contentId": content_id,
                "title": title,
                "artist": artist,
                "album": album,
                "source": "onchain",
            }));
        }

        Err(format!(
            "Track metadata unavailable for contentId={content_id} (trackId={track_id})"
        ))
    }
}
