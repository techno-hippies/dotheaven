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
                        "Turbo user-pays mode is not yet available for Tempo passkey sessions in GPUI. Disable HEAVEN_LOAD_USER_PAYS_ENABLED."
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
                                "Turbo credit is below minimum ({min_credit:.8}). Use Add Funds first."
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
        _auth: &PersistedAuth,
        _amount_hint: &str,
    ) -> Result<Value, String> {
        Err("Turbo user-pays funding is not yet available for Tempo sessions.".to_string())
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
        let session_wallet = load_tempo_session_wallet(auth)?;
        let owner = tempo_session_owner_pubkey_uncompressed(&session_wallet)?;
        let signature = sign_dataitem_with_tempo_session(&session_wallet, &signing_message)?;

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
