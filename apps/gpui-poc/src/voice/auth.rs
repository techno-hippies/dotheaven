use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::auth::{self, PersistedAuth};
use crate::lit_wallet::LitWalletService;

#[derive(Clone)]
struct CachedToken {
    token: String,
    expires_at: Instant,
}

pub struct WorkerAuthContext {
    persisted: PersistedAuth,
    signer: Option<LitWalletService>,
    wallet: String,
    cache: HashMap<String, CachedToken>,
}

#[derive(Serialize)]
struct NonceRequest<'a> {
    wallet: &'a str,
}

#[derive(Deserialize)]
struct NonceResponse {
    nonce: String,
}

#[derive(Serialize)]
struct VerifyRequest<'a> {
    wallet: &'a str,
    signature: &'a str,
    nonce: &'a str,
}

#[derive(Deserialize)]
struct VerifyResponse {
    token: String,
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: Option<String>,
}

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
            lit.initialize_from_auth(&self.persisted)?;
            self.signer = Some(lit);
        }
        self.signer
            .as_mut()
            .ok_or_else(|| "Lit signer unavailable".to_string())
    }

    fn sign_message(&mut self, message: &str) -> Result<String, String> {
        let signature = self.signer()?.pkp_personal_sign(message)?;
        Ok(format!("0x{}", hex::encode(signature)))
    }

    pub fn bearer_token(&mut self, worker_url: &str) -> Result<String, String> {
        let key = format!("{}|{}", worker_url, self.wallet);
        if let Some(cached) = self.cache.get(&key) {
            if cached.expires_at > Instant::now() + Duration::from_secs(60) {
                return Ok(cached.token.clone());
            }
        }

        let nonce_url = format!("{}/auth/nonce", worker_url.trim_end_matches('/'));
        let mut nonce_resp = ureq::post(&nonce_url)
            .config()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(20)))
            .build()
            .header("content-type", "application/json")
            .send_json(serde_json::json!(NonceRequest {
                wallet: &self.wallet,
            }))
            .map_err(|e| format!("worker nonce request failed: {e}"))?;
        let nonce_status = nonce_resp.status().as_u16();
        if !(200..300).contains(&nonce_status) {
            let err_body = nonce_resp.body_mut().read_to_string().unwrap_or_default();
            let err = parse_error_message(&err_body);
            return Err(format!("worker nonce failed (HTTP {nonce_status}): {err}"));
        }
        let nonce: NonceResponse = nonce_resp
            .body_mut()
            .read_json()
            .map_err(|e| format!("invalid nonce response: {e}"))?;

        let signature = self.sign_message(&nonce.nonce)?;

        let verify_url = format!("{}/auth/verify", worker_url.trim_end_matches('/'));
        let mut verify_resp = ureq::post(&verify_url)
            .config()
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(20)))
            .build()
            .header("content-type", "application/json")
            .send_json(serde_json::json!(VerifyRequest {
                wallet: &self.wallet,
                signature: &signature,
                nonce: &nonce.nonce,
            }))
            .map_err(|e| format!("worker verify request failed: {e}"))?;
        let verify_status = verify_resp.status().as_u16();
        if !(200..300).contains(&verify_status) {
            let err_body = verify_resp.body_mut().read_to_string().unwrap_or_default();
            let err = parse_error_message(&err_body);
            return Err(format!(
                "worker verify failed (HTTP {verify_status}): {err}"
            ));
        }
        let verified: VerifyResponse = verify_resp
            .body_mut()
            .read_json()
            .map_err(|e| format!("invalid verify response: {e}"))?;

        self.cache.insert(
            key,
            CachedToken {
                token: verified.token.clone(),
                expires_at: Instant::now() + Duration::from_secs(55 * 60),
            },
        );

        Ok(verified.token)
    }

    pub fn clear(&mut self) {
        self.cache.clear();
        self.signer = None;
    }
}

fn parse_error_message(body: &str) -> String {
    serde_json::from_str::<ErrorResponse>(&body)
        .ok()
        .and_then(|e| e.error)
        .filter(|e| !e.trim().is_empty())
        .unwrap_or_else(|| body.to_string())
}
