use super::*;

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
        let mut has_inline_cover_upload = false;
        for track in tracks {
            if track.cover_image.is_some() {
                has_inline_cover_upload = true;
            }
            track_values.push(playlist_track_input_to_json(track)?);
        }
        params.insert("tracks".to_string(), Value::Array(track_values));

        self.execute_playlist_action(auth, "create", params, has_inline_cover_upload)
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
        let mut has_inline_cover_upload = false;
        for track in tracks {
            if track.cover_image.is_some() {
                has_inline_cover_upload = true;
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

        self.execute_playlist_action(auth, "setTracks", params, has_inline_cover_upload)
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

        let mut has_inline_cover_upload = false;
        if let Some(img) = cover_image {
            has_inline_cover_upload = true;
            params.insert(
                "coverImage".to_string(),
                json!({
                    "base64": img.base64.trim(),
                    "contentType": img.content_type.trim(),
                }),
            );
        }

        self.execute_playlist_action(auth, "updateMeta", params, has_inline_cover_upload)
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
        let mut temp_file: Option<PathBuf> = None;
        let upload_path = match file_path
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
        {
            Some(path) if path.exists() => path,
            _ => {
                let bytes = decode_cover_base64(cover_image.base64.as_str())?;
                if bytes.is_empty() {
                    return Err("Playlist cover image payload is empty".to_string());
                }

                let ext = extension_for_content_type(cover_image.content_type.as_str());
                let temp_path = std::env::temp_dir().join(format!(
                    "heaven-playlist-cover-{}.{}",
                    crate::scrobble::now_epoch_sec(),
                    ext
                ));
                fs::write(&temp_path, &bytes)
                    .map_err(|e| format!("Failed writing temp playlist cover file: {e}"))?;
                temp_file = Some(temp_path.clone());
                temp_path
            }
        };

        let upload_result = (|| {
            let mut scrobble = crate::scrobble::ScrobbleService::new()?;
            scrobble.upload_track_cover_ref(auth, upload_path.to_string_lossy().as_ref())
        })();

        if let Some(path) = temp_file {
            let _ = fs::remove_file(path);
        }

        upload_result
    }
}

fn decode_cover_base64(raw_value: &str) -> Result<Vec<u8>, String> {
    let trimmed = raw_value.trim();
    if trimmed.is_empty() {
        return Err("Playlist cover image base64 is empty".to_string());
    }

    let payload = trimmed
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(trimmed);
    base64::decode(payload).map_err(|e| format!("Invalid playlist cover base64 payload: {e}"))
}

fn extension_for_content_type(content_type: &str) -> &'static str {
    let normalized = content_type.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        "image/jpg" | "image/jpeg" => "jpg",
        _ => "jpg",
    }
}
