use super::*;
use serde::Serialize;

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

    pub fn content_grant_access_batch(
        &mut self,
        auth: &PersistedAuth,
        content_ids_hex: &[String],
        grantee_address: &str,
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

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
