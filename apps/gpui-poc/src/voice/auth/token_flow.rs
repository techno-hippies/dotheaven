use super::*;

impl WorkerAuthContext {
    pub fn bearer_token(&mut self, worker_url: &str) -> Result<String, String> {
        let key = format!("{}|{}", worker_url, self.wallet);
        if let Some(cached) = self.cache.get(&key) {
            if cached.expires_at > Instant::now() + Duration::from_secs(60) {
                return Ok(cached.token.clone());
            }
        }

        let nonce_url = format!("{}/auth/nonce", worker_url.trim_end_matches('/'));
        let nonce: NonceResponse = {
            let mut parsed: Option<NonceResponse> = None;
            for attempt in 0..=WORKER_AUTH_RETRY_COUNT {
                let response = ureq::post(&nonce_url)
                    .config()
                    .http_status_as_error(false)
                    .timeout_global(Some(Duration::from_secs(20)))
                    .build()
                    .header("content-type", "application/json")
                    .send_json(serde_json::json!(NonceRequest {
                        wallet: &self.wallet,
                    }));

                match response {
                    Ok(mut nonce_resp) => {
                        let nonce_status = nonce_resp.status().as_u16();
                        if (200..300).contains(&nonce_status) {
                            parsed = Some(
                                nonce_resp
                                    .body_mut()
                                    .read_json()
                                    .map_err(|e| format!("invalid nonce response: {e}"))?,
                            );
                            break;
                        }

                        let err_body = nonce_resp.body_mut().read_to_string().unwrap_or_default();
                        let err = parse_error_message(&err_body);
                        let msg = format!(
                            "worker nonce failed (HTTP {nonce_status}) at {nonce_url}: {err}"
                        );
                        if attempt < WORKER_AUTH_RETRY_COUNT
                            && is_retryable_worker_http_status(nonce_status)
                        {
                            let retry_idx = attempt + 1;
                            let delay_ms = WORKER_AUTH_RETRY_BASE_DELAY_MS * retry_idx as u64;
                            log::warn!(
                                "[Auth] nonce request transient failure (retry {}/{} in {}ms): {}",
                                retry_idx,
                                WORKER_AUTH_RETRY_COUNT,
                                delay_ms,
                                msg
                            );
                            std::thread::sleep(Duration::from_millis(delay_ms));
                            continue;
                        }
                        return Err(msg);
                    }
                    Err(e) => {
                        let msg = format!("worker nonce request failed at {nonce_url}: {e}");
                        if attempt < WORKER_AUTH_RETRY_COUNT && is_retryable_transport_error(&msg) {
                            let retry_idx = attempt + 1;
                            let delay_ms = WORKER_AUTH_RETRY_BASE_DELAY_MS * retry_idx as u64;
                            log::warn!(
                                "[Auth] nonce transport failure (retry {}/{} in {}ms): {}",
                                retry_idx,
                                WORKER_AUTH_RETRY_COUNT,
                                delay_ms,
                                msg
                            );
                            std::thread::sleep(Duration::from_millis(delay_ms));
                            continue;
                        }
                        return Err(msg);
                    }
                }
            }
            parsed.ok_or_else(|| {
                format!("worker nonce request failed: exhausted retries for {nonce_url}")
            })?
        };

        let signature = self.sign_message(&nonce.nonce)?;

        let verify_url = format!("{}/auth/verify", worker_url.trim_end_matches('/'));
        let verified: VerifyResponse = {
            let mut parsed: Option<VerifyResponse> = None;
            for attempt in 0..=WORKER_AUTH_RETRY_COUNT {
                let response = ureq::post(&verify_url)
                    .config()
                    .http_status_as_error(false)
                    .timeout_global(Some(Duration::from_secs(20)))
                    .build()
                    .header("content-type", "application/json")
                    .send_json(serde_json::json!(VerifyRequest {
                        wallet: &self.wallet,
                        signature: &signature,
                        nonce: &nonce.nonce,
                    }));

                match response {
                    Ok(mut verify_resp) => {
                        let verify_status = verify_resp.status().as_u16();
                        if (200..300).contains(&verify_status) {
                            parsed = Some(
                                verify_resp
                                    .body_mut()
                                    .read_json()
                                    .map_err(|e| format!("invalid verify response: {e}"))?,
                            );
                            break;
                        }
                        let err_body = verify_resp.body_mut().read_to_string().unwrap_or_default();
                        let err = parse_error_message(&err_body);
                        let msg = format!(
                            "worker verify failed (HTTP {verify_status}) at {verify_url}: {err}"
                        );
                        if attempt < WORKER_AUTH_RETRY_COUNT
                            && is_retryable_worker_http_status(verify_status)
                        {
                            let retry_idx = attempt + 1;
                            let delay_ms = WORKER_AUTH_RETRY_BASE_DELAY_MS * retry_idx as u64;
                            log::warn!(
                                "[Auth] verify request transient failure (retry {}/{} in {}ms): {}",
                                retry_idx,
                                WORKER_AUTH_RETRY_COUNT,
                                delay_ms,
                                msg
                            );
                            std::thread::sleep(Duration::from_millis(delay_ms));
                            continue;
                        }
                        return Err(msg);
                    }
                    Err(e) => {
                        let msg = format!("worker verify request failed at {verify_url}: {e}");
                        if attempt < WORKER_AUTH_RETRY_COUNT && is_retryable_transport_error(&msg) {
                            let retry_idx = attempt + 1;
                            let delay_ms = WORKER_AUTH_RETRY_BASE_DELAY_MS * retry_idx as u64;
                            log::warn!(
                                "[Auth] verify transport failure (retry {}/{} in {}ms): {}",
                                retry_idx,
                                WORKER_AUTH_RETRY_COUNT,
                                delay_ms,
                                msg
                            );
                            std::thread::sleep(Duration::from_millis(delay_ms));
                            continue;
                        }
                        return Err(msg);
                    }
                }
            }
            parsed.ok_or_else(|| {
                format!("worker verify request failed: exhausted retries for {verify_url}")
            })?
        };

        self.cache.insert(
            key,
            CachedToken {
                token: verified.token.clone(),
                expires_at: Instant::now() + Duration::from_secs(55 * 60),
            },
        );

        Ok(verified.token)
    }
}

fn parse_error_message(body: &str) -> String {
    serde_json::from_str::<ErrorResponse>(&body)
        .ok()
        .and_then(|e| e.error)
        .filter(|e| !e.trim().is_empty())
        .unwrap_or_else(|| body.to_string())
}

fn is_retryable_transport_error(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("failed to look up address information")
        || lower.contains("service not known")
        || lower.contains("dns")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("temporary failure")
        || lower.contains("connection reset")
        || lower.contains("connection refused")
        || lower.contains("network error")
}

fn is_retryable_worker_http_status(status: u16) -> bool {
    status == 408 || status == 425 || status == 429 || (500..=599).contains(&status)
}
