use super::*;

const REGISTRY_V1: &str = "0x29e1a73fC364855F073995075785e3fC2a1b6edC";
const RECORDS_V1: &str = "0x6072C4337e57538AE896C03317f02d830A25bbe4";
const CONTENT_PUBKEY_RECORD_KEY: &str = "contentPubKey";
const GAS_LIMIT_SET_TEXT: u64 = 420_000;

fn u64_to_u256_word(value: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&value.to_be_bytes());
    out
}

fn resolve_primary_name_node_for_owner(user_address: &str) -> Result<Option<[u8; 32]>, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"primaryName(address)")[..4]);
    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);

    let output = eth_call_raw(
        &tempo_rpc_url(),
        REGISTRY_V1,
        &to_hex_prefixed(call_data.as_slice()),
    )?;
    if output.is_empty() {
        return Ok(None);
    }

    let decoded = abi_decode(
        &[ParamType::String, ParamType::FixedBytes(32)],
        output.as_slice(),
    )
    .map_err(|e| format!("Failed decoding RegistryV1 primaryName response: {e}"))?;
    if decoded.len() != 2 {
        return Ok(None);
    }

    let label = decoded
        .first()
        .and_then(|token| match token {
            Token::String(value) => Some(value.trim().to_lowercase()),
            _ => None,
        })
        .unwrap_or_default();
    if label.is_empty() {
        return Ok(None);
    }
    let parent = match decoded.get(1) {
        Some(Token::FixedBytes(bytes)) if bytes.len() == 32 => {
            let mut out = [0u8; 32];
            out.copy_from_slice(bytes.as_slice());
            out
        }
        _ => return Ok(None),
    };
    if parent.iter().all(|b| *b == 0u8) {
        return Ok(None);
    }

    let label_hash = keccak256(label.as_bytes());
    let mut node_input = Vec::with_capacity(64);
    node_input.extend_from_slice(&parent);
    node_input.extend_from_slice(label_hash.as_slice());
    let node_hash = keccak256(node_input);
    let mut node = [0u8; 32];
    node.copy_from_slice(node_hash.as_slice());
    Ok(Some(node))
}

fn read_text_record(node: &[u8; 32], key: &str) -> Result<Option<String>, String> {
    let key_bytes = key.as_bytes();
    let padded_len = ((key_bytes.len() + 31) / 32) * 32;
    let mut call_data = Vec::with_capacity(4 + 32 + 32 + 32 + padded_len);
    call_data.extend_from_slice(&keccak256(b"text(bytes32,string)")[..4]);
    call_data.extend_from_slice(node);
    call_data.extend_from_slice(&u64_to_u256_word(64));
    call_data.extend_from_slice(&u64_to_u256_word(key_bytes.len() as u64));
    call_data.extend_from_slice(key_bytes);
    if padded_len > key_bytes.len() {
        call_data.extend(std::iter::repeat(0u8).take(padded_len - key_bytes.len()));
    }

    let output = eth_call_raw(
        &tempo_rpc_url(),
        RECORDS_V1,
        &to_hex_prefixed(call_data.as_slice()),
    )?;
    if output.is_empty() {
        return Ok(None);
    }
    let decoded = abi_decode(&[ParamType::String], output.as_slice())
        .map_err(|e| format!("Failed decoding RecordsV1 text(bytes32,string) response: {e}"))?;
    let value = decoded
        .first()
        .and_then(|token| match token {
            Token::String(value) => Some(value.trim().to_string()),
            _ => None,
        })
        .unwrap_or_default();
    if value.is_empty() {
        return Ok(None);
    }
    Ok(Some(value))
}

fn set_text_call_data(node: &[u8; 32], key: &str, value: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + 320);
    out.extend_from_slice(&keccak256(b"setText(bytes32,string,string)")[..4]);
    out.extend_from_slice(
        ethers::abi::encode(&[
            Token::FixedBytes(node.to_vec()),
            Token::String(key.to_string()),
            Token::String(value.to_string()),
        ])
        .as_slice(),
    );
    out
}

fn ensure_tempo_content_pubkey_published(
    auth: &PersistedAuth,
    content_public_key: &[u8],
) -> Result<(), String> {
    let owner = auth
        .primary_wallet_address()
        .ok_or("Missing wallet address in auth")?;
    let owner = normalize_address(owner)?;
    let Some(node) = resolve_primary_name_node_for_owner(&owner)? else {
        log::info!(
            "[LoadStorage] contentPubKey publish skipped: no primary name set for owner={}",
            owner
        );
        return Ok(());
    };

    let desired = format!("0x{}", hex::encode(content_public_key));
    if let Some(existing) = read_text_record(&node, CONTENT_PUBKEY_RECORD_KEY)? {
        if existing.trim().eq_ignore_ascii_case(desired.as_str()) {
            return Ok(());
        }
    }

    let call_data = set_text_call_data(&node, CONTENT_PUBKEY_RECORD_KEY, desired.as_str());
    let tx_hash = crate::scrobble::submit_tempo_contract_call(
        auth,
        RECORDS_V1,
        call_data,
        GAS_LIMIT_SET_TEXT,
        "contentPubKey publish",
    )?;
    log::info!(
        "[LoadStorage] contentPubKey published: owner={} txHash={}",
        owner,
        tx_hash
    );
    Ok(())
}

fn should_retry_content_register_with_local(payload: &Value, action_source: &str) -> bool {
    if !action_source.starts_with("cid-map:") || !action_source.contains("contentRegisterMegaethV1")
    {
        return false;
    }
    if payload
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return false;
    }
    let Some(err) = payload.get("error").and_then(Value::as_str) else {
        return false;
    };
    let lower = err.to_ascii_lowercase();
    (lower.contains("[error]") && lower.contains("not valid json"))
        || (lower.contains("unexpected token") && lower.contains("json"))
}

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
        let user_public_key = user_public_key
            .trim()
            .strip_prefix("0x")
            .or_else(|| user_public_key.trim().strip_prefix("0X"))
            .unwrap_or(user_public_key.trim());
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

        let mut execute_register_action =
            |resolved_action: &ResolvedAction| -> Result<(Value, String), String> {
                let (execute_result, action_source): (lit_rust_sdk::ExecuteJsResponse, String) =
                    match resolved_action {
                        ResolvedAction::Ipfs { cid, source } => self
                            .lit_mut()?
                            .execute_js_with_auth_context(
                                None,
                                Some(cid.clone()),
                                Some(params.clone()),
                                &sponsor_auth_context,
                            )
                            .map(|res| (res, source.clone())),
                        ResolvedAction::Code { code, source } => self
                            .lit_mut()?
                            .execute_js_with_auth_context(
                                Some(code.clone()),
                                None,
                                Some(params.clone()),
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
                Ok((payload, action_source))
            };

        let (mut payload, mut action_source) = execute_register_action(&action)?;
        let mut local_retry_error: Option<String> = None;
        if should_retry_content_register_with_local(&payload, &action_source) {
            match registry::resolve_local_action("contentRegisterMegaethV1") {
                Ok(local_action) => {
                    log::warn!(
                        "[ContentRegister] CID action returned JSON parse error; retrying with local action: originalSource={} localSource={}",
                        action_source,
                        local_action.source(),
                    );
                    match execute_register_action(&local_action) {
                        Ok((retry_payload, retry_source)) => {
                            payload = retry_payload;
                            action_source = retry_source;
                        }
                        Err(err) => {
                            local_retry_error = Some(err);
                        }
                    }
                }
                Err(err) => {
                    local_retry_error = Some(err);
                }
            }
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
            let local_retry_suffix = local_retry_error
                .map(|err| format!(", localRetryError={err}"))
                .unwrap_or_default();
            return Err(format!(
                "Content register failed: {msg} (version={version}, contentId={content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source}{local_retry_suffix})"
            ));
        }

        Ok(payload)
    }

    pub(super) fn encrypt_for_upload(
        &mut self,
        auth: &PersistedAuth,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            return self.encrypt_for_upload_tempo(auth, source_bytes, content_id);
        }
        self.encrypt_for_upload_lit(source_bytes, content_id)
    }

    fn encrypt_for_upload_tempo(
        &mut self,
        auth: &PersistedAuth,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        let mut encrypted = encrypt_audio_blob(source_bytes)?;
        let content_keypair = load_or_create_content_keypair()?;
        if let Err(err) = ensure_tempo_content_pubkey_published(auth, &content_keypair.public_key) {
            log::warn!("[LoadStorage] contentPubKey publish failed: {}", err);
        }
        let wrapped_key = ecies_encrypt(&content_keypair.public_key, &encrypted.raw_key)?;
        encrypted.raw_key.fill(0);

        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();
        save_wrapped_key_for_content(&content_id_hex, &wrapped_key)?;

        let mut blob = Vec::with_capacity(12 + encrypted.ciphertext.len());
        blob.extend_from_slice(&encrypted.iv);
        blob.extend_from_slice(&encrypted.ciphertext);
        Ok(blob)
    }

    fn encrypt_for_upload_lit(
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
