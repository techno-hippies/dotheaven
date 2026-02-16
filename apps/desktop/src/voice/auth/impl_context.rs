use super::*;

impl WorkerAuthContext {
    pub fn from_disk() -> Result<Self, String> {
        let persisted = auth::load_from_disk().ok_or_else(|| {
            "No persisted auth found. Sign in from Settings before using Scarlett voice."
                .to_string()
        })?;
        Self::from_persisted(persisted)
    }

    fn from_persisted(persisted: PersistedAuth) -> Result<Self, String> {
        let wallet = persisted
            .pkp_address
            .clone()
            .ok_or_else(|| "Persisted auth is missing pkpAddress".to_string())?
            .to_lowercase();
        Ok(Self {
            persisted,
            signer: None,
            wallet,
            cache: HashMap::new(),
        })
    }

    fn signer(&mut self) -> Result<&mut LitWalletService, String> {
        if self.signer.is_none() {
            let mut lit = LitWalletService::new()?;
            let mut last_err = None;
            for attempt in 0..=LIT_INIT_RETRY_COUNT {
                match lit.initialize_from_auth(&self.persisted) {
                    Ok(_) => {
                        last_err = None;
                        break;
                    }
                    Err(err)
                        if attempt < LIT_INIT_RETRY_COUNT && is_retryable_lit_init_error(&err) =>
                    {
                        let retry_idx = attempt + 1;
                        let delay_ms = LIT_INIT_RETRY_BASE_DELAY_MS * retry_idx as u64;
                        log::warn!(
                            "[Auth] Lit init transient failure (retry {}/{} in {}ms): {}",
                            retry_idx,
                            LIT_INIT_RETRY_COUNT,
                            delay_ms,
                            err
                        );
                        lit.clear();
                        std::thread::sleep(Duration::from_millis(delay_ms));
                        last_err = Some(err);
                    }
                    Err(err) => return Err(err),
                }
            }

            if let Some(err) = last_err {
                return Err(err);
            }
            self.signer = Some(lit);
        }
        self.signer
            .as_mut()
            .ok_or_else(|| "Lit signer unavailable".to_string())
    }

    pub(super) fn sign_message(&mut self, message: &str) -> Result<String, String> {
        let signature = self.signer()?.pkp_personal_sign(message)?;
        Ok(format!("0x{}", hex::encode(signature)))
    }

    pub fn wallet(&self) -> &str {
        &self.wallet
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.signer = None;
    }
}

fn is_retryable_lit_init_error(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    if lower.contains("persisted webauthn access token is stale") {
        return false;
    }

    lower.contains("invalid blockhash")
        || lower.contains("insufficient successful encrypted responses")
        || lower.contains("network error")
        || lower.contains("can't decrypt")
        || lower.contains("session expired")
        || lower.contains("timed out")
}
