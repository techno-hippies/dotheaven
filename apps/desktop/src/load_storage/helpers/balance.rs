use super::*;

pub(crate) fn extract_turbo_deposit_address(payload: &Value, token: &str) -> Option<String> {
    let token = token.to_ascii_lowercase();
    let mut candidates = Vec::<(Option<String>, String)>::new();
    collect_wallet_candidates(payload, &mut candidates);
    if candidates.is_empty() {
        return None;
    }

    for (candidate_token, candidate_address) in &candidates {
        if let Some(t) = candidate_token {
            if t == &token {
                return Some(candidate_address.clone());
            }
        }
    }

    for (candidate_token, candidate_address) in &candidates {
        if let Some(t) = candidate_token {
            if token_match_loose(t, &token) {
                return Some(candidate_address.clone());
            }
        }
    }

    if candidates.len() == 1 {
        return Some(candidates[0].1.clone());
    }

    None
}

pub(crate) fn collect_wallet_candidates(value: &Value, out: &mut Vec<(Option<String>, String)>) {
    match value {
        Value::Object(map) => {
            let token_key = map
                .get("token")
                .or_else(|| map.get("symbol"))
                .or_else(|| map.get("ticker"))
                .or_else(|| map.get("network"))
                .or_else(|| map.get("chain"))
                .and_then(Value::as_str)
                .map(|s| s.trim().to_ascii_lowercase())
                .filter(|s| !s.is_empty());

            let maybe_address = map
                .get("address")
                .or_else(|| map.get("walletAddress"))
                .or_else(|| map.get("depositAddress"))
                .or_else(|| map.get("wallet"))
                .or_else(|| map.get("to"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);

            if let Some(addr) = maybe_address {
                if addr.parse::<Address>().is_ok() {
                    out.push((token_key.clone(), addr));
                }
            }

            for nested in map.values() {
                collect_wallet_candidates(nested, out);
            }
        }
        Value::Array(arr) => {
            for item in arr {
                collect_wallet_candidates(item, out);
            }
        }
        _ => {}
    }
}

pub(crate) fn token_match_loose(candidate: &str, wanted: &str) -> bool {
    if candidate == wanted {
        return true;
    }
    let normalize = |v: &str| {
        v.to_ascii_lowercase()
            .replace('_', "-")
            .replace("ethereum", "eth")
    };
    let c = normalize(candidate);
    let w = normalize(wanted);
    c == w || c.contains(&w) || w.contains(&c)
}

pub(crate) fn extract_balance_hint(value: &Value) -> Option<f64> {
    let mut out = Vec::<f64>::new();
    collect_balance_candidates(value, &mut out);
    out.into_iter()
        .filter(|v| v.is_finite() && *v >= 0.0)
        .fold(None, |acc, v| Some(acc.map(|x| x.max(v)).unwrap_or(v)))
}

pub(crate) fn collect_balance_candidates(value: &Value, out: &mut Vec<f64>) {
    match value {
        Value::Number(n) => {
            if let Some(v) = n.as_f64() {
                out.push(v);
            }
        }
        Value::String(s) => {
            if let Ok(v) = s.trim().parse::<f64>() {
                out.push(v);
            }
        }
        Value::Object(map) => {
            for (k, v) in map {
                let key = k.to_ascii_lowercase();
                if key.contains("balance")
                    || key.contains("credit")
                    || key.contains("winc")
                    || key.contains("amount")
                {
                    collect_balance_candidates(v, out);
                    continue;
                }
                collect_balance_candidates(v, out);
            }
        }
        Value::Array(arr) => {
            for item in arr {
                collect_balance_candidates(item, out);
            }
        }
        _ => {}
    }
}

pub(crate) fn check_health() -> LoadHealthResult {
    let endpoint = format!("{}/health", load_turbo_upload_url());
    let request = ureq::get(&endpoint)
        .config()
        .timeout_global(Some(Duration::from_secs(12)))
        .http_status_as_error(false)
        .build();

    match request.call() {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = (200..300).contains(&status);
            let info = if ok {
                fetch_info().ok().flatten()
            } else {
                None
            };
            LoadHealthResult {
                ok,
                endpoint,
                status: Some(status),
                reason: if ok {
                    None
                } else {
                    Some(format!("Health check failed: HTTP {status}"))
                },
                info,
            }
        }
        Err(err) => LoadHealthResult {
            ok: false,
            endpoint,
            status: None,
            reason: Some(err.to_string()),
            info: None,
        },
    }
}

pub(crate) fn fetch_info() -> Result<Option<Value>, String> {
    let endpoint = format!("{}/info", load_turbo_upload_url());
    let request = ureq::get(&endpoint)
        .config()
        .timeout_global(Some(Duration::from_secs(12)))
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .call()
        .map_err(|e| format!("Load info request failed: {e}"))?;
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        return Ok(None);
    }

    let body = read_json_or_text(&mut resp);
    if body.is_object() {
        Ok(Some(body))
    } else {
        Ok(None)
    }
}
