use super::*;

fn track_metadata_registered(track_id_hex: &str) -> bool {
    fetch_track_metadata_subgraph(track_id_hex)
        .ok()
        .flatten()
        .is_some()
        || fetch_track_metadata_onchain(track_id_hex)
            .ok()
            .flatten()
            .is_some()
}

impl LoadStorageService {
    pub fn content_encrypt_upload_register(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        _with_cdn: bool,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let source_bytes = fs::read(file_path)
            .map_err(|e| format!("Failed to read file for upload ({}): {e}", file_path))?;

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

        let track_id = build_track_id(&title, &artist, &album, mbid.as_deref(), ip_id.as_deref())?;
        let content_id = compute_content_id(track_id, owner)?;

        let encrypted_blob = self.encrypt_for_upload(&source_bytes, &content_id)?;

        let ready = self.ensure_upload_ready(Some(auth), Some(encrypted_blob.len()));
        if !ready.0 {
            return Err(ready
                .1
                .unwrap_or_else(|| "Load upload endpoint unavailable".to_string()));
        }

        let upload_result = self.upload_to_load(
            auth,
            &encrypted_blob,
            Some(&format!("{file_path}.enc")),
            vec![
                json!({"name": "App-Name", "value": "Heaven Desktop"}),
                json!({"name": "Content-Id", "value": to_hex_prefixed(track_id.as_slice())}),
            ],
        )?;

        let register_response = self.register_content(
            auth,
            to_hex_prefixed(track_id.as_slice()),
            &upload_result.id,
            &title,
            &artist,
            &album,
        )?;
        let track_id_hex = to_hex_prefixed(track_id.as_slice()).to_lowercase();
        let metadata_registered = track_metadata_registered(&track_id_hex);
        if !metadata_registered {
            log::warn!(
                "[LoadStorage] track metadata missing after register: trackId={} title=\"{}\" artist=\"{}\" registerVersion={} txHash={}",
                track_id_hex,
                title,
                artist,
                register_response
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                register_response
                    .get("txHash")
                    .and_then(Value::as_str)
                    .unwrap_or("n/a"),
            );
        }

        Ok(json!({
            "trackId": track_id_hex,
            "ipId": ip_id,
            "contentId": to_hex_prefixed(content_id.as_slice()),
            "pieceCid": upload_result.id,
            "blobSize": encrypted_blob.len(),
            "uploadSize": encrypted_blob.len(),
            "gatewayUrl": upload_result.gateway_url,
            "winc": upload_result.winc,
            "trackMetadataRegistered": metadata_registered,
            "registerVersion": register_response.get("version").cloned().unwrap_or(Value::Null),
            "txHash": register_response.get("txHash").cloned().unwrap_or(Value::Null),
            "blockNumber": register_response.get("blockNumber").cloned().unwrap_or(Value::Null),
        }))
    }

    pub fn content_encrypt_upload_replace_by_track_id(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        track_id_hex: &str,
        title: &str,
        artist: &str,
        album: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let source_bytes = fs::read(file_path)
            .map_err(|e| format!("Failed to read file for upload ({}): {e}", file_path))?;

        let owner = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let track_id_norm = normalize_bytes32_hex(track_id_hex, "trackId")?;
        let track_id_bytes = decode_bytes32_hex(&track_id_norm, "trackId")?;
        let track_id = B256::from(track_id_bytes);
        let content_id = compute_content_id(track_id, owner)?;

        let encrypted_blob = self.encrypt_for_upload(&source_bytes, &content_id)?;

        let ready = self.ensure_upload_ready(Some(auth), Some(encrypted_blob.len()));
        if !ready.0 {
            return Err(ready
                .1
                .unwrap_or_else(|| "Load upload endpoint unavailable".to_string()));
        }

        let upload_result = self.upload_to_load(
            auth,
            &encrypted_blob,
            Some(&format!("{file_path}.enc")),
            vec![
                json!({"name": "App-Name", "value": "Heaven Desktop"}),
                json!({"name": "Content-Id", "value": to_hex_prefixed(track_id.as_slice())}),
            ],
        )?;

        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();
        let mut deactivate_payload = Value::Null;
        if let Ok(entry) = fetch_content_registry_entry(&content_id_hex) {
            if entry.active {
                deactivate_payload = self.content_deactivate(auth, &content_id_hex)?;
            }
        }

        let register_response = self.register_content(
            auth,
            track_id_norm.clone(),
            &upload_result.id,
            title,
            artist,
            album,
        )?;
        let metadata_registered = track_metadata_registered(&track_id_norm);
        if !metadata_registered {
            log::warn!(
                "[LoadStorage] track metadata missing after replace register: trackId={} title=\"{}\" artist=\"{}\" registerVersion={} txHash={}",
                track_id_norm,
                title,
                artist,
                register_response
                    .get("version")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                register_response
                    .get("txHash")
                    .and_then(Value::as_str)
                    .unwrap_or("n/a"),
            );
        }

        Ok(json!({
            "replaced": true,
            "trackId": track_id_norm,
            "contentId": content_id_hex,
            "pieceCid": upload_result.id,
            "blobSize": encrypted_blob.len(),
            "uploadSize": encrypted_blob.len(),
            "gatewayUrl": upload_result.gateway_url,
            "winc": upload_result.winc,
            "deactivate": deactivate_payload,
            "trackMetadataRegistered": metadata_registered,
            "registerVersion": register_response.get("version").cloned().unwrap_or(Value::Null),
            "txHash": register_response.get("txHash").cloned().unwrap_or(Value::Null),
            "blockNumber": register_response.get("blockNumber").cloned().unwrap_or(Value::Null),
        }))
    }
}
