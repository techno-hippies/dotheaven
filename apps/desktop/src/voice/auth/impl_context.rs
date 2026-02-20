use super::*;
use ethers::signers::Signer;

fn normalize_private_key_hex(value: &str) -> Result<String, String> {
    let trimmed = value
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X");
    if trimmed.len() != 64 || !trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Invalid Tempo session private key in persisted auth.".to_string());
    }
    Ok(trimmed.to_ascii_lowercase())
}

fn normalize_address(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let with_prefix = if trimmed.starts_with("0x") || trimmed.starts_with("0X") {
        trimmed.to_string()
    } else {
        format!("0x{trimmed}")
    };
    if with_prefix.len() != 42 || !with_prefix[2..].chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    Some(with_prefix.to_ascii_lowercase())
}

fn now_epoch_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl WorkerAuthContext {
    pub fn from_disk() -> Result<Self, String> {
        let persisted = auth::load_from_disk()
            .ok_or_else(|| "No persisted auth found. Sign in from Settings first.".to_string())?;
        Self::from_persisted(persisted)
    }

    fn from_persisted(persisted: PersistedAuth) -> Result<Self, String> {
        let fallback_wallet = persisted
            .wallet_address()
            .ok_or_else(|| "Persisted auth is missing wallet address".to_string())?
            .to_lowercase();

        let mut signer: Option<LocalWallet> = None;
        let mut wallet = fallback_wallet.clone();

        if let (Some(session_pk), Some(session_address)) = (
            persisted.tempo_session_private_key.as_deref(),
            persisted.tempo_session_address.as_deref(),
        ) {
            if let Some(expires_at) = persisted.tempo_session_expires_at {
                if now_epoch_seconds() >= expires_at {
                    return Err(
                        "Tempo session key has expired. Sign in again to refresh session auth."
                            .to_string(),
                    );
                }
            }

            let normalized_pk = normalize_private_key_hex(session_pk)?;
            let decoded_pk = hex::decode(normalized_pk)
                .map_err(|e| format!("Failed to decode Tempo session private key: {e}"))?;
            let session_wallet = LocalWallet::from_bytes(&decoded_pk)
                .map_err(|e| format!("Invalid Tempo session private key: {e}"))?;

            let expected_address = normalize_address(session_address)
                .ok_or_else(|| "Invalid Tempo session address in persisted auth.".to_string())?;
            let signer_address = format!("{:#x}", session_wallet.address());
            if !signer_address.eq_ignore_ascii_case(&expected_address) {
                return Err(
                    "Tempo session private key does not match persisted session address."
                        .to_string(),
                );
            }

            signer = Some(session_wallet);
            wallet = expected_address;
        }

        Ok(Self {
            wallet,
            signer,
            cache: HashMap::new(),
        })
    }

    pub(super) fn sign_message(&mut self, message: &str) -> Result<String, String> {
        let signer = self.signer.as_ref().ok_or_else(|| {
            "Tempo session signing key is unavailable. Sign in again to refresh auth.".to_string()
        })?;

        let hash = ethers::utils::hash_message(message.as_bytes());
        let signature = signer
            .sign_hash(hash)
            .map_err(|e| format!("Failed to sign worker auth nonce: {e}"))?;
        Ok(format!("0x{}", hex::encode(signature.to_vec())))
    }

    pub fn wallet(&self) -> &str {
        &self.wallet
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }
}
