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
            .wallet_address()
            .ok_or_else(|| "Persisted auth is missing wallet address".to_string())?
            .to_lowercase();
        Ok(Self {
            wallet,
            cache: HashMap::new(),
        })
    }

    pub(super) fn sign_message(&mut self, message: &str) -> Result<String, String> {
        let _ = message;
        Err(
            "Scarlett voice authentication is not yet available — Tempo signing replacement is pending."
                .to_string(),
        )
    }

    pub fn wallet(&self) -> &str {
        &self.wallet
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }
}
