use super::*;
use ethers::signers::{LocalWallet, Signer};
use std::str::FromStr;

fn load_tempo_session_wallet(auth: &PersistedAuth) -> Result<LocalWallet, String> {
    let session_private_key = auth
        .tempo_session_private_key
        .as_deref()
        .ok_or("Missing Tempo session private key in auth")?;
    let session_wallet = LocalWallet::from_str(session_private_key).map_err(|e| {
        format!("Invalid Tempo session private key in auth (cannot parse wallet): {e}")
    })?;
    if let Some(expires_at) = auth.tempo_session_expires_at {
        let now = chrono::Utc::now().timestamp() as u64;
        if now >= expires_at {
            return Err(
                "Tempo session key has expired. Sign in again to refresh the web auth session."
                    .to_string(),
            );
        }
    }
    if let Some(session_address) = auth.tempo_session_address.as_deref() {
        let expected = session_address
            .trim()
            .parse::<ethers::types::Address>()
            .map_err(|e| format!("Invalid Tempo session address in auth: {e}"))?;
        if session_wallet.address() != expected {
            return Err(
                "Tempo session private key does not match the callback session address."
                    .to_string(),
            );
        }
    }
    Ok(session_wallet)
}

fn tempo_session_owner_pubkey_uncompressed(
    session_wallet: &LocalWallet,
) -> Result<Vec<u8>, String> {
    let encoded = session_wallet
        .signer()
        .verifying_key()
        .to_encoded_point(false);
    let owner = encoded.as_bytes().to_vec();
    if owner.len() != 65 || owner[0] != 0x04 {
        return Err(format!(
            "Invalid Tempo session public key encoding for ANS-104 owner ({} bytes).",
            owner.len()
        ));
    }
    Ok(owner)
}

fn sign_dataitem_with_tempo_session(
    session_wallet: &LocalWallet,
    signing_message: &[u8],
) -> Result<Vec<u8>, String> {
    let signing_hash = ethers::utils::hash_message(signing_message);
    let mut signature = session_wallet
        .sign_hash(signing_hash)
        .map_err(|e| format!("Failed to sign ANS-104 payload with Tempo session key: {e}"))?
        .to_vec();
    if signature.len() != 65 {
        return Err(format!(
            "Invalid Tempo session signature length for ANS-104 dataitem: {}",
            signature.len()
        ));
    }
    if signature[64] < 27 {
        signature[64] = signature[64].saturating_add(27);
    }
    Ok(signature)
}

impl LoadStorageService {
    pub(super) fn ensure_upload_ready(
        &mut self,
        auth: Option<&PersistedAuth>,
        size_bytes: Option<usize>,
    ) -> (bool, Option<String>) {
        if let Some(size) = size_bytes {
            if size > MAX_UPLOAD_BYTES {
                return (
                    false,
                    Some(format!(
                        "File exceeds current desktop upload limit ({} bytes)",
                        MAX_UPLOAD_BYTES
                    )),
                );
            }
        }

        let health = self.load_health_check();
        if !health.ok {
            return (false, health.reason);
        }

        if load_user_pays_enabled() {
            let auth = match auth {
                Some(v) => v,
                None => {
                    return (
                        false,
                        Some(
                            "Missing auth context required for Turbo user-pays balance checks"
                                .to_string(),
                        ),
                    );
                }
            };
            if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
                return (
                    false,
                    Some(
                        "Turbo user-pays mode is not yet available for Tempo passkey sessions in GPUI. Disable HEAVEN_LOAD_USER_PAYS_ENABLED or use Lit/PKP auth."
                            .to_string(),
                    ),
                );
            }
            match self.fetch_turbo_balance(auth) {
                Ok(balance_payload) => {
                    let parsed = extract_balance_hint(&balance_payload);
                    let min_credit = min_upload_credit();
                    let has_credit = parsed.map(|v| v >= min_credit).unwrap_or(false);
                    if !has_credit {
                        return (
                            false,
                            Some(format!(
                                "Turbo credit is below minimum ({min_credit:.8}). Use Add Funds to submit a Base Sepolia PKP payment first."
                            )),
                        );
                    }
                }
                Err(err) => {
                    return (
                        false,
                        Some(format!("Turbo balance check failed before upload: {err}")),
                    );
                }
            }
        }

        (true, None)
    }

    pub(super) fn run_turbo_user_pays_funding(
        &mut self,
        auth: &PersistedAuth,
        amount_hint: &str,
    ) -> Result<Value, String> {
        if auth.provider_kind() == crate::auth::AuthProviderKind::TempoPasskey {
            return Err(
                "Turbo user-pays funding from GPUI is not yet available for Tempo passkey sessions."
                    .to_string(),
            );
        }
        let user_address = auth
            .pkp_address
            .as_deref()
            .ok_or("Missing PKP address in auth")?;
        let token = turbo_funding_token();
        if token != "base-eth" {
            return Err(format!(
                "Unsupported HEAVEN_TURBO_FUNDING_TOKEN={token}. Current GPUI user-pays implementation supports only base-eth (native Base Sepolia transfer)."
            ));
        }
        let amount_hint = amount_hint.trim();
        if amount_hint.is_empty() {
            return Err("Missing funding amount (ETH) for Base Sepolia transfer".to_string());
        }

        log::info!(
            "[LoadStorage] funding start: user={} amount={} token={}",
            user_address,
            amount_hint,
            token
        );
        let proxy_url = turbo_funding_proxy_url();
        let wallets_url = format!("{proxy_url}/turbo/wallets");
        log::info!(
            "[LoadStorage] funding resolving deposit wallet: {}",
            wallets_url
        );
        let wallets_payload = http_get_json(&wallets_url)?;
        let deposit_address =
            extract_turbo_deposit_address(&wallets_payload, &token).ok_or_else(|| {
                format!(
                    "Unable to resolve Turbo deposit address for token={token} from /turbo/wallets response"
                )
            })?;
        log::info!(
            "[LoadStorage] funding deposit wallet resolved: token={} address={}",
            token,
            deposit_address
        );

        log::info!(
            "[LoadStorage] funding sending PKP tx: chainId={} rpc={}",
            BASE_SEPOLIA_CHAIN_ID,
            base_sepolia_rpc_url()
        );
        let tx_result = self.lit_mut()?.pkp_send_native_transaction(
            &base_sepolia_rpc_url(),
            BASE_SEPOLIA_CHAIN_ID,
            &deposit_address,
            amount_hint,
            true,
        )?;
        let tx_hash = tx_result
            .get("txHash")
            .and_then(Value::as_str)
            .ok_or("PKP send transaction response missing txHash")?
            .to_string();
        log::info!("[LoadStorage] funding PKP tx sent: txHash={}", tx_hash);

        let submit_url = format!("{proxy_url}/turbo/submit-fund");
        let submit_input = json!({
            "token": token,
            "txId": tx_hash,
            "userAddress": user_address,
        });

        let mut submit_payload = None;
        let mut submit_last_err = None;
        for attempt in 1..=5 {
            log::info!(
                "[LoadStorage] funding submit-fund attempt {}/5: {}",
                attempt,
                submit_url
            );
            match http_post_json(&submit_url, submit_input.clone()) {
                Ok(payload) => {
                    submit_payload = Some(payload);
                    log::info!(
                        "[LoadStorage] funding submit-fund succeeded on attempt {}",
                        attempt
                    );
                    break;
                }
                Err(err) => {
                    log::warn!(
                        "[LoadStorage] funding submit-fund attempt {} failed: {}",
                        attempt,
                        err
                    );
                    submit_last_err = Some(err);
                    if attempt < 5 {
                        std::thread::sleep(Duration::from_secs(3));
                    }
                }
            }
        }
        let submit_payload = submit_payload.ok_or_else(|| {
            format!(
                "submit-fund failed after retries: {}",
                submit_last_err.unwrap_or_else(|| "unknown error".to_string())
            )
        })?;

        log::info!("[LoadStorage] funding fetching updated turbo balance");
        let balance_payload = self.fetch_turbo_balance(auth)?;
        let balance_hint = extract_balance_hint(&balance_payload);
        log::info!(
            "[LoadStorage] funding flow complete: txHash={} balanceHint={:?}",
            tx_hash,
            balance_hint
        );

        Ok(json!({
            "ok": true,
            "txHash": tx_result.get("txHash").cloned().unwrap_or(Value::Null),
            "blockNumber": tx_result.get("blockNumber").cloned().unwrap_or(Value::Null),
            "txStatus": tx_result.get("status").cloned().unwrap_or(Value::Null),
            "gasUsed": tx_result.get("gasUsed").cloned().unwrap_or(Value::Null),
            "message": "Base Sepolia PKP funding submitted and Turbo credit refresh attempted.",
            "uploadMode": load_upload_mode_label(),
            "uploadToken": load_turbo_upload_token(),
            "amountHint": amount_hint,
            "fundingToken": token,
            "depositAddress": deposit_address,
            "submitFund": submit_payload,
            "balanceRaw": balance_payload,
            "balanceHint": balance_hint,
            "turboFundingEnabled": true,
            "turboFundingProxyUrl": proxy_url,
            "baseSepoliaRpcUrl": base_sepolia_rpc_url(),
        }))
    }

    pub(super) fn upload_to_load(
        &mut self,
        auth: &PersistedAuth,
        payload: &[u8],
        file_path: Option<&str>,
        tags: Vec<Value>,
    ) -> Result<UploadResult, String> {
        let signed_dataitem = self.build_signed_dataitem(auth, payload, file_path, &tags)?;
        upload_signed_dataitem(&signed_dataitem)
    }

    fn build_signed_dataitem(
        &mut self,
        auth: &PersistedAuth,
        payload: &[u8],
        file_path: Option<&str>,
        tags: &[Value],
    ) -> Result<Vec<u8>, String> {
        let mut ans_tags = convert_tags(tags);
        if !ans_tags
            .iter()
            .any(|tag| tag.name.eq_ignore_ascii_case("Content-Type"))
        {
            ans_tags.insert(0, Tag::new("Content-Type", infer_content_type(file_path)));
        }

        let mut item = DataItem::new(None, None, ans_tags, payload.to_vec())
            .map_err(|e| format!("Failed to build dataitem payload: {e}"))?;
        item.signature_type = SignatureType::Ethereum;

        let signing_message = item.signing_message();
        let (owner, signature) = if auth.provider_kind()
            == crate::auth::AuthProviderKind::TempoPasskey
        {
            let session_wallet = load_tempo_session_wallet(auth)?;
            let owner = tempo_session_owner_pubkey_uncompressed(&session_wallet)?;
            let signature = sign_dataitem_with_tempo_session(&session_wallet, &signing_message)?;
            (owner, signature)
        } else {
            let owner = parse_pkp_public_key(auth)?;
            let signature = self
                .lit_mut()?
                .pkp_sign_ethereum_message(&signing_message)
                .map_err(|e| format!("Failed to PKP-sign dataitem: {e}"))?;
            (owner, signature)
        };

        if signature.len() != 65 {
            return Err(format!(
                "Invalid dataitem signature length: {}",
                signature.len()
            ));
        }

        item.owner = owner;
        item.signature = signature;
        item.to_bytes()
            .map_err(|e| format!("Failed to encode signed dataitem bytes: {e}"))
    }
}
