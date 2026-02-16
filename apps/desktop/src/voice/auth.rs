use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::auth::{self, PersistedAuth};
use crate::lit_wallet::LitWalletService;

mod impl_context;
mod token_flow;

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

const LIT_INIT_RETRY_COUNT: usize = 2;
const LIT_INIT_RETRY_BASE_DELAY_MS: u64 = 600;
const WORKER_AUTH_RETRY_COUNT: usize = 2;
const WORKER_AUTH_RETRY_BASE_DELAY_MS: u64 = 350;
