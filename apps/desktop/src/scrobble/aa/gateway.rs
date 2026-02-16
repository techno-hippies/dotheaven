use super::*;

pub(super) fn gateway_post_json<TReq: Serialize, TResp: for<'de> Deserialize<'de>>(
    gateway_url: &str,
    path: &str,
    api_key: &str,
    request: &TReq,
) -> Result<TResp, String> {
    let url = format!("{}{}", gateway_url.trim_end_matches('/'), path);
    let payload = serde_json::to_value(request).map_err(|e| e.to_string())?;

    for attempt in 0..=GATEWAY_RETRY_COUNT {
        let mut req = ureq::post(&url)
            .config()
            .http_status_as_error(false)
            .build()
            .header("content-type", "application/json");
        if !api_key.trim().is_empty() {
            req = req.header("authorization", &format!("Bearer {api_key}"));
        }

        match req.send_json(payload.clone()) {
            Ok(mut resp) => {
                let status = resp.status().as_u16();
                let body = resp.body_mut().read_to_string().unwrap_or_default();

                if (200..300).contains(&status) {
                    return serde_json::from_str::<TResp>(&body).map_err(|e| {
                        format!("gateway {} parse failed: {} body={}", path, e, body)
                    });
                }

                if should_retry_gateway_status(status) && attempt < GATEWAY_RETRY_COUNT {
                    let retry_idx = attempt + 1;
                    let delay_ms = GATEWAY_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] gateway {} transient http {} (retry {}/{} in {}ms): {}",
                        path,
                        status,
                        retry_idx,
                        GATEWAY_RETRY_COUNT,
                        delay_ms,
                        truncate_for_log(&body, 400)
                    );
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    continue;
                }

                return Err(format!(
                    "gateway {} request failed: http status: {} body: {}",
                    path,
                    status,
                    truncate_for_log(&body, 800)
                ));
            }
            Err(err) => {
                if should_retry_gateway_transport_error(&err) && attempt < GATEWAY_RETRY_COUNT {
                    let retry_idx = attempt + 1;
                    let delay_ms = GATEWAY_RETRY_BASE_DELAY_MS * retry_idx as u64;
                    log::warn!(
                        "[Scrobble] gateway {} transport error (retry {}/{} in {}ms): {}",
                        path,
                        retry_idx,
                        GATEWAY_RETRY_COUNT,
                        delay_ms,
                        err
                    );
                    std::thread::sleep(Duration::from_millis(delay_ms));
                    continue;
                }
                return Err(format!("gateway {} request failed: {}", path, err));
            }
        }
    }

    Err(format!(
        "gateway {} request failed: retry loop exhausted",
        path
    ))
}

fn should_retry_gateway_status(status: u16) -> bool {
    matches!(status, 429 | 502 | 503 | 504)
}

fn should_retry_gateway_transport_error(err: &ureq::Error) -> bool {
    use ureq::Error;
    matches!(
        err,
        Error::Timeout(_)
            | Error::Io(_)
            | Error::ConnectionFailed
            | Error::HostNotFound
            | Error::Protocol(_)
            | Error::Tls(_)
    )
}

fn truncate_for_log(input: &str, max_chars: usize) -> String {
    if input.len() <= max_chars {
        return input.to_string();
    }
    format!("{}…", &input[..max_chars])
}
