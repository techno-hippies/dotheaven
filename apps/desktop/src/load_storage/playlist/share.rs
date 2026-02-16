use super::*;

impl LoadStorageService {
    pub fn playlist_share_with_wallet(
        &mut self,
        auth: &PersistedAuth,
        playlist_id_hex: &str,
        grantee_address: &str,
        operation: &str, // "share" | "unshare"
    ) -> Result<Value, String> {
        self.ensure_lit_ready(auth)?;

        let user_public_key = auth
            .pkp_public_key
            .as_deref()
            .ok_or("Missing PKP public key in auth")?;

        let normalized_playlist_id = normalize_bytes32_hex(playlist_id_hex, "playlistId")?;
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

        let op = operation.trim();
        if op != "share" && op != "unshare" {
            return Err(format!("Invalid playlist share operation: {op}"));
        }

        let message = format!(
            "heaven:playlist:{op}:{normalized_playlist_id}:{}:{timestamp}:{nonce}",
            grantee_hex.to_lowercase()
        );
        let signature_bytes = self
            .lit_mut()?
            .pkp_personal_sign(&message)
            .map_err(|e| format!("Failed to sign playlist share message: {e}"))?;
        let signature_hex = to_hex_prefixed(&signature_bytes);

        let sponsor_private_key = require_sponsor_private_key()?;
        let sponsor_auth_context = self.lit_mut()?.create_auth_context_from_eth_wallet(
            sponsor_pkp_public_key_hex().as_str(),
            &sponsor_private_key,
            "Heaven desktop sponsor playlist share",
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
            "playlistShareV1",
            &["HEAVEN_PLAYLIST_SHARE_V1_CID"],
            Some("HEAVEN_PLAYLIST_SHARE_V1_CODE_PATH"),
        )?;
        log::info!(
            "[PlaylistShare] resolved action: source={}, operation={}",
            action.source(),
            op
        );

        let params = json!({
            "userPkpPublicKey": user_public_key,
            "operation": op,
            "playlistId": normalized_playlist_id,
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
            .map_err(|e| format!("Playlist share executeJs failed: {e}"))?;

        let mut payload =
            normalize_lit_action_response(execute_result.response, "playlist-share-v1")?;
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
            return Err(format!(
                "Playlist share failed: {msg} (version={version}, operation={op}, playlistId={normalized_playlist_id}, txHash={tx_hash}, actionSource={action_source})"
            ));
        }

        Ok(payload)
    }
}
