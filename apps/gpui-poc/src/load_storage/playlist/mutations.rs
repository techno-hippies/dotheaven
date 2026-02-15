use super::*;

const DEFAULT_ARWEAVE_TURBO_UPLOAD_URL: &str = "https://upload.ardrive.io";
const DEFAULT_ARWEAVE_TURBO_TOKEN: &str = "ethereum";
// Turbo free tier is <= 100KB per data item (client-side enforced here).
const MAX_ARWEAVE_COVER_BYTES: usize = 100 * 1024;

fn arweave_turbo_upload_url() -> String {
    std::env::var("HEAVEN_ARWEAVE_TURBO_UPLOAD_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_UPLOAD_URL.to_string())
}

fn arweave_turbo_token() -> String {
    std::env::var("HEAVEN_ARWEAVE_TURBO_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_TOKEN.to_string())
}

impl LoadStorageService {
    pub fn playlist_track_id_from_input(
        &self,
        track: &PlaylistTrackInput,
    ) -> Result<String, String> {
        let title = track.title.trim();
        let artist = track.artist.trim();
        let album = track.album.as_deref().unwrap_or("").trim();
        let mbid = track
            .mbid
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let ip_id = track
            .ip_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let track_id = build_track_id(title, artist, album, mbid, ip_id)?;
        Ok(to_hex_prefixed(track_id.as_slice()).to_lowercase())
    }

    pub fn playlist_create(
        &mut self,
        auth: &PersistedAuth,
        name: &str,
        cover_cid: Option<&str>,
        visibility: u8,
        tracks: &[PlaylistTrackInput],
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Playlist name is required".to_string());
        }
        params.insert("name".to_string(), Value::String(trimmed_name.to_string()));
        params.insert(
            "coverCid".to_string(),
            Value::String(cover_cid.unwrap_or("").trim().to_string()),
        );
        params.insert("visibility".to_string(), json!(visibility));

        let mut track_values = Vec::<Value>::new();
        let mut needs_filebase_key = false;
        for track in tracks {
            if track.cover_image.is_some() {
                needs_filebase_key = true;
            }
            track_values.push(playlist_track_input_to_json(track)?);
        }
        params.insert("tracks".to_string(), Value::Array(track_values));

        self.execute_playlist_action(auth, "create", params, needs_filebase_key)
    }

    pub fn playlist_set_tracks(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
        tracks: &[PlaylistTrackInput],
        existing_track_ids: Option<&[String]>,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );

        let mut track_values = Vec::<Value>::new();
        let mut needs_filebase_key = false;
        for track in tracks {
            if track.cover_image.is_some() {
                needs_filebase_key = true;
            }
            track_values.push(playlist_track_input_to_json(track)?);
        }
        params.insert("tracks".to_string(), Value::Array(track_values));

        if let Some(existing) = existing_track_ids {
            let mut normalized = Vec::<Value>::new();
            for track_id in existing {
                normalized.push(Value::String(normalize_bytes32_hex(track_id, "trackId")?));
            }
            params.insert("existingTrackIds".to_string(), Value::Array(normalized));
        }

        self.execute_playlist_action(auth, "setTracks", params, needs_filebase_key)
    }

    pub fn playlist_update_meta(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
        name: &str,
        cover_cid: Option<&str>,
        visibility: u8,
        cover_image: Option<&PlaylistCoverImageInput>,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Playlist name is required".to_string());
        }

        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );
        params.insert("name".to_string(), Value::String(trimmed_name.to_string()));
        params.insert(
            "coverCid".to_string(),
            Value::String(cover_cid.unwrap_or("").trim().to_string()),
        );
        params.insert("visibility".to_string(), json!(visibility));

        let mut needs_filebase_key = false;
        if let Some(img) = cover_image {
            needs_filebase_key = true;
            params.insert(
                "coverImage".to_string(),
                json!({
                    "base64": img.base64.trim(),
                    "contentType": img.content_type.trim(),
                }),
            );
        }

        self.execute_playlist_action(auth, "updateMeta", params, needs_filebase_key)
    }

    pub fn playlist_delete(
        &mut self,
        auth: &PersistedAuth,
        playlist_id: &str,
    ) -> Result<Value, String> {
        let mut params = serde_json::Map::new();
        params.insert(
            "playlistId".to_string(),
            Value::String(normalize_bytes32_hex(playlist_id, "playlistId")?),
        );
        self.execute_playlist_action(auth, "delete", params, false)
    }

    /// Upload a playlist cover image to Arweave Turbo and return the `ar://...` ref
    /// suitable for storing in PlaylistV1's `coverCid` field.
    pub fn playlist_upload_cover_to_arweave_turbo(
        &mut self,
        auth: &PersistedAuth,
        cover_image: &PlaylistCoverImageInput,
        file_path: Option<&str>,
    ) -> Result<String, String> {
        self.ensure_lit_ready(auth)?;

        let content_type = cover_image
            .content_type
            .trim()
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if content_type.is_empty() {
            return Err("missing cover content type".to_string());
        }

        let raw_b64 = cover_image.base64.trim();
        if raw_b64.is_empty() {
            return Err("missing cover base64 payload".to_string());
        }
        let payload = base64::engine::general_purpose::STANDARD
            .decode(raw_b64)
            .map_err(|e| format!("invalid base64 cover payload: {e}"))?;
        if payload.is_empty() {
            return Err("empty cover payload".to_string());
        }
        if payload.len() > MAX_ARWEAVE_COVER_BYTES {
            return Err(format!(
                "cover exceeds Turbo free tier limit ({} bytes > {} bytes)",
                payload.len(),
                MAX_ARWEAVE_COVER_BYTES
            ));
        }

        let owner = parse_pkp_public_key(auth)?;

        let mut tags = vec![Tag::new("Content-Type", content_type.as_str())];
        tags.push(Tag::new("App-Name", "heaven"));
        tags.push(Tag::new("Heaven-Type", "playlist-cover"));
        if let Some(path) = file_path {
            if let Some(name) = Path::new(path).file_name().and_then(|v| v.to_str()) {
                if !name.trim().is_empty() {
                    tags.push(Tag::new("File-Name", name.trim()));
                }
            }
        }

        let mut item = DataItem::new(None, None, tags, payload)
            .map_err(|e| format!("Failed to build dataitem payload: {e}"))?;
        item.signature_type = SignatureType::Ethereum;
        item.owner = owner;

        let signing_message = item.signing_message();
        let signature = self
            .lit_mut()?
            .pkp_sign_ethereum_message(&signing_message)
            .map_err(|e| format!("Failed to PKP-sign dataitem: {e}"))?;
        if signature.len() != 65 {
            return Err(format!(
                "PKP returned invalid signature length for dataitem: {}",
                signature.len()
            ));
        }

        item.signature = signature;
        let signed = item
            .to_bytes()
            .map_err(|e| format!("Failed to encode signed dataitem bytes: {e}"))?;

        let upload_url = arweave_turbo_upload_url();
        let token = arweave_turbo_token();
        let endpoint = format!(
            "{}/v1/tx/{}",
            upload_url.trim_end_matches('/'),
            token.trim()
        );

        let request = ureq::post(&endpoint)
            .header("Content-Type", "application/octet-stream")
            .config()
            .timeout_global(Some(Duration::from_secs(20)))
            .http_status_as_error(false)
            .build();

        let mut resp = request
            .send(&signed)
            .map_err(|e| format!("Turbo upload request failed: {e}; endpoint={endpoint}"))?;

        let status = resp.status().as_u16();
        let body = read_json_or_text(&mut resp);

        if status >= 400 {
            let message = body
                .get("error")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("Turbo upload failed with status {status}"));
            return Err(format!("{message}; endpoint={endpoint} body={body}"));
        }

        let id = extract_upload_id(&body).ok_or_else(|| {
            format!("Turbo upload succeeded but no dataitem id was returned: {body}")
        })?;

        Ok(format!("ar://{}", id.trim()))
    }
}
