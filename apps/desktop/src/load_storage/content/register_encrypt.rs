use super::*;

impl LoadStorageService {
    pub(super) fn register_content(
        &mut self,
        auth: &PersistedAuth,
        track_id_hex: String,
        piece_cid: &str,
        title: &str,
        artist: &str,
        album: &str,
    ) -> Result<Value, String> {
        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );
        let piece_cid_hash = sha256_hex(&bytes_from_piece_cid(piece_cid)?);
        let register_message = format!(
            "heaven:content:register:{track_id_hex}:{piece_cid_hash}:{}:{ALGO_AES_GCM_256}:{timestamp}:{nonce}",
            user_address.to_lowercase()
        );

        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&register_message)
            .map_err(|e| format!("Failed to sign content register message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content registration",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_content_register(&network)?;
        log::info!(
            "[ContentRegister] resolved action: source={}",
            action.source()
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "trackId": track_id_hex,
            "pieceCid": piece_cid,
            "datasetOwner": user_address,
            "signature": signature_hex,
            "algo": ALGO_AES_GCM_256,
            "title": title,
            "artist": artist,
            "album": album,
            "timestamp": timestamp,
            "nonce": nonce,
        });

        let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) =
            match &action {
                ResolvedAction::Ipfs { cid, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        None,
                        Some(cid.clone()),
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source.clone())),
                ResolvedAction::Code { code, source } => self
                    .lit_mut()?
                    .execute_js_with_auth_context(
                        Some(code.clone()),
                        None,
                        Some(params),
                        &sponsor_auth_context,
                    )
                    .map(|res| (res, source.clone())),
            }
            .map_err(|e| format!("Content registration executeJs failed: {e}"))?;

        let mut payload = normalize_execute_response(execute_result.response)?;
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
            let version = payload
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let content_id = payload
                .get("contentId")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content register failed: {msg} (version={version}, contentId={content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }

    pub(super) fn encrypt_for_upload(
        &mut self,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        let mut iv = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut iv);

        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| format!("Failed to initialize AES key: {e}"))?;
        let encrypted_audio = cipher
            .encrypt(Nonce::from_slice(&iv), source_bytes)
            .map_err(|e| format!("Failed to encrypt audio payload: {e}"))?;

        let key_base64 = base64::engine::general_purpose::STANDARD.encode(key);
        key.fill(0);

        let payload = json!({
            "contentId": to_hex_prefixed(content_id.as_slice()).to_lowercase(),
            "key": key_base64,
        });

        // We bind the AES key decrypt capability to the content-decrypt-v1 Lit Action CID via
        // :currentActionIpfsId. Only that Lit Action can call decryptAndCombine to recover the key.
        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let decrypt_action = registry::resolve_action(
            &network,
            "contentDecryptV1",
            &["HEAVEN_CONTENT_DECRYPT_V1_CID"],
            None,
        )?;
        let (decrypt_cid, decrypt_source) = match decrypt_action {
            ResolvedAction::Ipfs { cid, source } => (cid, source),
            ResolvedAction::Code { source, .. } => {
                return Err(format!(
                    "contentDecryptV1 must be an IPFS CID (got {source}); set HEAVEN_CONTENT_DECRYPT_V1_CID"
                ));
            }
        };

        let unified_access_control_conditions = json!([
            {
                "conditionType": "evmBasic",
                "contractAddress": "",
                "standardContractType": "",
                "chain": "ethereum",
                "method": "",
                "parameters": [":currentActionIpfsId"],
                "returnValueTest": { "comparator": "=", "value": decrypt_cid }
            }
        ]);

        log::info!(
            "[LoadStorage] encrypt key ACC: decryptCidSource={} conditions={}",
            decrypt_source,
            serde_json::to_string(&unified_access_control_conditions).unwrap_or_default(),
        );

        let encrypt_response = self
            .lit_mut()?
            .encrypt_with_access_control(
                serde_json::to_vec(&payload)
                    .map_err(|e| format!("Failed to encode content key payload: {e}"))?,
                unified_access_control_conditions,
            )
            .map_err(|e| format!("Failed to Lit-encrypt content key payload: {e}"))?;

        log::info!(
            "[LoadStorage] encrypt result: dataToEncryptHash={}",
            encrypt_response.data_to_encrypt_hash_hex,
        );

        Ok(build_blob(
            encrypt_response.ciphertext_base64.as_bytes(),
            encrypt_response.data_to_encrypt_hash_hex.as_bytes(),
            &iv,
            &encrypted_audio,
        ))
    }
}
