use super::*;
use serde::Serialize;

const REGISTRY_V1: &str = "0x29e1a73fC364855F073995075785e3fC2a1b6edC";
const RECORDS_V1: &str = "0x6072C4337e57538AE896C03317f02d830A25bbe4";
const CONTENT_PUBKEY_RECORD_KEY: &str = "contentPubKey";

fn u64_to_u256_word(value: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&value.to_be_bytes());
    out
}

fn parse_uncompressed_p256_pubkey(raw: &str) -> Result<Vec<u8>, String> {
    let clean = raw
        .trim()
        .strip_prefix("0x")
        .or_else(|| raw.trim().strip_prefix("0X"))
        .unwrap_or(raw.trim());
    let decoded = hex::decode(clean).map_err(|e| format!("Invalid contentPubKey hex: {e}"))?;
    if decoded.len() != 65 || decoded[0] != 0x04 {
        return Err(
            "Invalid contentPubKey format (expected 65-byte uncompressed P256 key).".to_string(),
        );
    }
    Ok(decoded)
}

fn resolve_primary_name_node(user_address: &str) -> Result<Option<[u8; 32]>, String> {
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

fn fetch_content_pubkey_for_address(user_address: &str) -> Result<Vec<u8>, String> {
    let Some(node) = resolve_primary_name_node(user_address)? else {
        return Err("Recipient has no primary name set for contentPubKey lookup.".to_string());
    };

    let key_bytes = CONTENT_PUBKEY_RECORD_KEY.as_bytes();
    let padded_len = ((key_bytes.len() + 31) / 32) * 32;
    let mut call_data = Vec::with_capacity(4 + 32 + 32 + 32 + padded_len);
    call_data.extend_from_slice(&keccak256(b"text(bytes32,string)")[..4]);
    call_data.extend_from_slice(&node);
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
        return Err("Recipient contentPubKey record is empty.".to_string());
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
        return Err("Recipient contentPubKey record is not set.".to_string());
    }
    parse_uncompressed_p256_pubkey(&value)
}

impl LoadStorageService {
    pub fn content_deactivate(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );

        let message =
            format!("heaven:content:deactivate:{normalized_content_id}:{timestamp}:{nonce}");
        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&message)
            .map_err(|e| format!("Failed to sign content deactivate message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content deactivation",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_action(
            &network,
            "contentAccessV1",
            &["HEAVEN_CONTENT_ACCESS_V1_CID"],
            Some("HEAVEN_CONTENT_ACCESS_V1_CODE_PATH"),
        )?;
        log::info!(
            "[ContentAccess] resolved action (deactivate): source={}",
            action.source()
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "operation": "deactivate",
            "contentId": normalized_content_id,
            "timestamp": timestamp,
            "nonce": nonce,
            "signature": signature_hex,
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
            .map_err(|e| format!("Content deactivate executeJs failed: {e}"))?;

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
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content deactivate failed: {msg} (version={version}, contentId={normalized_content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }

    pub fn content_grant_access(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        grantee_address: &str,
    ) -> Result<Value, String> {
        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            return self.content_share_envelope(auth, content_id_hex, grantee_address);
        }
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let grantee = grantee_address
            .parse::<Address>()
            .map_err(|e| format!("Invalid grantee wallet address: {e}"))?;
        let grantee_hex = to_hex_prefixed(grantee.as_slice()).to_lowercase();

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );

        let grant_message = format!(
            "heaven:content:grant:{normalized_content_id}:{}:{timestamp}:{nonce}",
            grantee_hex.to_lowercase()
        );
        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&grant_message)
            .map_err(|e| format!("Failed to sign content access grant message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content access grant",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_action(
            &network,
            "contentAccessV1",
            &["HEAVEN_CONTENT_ACCESS_V1_CID"],
            Some("HEAVEN_CONTENT_ACCESS_V1_CODE_PATH"),
        )?;
        log::info!(
            "[ContentAccess] resolved action: source={}",
            action.source()
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "operation": "grant",
            "contentId": normalized_content_id,
            "grantee": grantee_hex,
            "timestamp": timestamp,
            "nonce": nonce,
            "signature": signature_hex,
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
            .map_err(|e| format!("Content access executeJs failed: {e}"))?;

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
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content access grant failed: {msg} (version={version}, contentId={normalized_content_id}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }

    pub fn content_share_envelope(
        &mut self,
        auth: &PersistedAuth,
        content_id_hex: &str,
        grantee_address: &str,
    ) -> Result<Value, String> {
        let owner_address = auth
            .primary_wallet_address()
            .ok_or("Missing wallet address in auth")?;
        let owner = normalize_address(owner_address)?;
        let grantee = normalize_address(grantee_address)?;
        if owner == grantee {
            return Err("Cannot share content with your own wallet address.".to_string());
        }

        let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
        let content_keypair = load_or_create_content_keypair()?;
        let wrapped_key = match load_wrapped_key_for_content(&normalized_content_id) {
            Some(envelope) => envelope,
            None => ensure_wrapped_key_from_ls3(&normalized_content_id, &owner, &owner)?
                .ok_or_else(|| {
                    "Missing wrapped content key for this track on this device.".to_string()
                })?,
        };

        let mut raw_key = ecies_decrypt(&content_keypair.private_key, &wrapped_key)?;
        let recipient_pubkey = fetch_content_pubkey_for_address(&grantee)?;
        let recipient_envelope = ecies_encrypt(&recipient_pubkey, raw_key.as_slice())?;
        raw_key.fill(0);

        let payload = json!({
            "version": 1,
            "contentId": normalized_content_id,
            "owner": owner,
            "grantee": grantee,
            "algo": ALGO_AES_GCM_256,
            "ephemeralPub": hex::encode(&recipient_envelope.ephemeral_pub),
            "iv": hex::encode(&recipient_envelope.iv),
            "ciphertext": hex::encode(&recipient_envelope.ciphertext),
        });
        let payload_bytes = serde_json::to_vec(&payload)
            .map_err(|e| format!("Failed encoding envelope payload JSON: {e}"))?;
        let upload = self.upload_to_load(
            auth,
            &payload_bytes,
            None,
            vec![
                json!({"name": "Content-Type", "value": "application/json"}),
                json!({"name": "App-Name", "value": "Heaven"}),
                json!({"name": "Heaven-Type", "value": "content-key-envelope"}),
                json!({"name": "Content-Id", "value": normalized_content_id}),
                json!({"name": "Owner", "value": owner}),
                json!({"name": "Grantee", "value": grantee}),
                json!({"name": "Upload-Source", "value": "heaven-desktop"}),
            ],
        )?;

        Ok(json!({
            "success": true,
            "version": "tempo-envelope-v1",
            "txHash": Value::Null,
            "mirrorTxHash": Value::Null,
            "envelopeId": upload.id,
            "gatewayUrl": upload.gateway_url,
        }))
    }

    pub fn content_grant_access_batch(
        &mut self,
        auth: &PersistedAuth,
        content_ids_hex: &[String],
        grantee_address: &str,
    ) -> Result<Value, String> {
        if content_ids_hex.is_empty() {
            return Err("contentIds must be a non-empty array".to_string());
        }

        let grantee = grantee_address
            .parse::<Address>()
            .map_err(|e| format!("Invalid grantee wallet address: {e}"))?;
        let grantee_hex = to_hex_prefixed(grantee.as_slice()).to_lowercase();

        let mut normalized_content_ids = Vec::<String>::new();
        let mut seen = HashSet::<String>::new();
        for id in content_ids_hex {
            let normalized = normalize_content_id_hex(id)?;
            if seen.insert(normalized.clone()) {
                normalized_content_ids.push(normalized);
            }
        }
        if normalized_content_ids.is_empty() {
            return Err("contentIds must contain at least one valid entry".to_string());
        }

        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            let mut envelope_ids = Vec::<String>::with_capacity(normalized_content_ids.len());
            for content_id in &normalized_content_ids {
                let payload = self.content_share_envelope(auth, content_id, &grantee_hex)?;
                let envelope_id = payload
                    .get("envelopeId")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        format!(
                            "Tempo envelope share response missing envelopeId for contentId={content_id}"
                        )
                    })?;
                envelope_ids.push(envelope_id.to_string());
            }
            return Ok(json!({
                "success": true,
                "version": "tempo-envelope-batch-v1",
                "txHash": Value::Null,
                "mirrorTxHash": Value::Null,
                "envelopeIds": envelope_ids,
                "contentIds": normalized_content_ids,
            }));
        }

        self.ensure_lit_ready(auth)?;
        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let nonce = format!(
            "{:x}",
            chrono::Utc::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
                .unsigned_abs()
        );

        #[derive(Serialize)]
        struct Payload<'a> {
            #[serde(rename = "contentIds")]
            content_ids: &'a Vec<String>,
            grantee: &'a str,
        }

        let payload_json = serde_json::to_string(&Payload {
            content_ids: &normalized_content_ids,
            grantee: grantee_hex.as_str(),
        })
        .map_err(|e| format!("Failed encoding grantBatch payload: {e}"))?;
        let payload_hash = sha256_hex(payload_json.as_bytes());
        let grant_message =
            format!("heaven:content:grantBatch:{payload_hash}:{timestamp}:{nonce}",);

        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&grant_message)
            .map_err(|e| format!("Failed to sign content access batch grant message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor content access batch grant",
            "localhost",
            7,
        )?;

        let network = self
            .lit_mut()?
            .network_name()
            .unwrap_or("naga-dev")
            .to_string();
        let action = registry::resolve_action(
            &network,
            "contentAccessV1",
            &["HEAVEN_CONTENT_ACCESS_V1_CID"],
            Some("HEAVEN_CONTENT_ACCESS_V1_CODE_PATH"),
        )?;
        log::info!(
            "[ContentAccess] resolved action (batch): source={}",
            action.source()
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "operation": "grantBatch",
            "contentIds": normalized_content_ids,
            "grantee": grantee_hex,
            "timestamp": timestamp,
            "nonce": nonce,
            "signature": signature_hex,
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
            .map_err(|e| format!("Content access batch executeJs failed: {e}"))?;

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
            let tx_hash = payload
                .get("txHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            let mirror_tx = payload
                .get("mirrorTxHash")
                .and_then(Value::as_str)
                .unwrap_or("n/a");
            return Err(format!(
                "Content access batch grant failed: {msg} (version={version}, txHash={tx_hash}, mirrorTxHash={mirror_tx}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }
}
