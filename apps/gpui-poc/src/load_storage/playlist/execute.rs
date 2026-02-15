use super::*;

#[derive(Debug, Default, Clone, Copy)]
struct PlaylistExecuteJsParamsSummary {
    tracks: usize,
    existing_track_ids: usize,
    track_cover_images: usize,
    track_cover_base64_total_chars: usize,
    track_cover_base64_max_chars: usize,
    top_cover_base64_chars: usize,
}

impl PlaylistExecuteJsParamsSummary {
    fn approx_body_chars(&self) -> usize {
        // This is a lower bound on the eventual JSON body size; base64 is typically the dominant
        // contributor when we embed images into Lit executeJs params.
        self.track_cover_base64_total_chars + self.top_cover_base64_chars
    }
}

fn summarize_playlist_executejs_params(
    params: &serde_json::Map<String, Value>,
) -> PlaylistExecuteJsParamsSummary {
    let mut out = PlaylistExecuteJsParamsSummary::default();

    if let Some(existing) = params.get("existingTrackIds").and_then(Value::as_array) {
        out.existing_track_ids = existing.len();
    }

    if let Some(tracks) = params.get("tracks").and_then(Value::as_array) {
        out.tracks = tracks.len();
        for track in tracks {
            let cover_b64_len = track
                .get("coverImage")
                .and_then(|v| v.get("base64"))
                .and_then(Value::as_str)
                .map(|v| v.trim().len())
                .unwrap_or(0);
            if cover_b64_len > 0 {
                out.track_cover_images += 1;
                out.track_cover_base64_total_chars = out
                    .track_cover_base64_total_chars
                    .saturating_add(cover_b64_len);
                out.track_cover_base64_max_chars =
                    out.track_cover_base64_max_chars.max(cover_b64_len);
            }
        }
    }

    out.top_cover_base64_chars = params
        .get("coverImage")
        .and_then(|v| v.get("base64"))
        .and_then(Value::as_str)
        .map(|v| v.trim().len())
        .unwrap_or(0);

    out
}

fn env_truthy(key: &str) -> bool {
    std::env::var(key)
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
}

impl LoadStorageService {
    pub(super) fn execute_playlist_action(
        &mut self,
        auth: &PersistedAuth,
        operation: &str,
        mut params: serde_json::Map<String, Value>,
        needs_filebase_key: bool,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let timestamp = chrono::Utc::now().timestamp_millis();
        let nonce = fetch_playlist_user_nonce(user_address)?;
        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_action(
            &network,
            "playlistV1",
            &["HEAVEN_PLAYLIST_V1_CID"],
            Some("HEAVEN_PLAYLIST_V1_CODE_PATH"),
        )?;
        log::info!(
            "[Playlist] resolved action: source={}, operation={}",
            action.source(),
            operation
        );

        params.insert(
            "userPkpPublicKey".to_string(),
            Value::String(user_public_key.to_string()),
        );
        params.insert(
            "operation".to_string(),
            Value::String(operation.to_string()),
        );
        params.insert(
            "timestamp".to_string(),
            Value::String(timestamp.to_string()),
        );
        params.insert("nonce".to_string(), Value::String(nonce));

        if needs_filebase_key {
            if let Some(plaintext) = filebase_covers_plaintext_key() {
                params.insert("filebasePlaintextKey".to_string(), Value::String(plaintext));
            } else if let ResolvedAction::Ipfs { cid, .. } = &action {
                params.insert(
                    "filebaseEncryptedKey".to_string(),
                    registry::build_filebase_encrypted_key(cid),
                );
            }
        }

        let summary = summarize_playlist_executejs_params(&params);
        let approx_kb = summary.approx_body_chars() / 1024;
        log::info!(
            "[Playlist] executeJs params: operation={}, source={}, tracks={}, existingTrackIds={}, trackCoverImages={}, trackCoverB64TotalKB={}, trackCoverB64MaxKB={}, topCoverB64KB={}, approxMinBodyKB={}",
            operation,
            action.source(),
            summary.tracks,
            summary.existing_track_ids,
            summary.track_cover_images,
            summary.track_cover_base64_total_chars / 1024,
            summary.track_cover_base64_max_chars / 1024,
            summary.top_cover_base64_chars / 1024,
            approx_kb
        );
        if env_truthy("HEAVEN_LOG_PLAYLIST_EXECUTEJS_JSON_BYTES") {
            // Warning: serializing can allocate roughly the full JSON body size.
            match serde_json::to_vec(&params) {
                Ok(bytes) => log::info!(
                    "[Playlist] executeJs params JSON bytes: operation={}, bytes={}",
                    operation,
                    bytes.len()
                ),
                Err(err) => log::warn!(
                    "[Playlist] executeJs params JSON bytes: operation={}, err={}",
                    operation,
                    err
                ),
            }
        }

        let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) =
            match &action {
                ResolvedAction::Ipfs { cid, source } => self
                    .lit_mut()?
                    .execute_js_ipfs(cid.clone(), Some(Value::Object(params)))
                    .map(|res| (res, source.clone())),
                ResolvedAction::Code { code, source } => self
                    .lit_mut()?
                    .execute_js(code.clone(), Some(Value::Object(params)))
                    .map(|res| (res, source.clone())),
            }
            .map_err(|e| {
                let msg = format!("Playlist executeJs failed: {e}");
                log::error!("[Playlist] executeJs SDK error: {}", msg);
                msg
            })?;

        let mut payload = normalize_lit_action_response(execute_result.response, "playlist-v1")?;
        if let Value::Object(obj) = &mut payload {
            obj.entry("actionSource".to_string())
                .or_insert(Value::String(action_source.clone()));
        }

        let success = payload
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !success {
            let msg = payload
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Playlist operation failed: {msg} (operation={operation}, txHash={tx_hash}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }
}
