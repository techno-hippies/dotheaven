use super::*;

impl LoadStorageService {
    pub fn probe_content_decrypt_v1(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        _gateway_url_hint: Option<&str>,
    ) -> Result<(), String> {
        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let piece_cid = piece_cid.trim();
        if piece_cid.is_empty() {
            return Err("pieceCid is empty".to_string());
        }

        if load_wrapped_key_for_content(&normalized_content_id).is_some() {
            return Ok(());
        }

        let owner = auth
            .wallet_address()
            .ok_or("Missing wallet address in auth")?;
        if ensure_wrapped_key_from_ls3(&normalized_content_id, owner, owner)?.is_some() {
            return Ok(());
        }

        Err(format!(
            "No wrapped key envelope found for contentId={normalized_content_id} (pieceCid={piece_cid})."
        ))
    }

    pub fn decrypt_shared_content_to_local_file(
        &mut self,
        _auth: &PersistedAuth,
        content_id_hex: &str,
        piece_cid: &str,
        gateway_url_hint: Option<&str>,
        file_stem_hint: Option<&str>,
        owner_address_hint: Option<&str>,
        grantee_address_hint: Option<&str>,
    ) -> Result<Value, String> {
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

        self.decrypt_shared_content_tempo(
            &normalized_content_id,
            piece_cid,
            &blob,
            fetched_from,
            file_stem_hint,
            owner_address_hint,
            grantee_address_hint,
        )
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
}
