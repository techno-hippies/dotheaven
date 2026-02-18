use super::*;

impl LoadStorageService {
    pub fn probe_content_decrypt_v1(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        gateway_url_hint: Option<&str>,
    ) -> Result<(), String> {
        if auth.provider_kind() != crate::auth::AuthProviderKind::TempoPasskey {
            self.ensure_lit_ready(auth)?;
        }

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let piece_cid = piece_cid.trim();
        if piece_cid.is_empty() {
            return Err("pieceCid is empty".to_string());
        }

        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            if load_wrapped_key_for_content(&normalized_content_id).is_some() {
                return Ok(());
            }
            let owner = auth
                .primary_wallet_address()
                .ok_or("Missing wallet address in auth")?;
            if ensure_wrapped_key_from_ls3(&normalized_content_id, owner, owner)?.is_some() {
                return Ok(());
            }
            return Err(format!(
                "No wrapped key envelope found for contentId={normalized_content_id} (pieceCid={piece_cid})."
            ));
        }

        // Fetch only a small prefix; enough to include ciphertext + hash. Avoid downloading full tracks.
        const PREFIX_BYTES: u64 = 16 * 1024;
        let mut errors = Vec::<String>::new();

        for url in build_shared_gateway_urls(piece_cid, gateway_url_hint) {
            let prefix = match http_get_bytes_range(&url, 0, PREFIX_BYTES - 1) {
                Ok(bytes) => bytes,
                Err(err) => {
                    errors.push(format!("{url}: {err}"));
                    continue;
                }
            };

            let header = match parse_content_header_prefix(&prefix) {
                Ok(h) => h,
                Err(err) => {
                    errors.push(format!("{url}: {err}"));
                    continue;
                }
            };

            // Attempt Lit Action decrypt of the key payload. If this succeeds, web playback will succeed.
            self.decrypt_content_key_payload_via_action(
                auth,
                &normalized_content_id,
                &header.lit_ciphertext_base64,
                &header.data_to_encrypt_hash_hex,
            )?;
            return Ok(());
        }

        Err(format!(
            "Failed probing content decrypt for contentId={normalized_content_id} pieceCid={piece_cid}: {}",
            errors.join(" | ")
        ))
    }

    pub fn decrypt_shared_content_to_local_file(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        gateway_url_hint: Option<&str>,
        file_stem_hint: Option<&str>,
        owner_address_hint: Option<&str>,
        grantee_address_hint: Option<&str>,
    ) -> Result<Value, String> {
        if auth.provider_kind() != crate::auth::AuthProviderKind::TempoPasskey {
            self.ensure_lit_ready(auth)?;
        }

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;

        if let Some(existing) = find_cached_shared_audio_path(&normalized_content_id) {
            return Ok(json!({
                "contentId": normalized_content_id,
                "pieceCid": piece_cid,
                "localPath": existing.to_string_lossy().to_string(),
                "cacheHit": true,
            }));
        }

        let piece_cid = piece_cid.trim();
        if piece_cid.is_empty() {
            return Err("pieceCid is empty".to_string());
        }

        let mut blob = None;
        let mut fetched_from = None;
        let mut fetch_errors = Vec::new();
        for url in build_shared_gateway_urls(piece_cid, gateway_url_hint) {
            match http_get_bytes(&url) {
                Ok(bytes) => {
                    blob = Some(bytes);
                    fetched_from = Some(url);
                    break;
                }
                Err(err) => fetch_errors.push(format!("{url}: {err}")),
            }
        }
        let blob = blob.ok_or_else(|| {
            format!(
                "Failed to fetch encrypted content blob for pieceCid={piece_cid}: {}",
                fetch_errors.join(" | ")
            )
        })?;

        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            return self.decrypt_shared_content_tempo(
                &normalized_content_id,
                piece_cid,
                &blob,
                fetched_from,
                file_stem_hint,
                owner_address_hint,
                grantee_address_hint,
            );
        }

        let parsed_blob = parse_content_blob(&blob)?;
        if parsed_blob.algo != ALGO_AES_GCM_256 {
            return Err(format!(
                "Unsupported encryption algorithm in content blob: {}",
                parsed_blob.algo
            ));
        }

        log::info!(
            "[LoadStorage] shared decrypt fetch ok: contentId={} pieceCid={} from={} blobBytes={} ctLen={} hashLen={} ivLen={} audioLen={}",
            normalized_content_id,
            piece_cid,
            fetched_from.clone().unwrap_or_else(|| "n/a".to_string()),
            blob.len(),
            parsed_blob.lit_ciphertext_base64.len(),
            parsed_blob.data_to_encrypt_hash_hex.len(),
            parsed_blob.iv.len(),
            parsed_blob.encrypted_audio.len(),
        );

        let decrypted_key_payload_bytes = self.decrypt_content_key_payload_via_action(
            auth,
            &normalized_content_id,
            &parsed_blob.lit_ciphertext_base64,
            &parsed_blob.data_to_encrypt_hash_hex,
        )?;

        let payload: Value = serde_json::from_slice(&decrypted_key_payload_bytes)
            .map_err(|e| format!("Failed to parse decrypted content key payload JSON: {e}"))?;

        if let Some(payload_content_id) = payload.get("contentId").and_then(Value::as_str) {
            if payload_content_id.to_lowercase() != normalized_content_id {
                return Err(format!(
                    "Decrypted payload contentId mismatch: expected {normalized_content_id}, got {payload_content_id}"
                ));
            }
        }

        let key_base64 = payload
            .get("key")
            .and_then(Value::as_str)
            .ok_or("Decrypted payload missing key")?;
        let mut key = base64::engine::general_purpose::STANDARD
            .decode(key_base64.as_bytes())
            .map_err(|e| format!("Invalid AES key base64 in decrypted payload: {e}"))?;
        if key.len() != 32 {
            return Err(format!(
                "Invalid AES key length in decrypted payload: expected 32 bytes, got {}",
                key.len()
            ));
        }

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to initialize AES key for shared decrypt: {e}"))?;
        let decrypted_audio = cipher
            .decrypt(
                Nonce::from_slice(&parsed_blob.iv),
                parsed_blob.encrypted_audio.as_slice(),
            )
            .map_err(|e| format!("Failed to decrypt shared audio payload: {e}"))?;
        key.fill(0);

        let ext = infer_audio_extension(&decrypted_audio);
        let local_path = shared_audio_cache_path(
            &normalized_content_id,
            file_stem_hint.unwrap_or("shared-track"),
            ext,
        );
        if let Some(parent) = local_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed creating shared audio cache dir ({}): {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&local_path, &decrypted_audio).map_err(|e| {
            format!(
                "Failed writing decrypted shared audio ({}): {e}",
                local_path.display()
            )
        })?;

        Ok(json!({
            "contentId": normalized_content_id,
            "pieceCid": piece_cid,
            "localPath": local_path.to_string_lossy().to_string(),
            "bytes": decrypted_audio.len(),
            "cacheHit": false,
            "fetchedFrom": fetched_from,
            "decryptChain": "lit-action:contentDecryptV1",
        }))
    }

    fn decrypt_shared_content_tempo(
        &mut self,
        content_id_hex: &str,
        piece_cid: &str,
        blob: &[u8],
        fetched_from: Option<String>,
        file_stem_hint: Option<&str>,
        owner_address_hint: Option<&str>,
        grantee_address_hint: Option<&str>,
    ) -> Result<Value, String> {
        if blob.len() < 13 {
            return Err(format!(
                "Encrypted payload too small for Tempo decrypt ({} bytes).",
                blob.len()
            ));
        }
        let iv = &blob[..12];
        let ciphertext = &blob[12..];
        if ciphertext.is_empty() {
            return Err("Encrypted payload missing ciphertext bytes.".to_string());
        }

        let content_keypair = load_or_create_content_keypair()?;
        let wrapped_key = match load_wrapped_key_for_content(content_id_hex) {
            Some(envelope) => envelope,
            None => {
                let owner =
                    owner_address_hint.ok_or("Missing owner address for wrapped-key lookup.")?;
                let grantee = grantee_address_hint
                    .ok_or("Missing grantee address for wrapped-key lookup.")?;
                ensure_wrapped_key_from_ls3(content_id_hex, owner, grantee)?.ok_or_else(|| {
                    "No wrapped key envelope found for this shared track.".to_string()
                })?
            }
        };

        let mut raw_key = ecies_decrypt(&content_keypair.private_key, &wrapped_key)?;
        let decrypted_audio = decrypt_audio_blob(raw_key.as_slice(), iv, ciphertext)?;
        raw_key.fill(0);

        let ext = infer_audio_extension(&decrypted_audio);
        let local_path = shared_audio_cache_path(
            content_id_hex,
            file_stem_hint.unwrap_or("shared-track"),
            ext,
        );
        if let Some(parent) = local_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed creating shared audio cache dir ({}): {e}",
                    parent.display()
                )
            })?;
        }
        fs::write(&local_path, &decrypted_audio).map_err(|e| {
            format!(
                "Failed writing decrypted shared audio ({}): {e}",
                local_path.display()
            )
        })?;

        Ok(json!({
            "contentId": content_id_hex,
            "pieceCid": piece_cid,
            "localPath": local_path.to_string_lossy().to_string(),
            "bytes": decrypted_audio.len(),
            "cacheHit": false,
            "fetchedFrom": fetched_from,
            "decryptChain": "tempo-ecies-envelope-v1",
        }))
    }

    fn decrypt_content_key_payload_via_action(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        ciphertext_base64: &str,
        data_to_encrypt_hash_hex: &str,
    ) -> Result<Vec<u8>, String> {
        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_action(
            &network,
            "contentDecryptV1",
            &["HEAVEN_CONTENT_DECRYPT_V1_CID"],
            None,
        )?;
        let (cid, action_source) = match action {
            ResolvedAction::Ipfs { cid, source } => (cid, source),
            ResolvedAction::Code { source, .. } => {
                return Err(format!(
                    "contentDecryptV1 must be an IPFS CID (got {source}); set HEAVEN_CONTENT_DECRYPT_V1_CID"
                ));
            }
        };

        let timestamp = chrono::Utc::now().timestamp_millis();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );

        log::info!(
            "[LoadStorage] decrypt key via Lit Action: contentId={} actionSource={}",
            content_id_hex,
            action_source
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "contentId": content_id_hex.to_lowercase(),
            "ciphertext": ciphertext_base64,
            "dataToEncryptHash": data_to_encrypt_hash_hex,
            "decryptCid": cid,
            "timestamp": timestamp,
            "nonce": nonce,
        });

        let execute_result = self
            .lit_mut()?
            .execute_js_ipfs(cid.clone(), Some(params))
            .map_err(|e| format!("Content decrypt executeJs failed: {e}"))?;

        let payload = normalize_execute_response(execute_result.response)?;
        let success = payload
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !success {
            let msg = payload
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            return Err(format!(
                "Content decrypt failed: {msg} (contentId={content_id_hex}, actionSource={action_source})"
            ));
        }

        let decrypted_payload = payload
            .get("decryptedPayload")
            .and_then(Value::as_str)
            .ok_or("Content decrypt response missing decryptedPayload")?;
        Ok(decrypted_payload.as_bytes().to_vec())
    }
}
