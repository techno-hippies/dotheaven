use super::*;

impl LoadStorageService {
    pub fn decrypt_shared_content_to_local_file(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        gateway_url_hint: Option<&str>,
        file_stem_hint: Option<&str>,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?
            .to_string();

        match check_content_access_on_base(&user_address, &normalized_content_id) {
            Ok(true) => {}
            Ok(false) => {
                return Err(format!(
                    "Access denied on ContentAccessMirror for wallet={} contentId={}. Ask the owner to share again or wait for mirror sync.",
                    user_address, normalized_content_id
                ));
            }
            Err(err) => {
                log::warn!(
                    "[LoadStorage] canAccess preflight failed (continuing to Lit decrypt): {}",
                    err
                );
            }
        }

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

        let (decrypted_key_payload_bytes, decrypt_chain) = self
            .decrypt_content_key_payload_with_chain_fallback(
                parsed_blob.lit_ciphertext_base64.clone(),
                parsed_blob.data_to_encrypt_hash_hex.clone(),
                &normalized_content_id,
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
            "decryptChain": decrypt_chain,
        }))
    }

    fn decrypt_content_key_payload_with_chain_fallback(
        &mut self,
        ciphertext_base64: String,
        data_to_encrypt_hash_hex: String,
        content_id_hex: &str,
    ) -> Result<(Vec<u8>, String), String> {
        let primary_chain = lit_chain();
        let mut chains = vec![primary_chain.clone()];
        if !chains
            .iter()
            .any(|c| c.eq_ignore_ascii_case(DEFAULT_LIT_CHAIN))
        {
            chains.push(DEFAULT_LIT_CHAIN.to_string());
        }
        if !chains.iter().any(|c| c.eq_ignore_ascii_case("yellowstone")) {
            chains.push("yellowstone".to_string());
        }

        let mut errors = Vec::<String>::new();
        for chain in &chains {
            let conditions = build_content_access_conditions_for_chain(content_id_hex, chain);
            log::info!(
                "[LoadStorage] decrypt attempt: contentId={} chain={} dataToEncryptHash={} conditions={}",
                content_id_hex,
                chain,
                data_to_encrypt_hash_hex,
                serde_json::to_string(&conditions).unwrap_or_default(),
            );
            match self.lit_mut()?.decrypt_with_access_control(
                ciphertext_base64.clone(),
                data_to_encrypt_hash_hex.clone(),
                conditions,
                chain,
            ) {
                Ok(resp) => return Ok((resp.decrypted_data, chain.clone())),
                Err(err) => errors.push(format!("chain={chain}: {err}")),
            }
        }

        let joined = errors.join(" | ");
        let is_encrypted_payload_failure = !errors.is_empty()
            && errors.iter().all(|e| {
                e.contains("encrypted payload decryption failed") || e.contains("can't decrypt")
            });

        if is_encrypted_payload_failure {
            return Err(format!(
                "Unable to decrypt shared content key (contentId={content_id_hex}). The uploaded encrypted payload is incompatible with current Lit decryption context (likely legacy/invalid upload). Ask the owner to re-upload the track and share again. Details: {joined}"
            ));
        }

        Err(format!(
            "Failed to Lit-decrypt content key payload after chain fallback: {joined}"
        ))
    }
}
