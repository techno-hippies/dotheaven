use std::io::Read;
use std::time::Duration;

use serde_json::{json, Value};

const HTTP_TIMEOUT_SECS: u64 = 20;

pub fn read_json_or_text(resp: &mut ureq::http::Response<ureq::Body>) -> Value {
    let text = resp
        .body_mut()
        .read_to_string()
        .unwrap_or_else(|_| String::new());
    serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "raw": text }))
}

pub fn http_get_json(url: &str) -> Result<Value, String> {
    let request = ureq::get(url)
        .config()
        .timeout_global(Some(Duration::from_secs(HTTP_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .call()
        .map_err(|e| format!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);
    if status >= 400 {
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }
    Ok(body)
}

pub fn http_post_json(url: &str, payload: Value) -> Result<Value, String> {
    let request = ureq::post(url)
        .header("Content-Type", "application/json")
        .config()
        .timeout_global(Some(Duration::from_secs(HTTP_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .send_json(payload)
        .map_err(|e| format!("HTTP POST failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);
    if status >= 400 {
        return Err(format!("HTTP POST {url} failed ({status}): {body}"));
    }
    Ok(body)
}

pub fn http_get_bytes(url: &str) -> Result<Vec<u8>, String> {
    let request = ureq::get(url)
        .config()
        .timeout_global(Some(Duration::from_secs(HTTP_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .call()
        .map_err(|e| format!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    if status >= 400 {
        let body = read_json_or_text(&mut resp);
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }

    let mut bytes = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed reading HTTP body ({url}): {e}"))?;
    Ok(bytes)
}

pub fn http_get_bytes_range(url: &str, start: u64, end_inclusive: u64) -> Result<Vec<u8>, String> {
    if start > end_inclusive {
        return Err(format!("Invalid byte range: {start}..={end_inclusive}"));
    }
    let range = format!("bytes={start}-{end_inclusive}");
    let request = ureq::get(url)
        .header("Range", &range)
        .config()
        .timeout_global(Some(Duration::from_secs(HTTP_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .call()
        .map_err(|e| format!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    if status >= 400 {
        let body = read_json_or_text(&mut resp);
        return Err(format!("HTTP GET {url} failed ({status}): {body}"));
    }
    if status != 200 && status != 206 {
        return Err(format!(
            "Unexpected HTTP status for range GET {url}: {status}"
        ));
    }

    let mut bytes = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Failed reading HTTP body ({url}): {e}"))?;
    Ok(bytes)
}

pub fn rpc_json(rpc_url: &str, payload: Value) -> Result<Value, String> {
    let request = ureq::post(rpc_url)
        .header("content-type", "application/json")
        .config()
        .timeout_global(Some(Duration::from_secs(HTTP_TIMEOUT_SECS)))
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .send_json(payload)
        .map_err(|e| format!("RPC request failed: {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);
    if status >= 400 {
        return Err(format!("RPC HTTP failure ({status}): {body}"));
    }
    if let Some(err) = body.get("error") {
        return Err(format!("RPC error: {err}"));
    }
    body.get("result")
        .cloned()
        .ok_or("RPC response missing result".to_string())
}

pub fn eth_call_address(rpc_url: &str, to: &str, data: &str) -> Result<String, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to,
                "data": data,
            },
            "latest"
        ]
    });

    let result = rpc_json(rpc_url, payload)?;
    let hex = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    let clean = hex.strip_prefix("0x").unwrap_or(hex);
    if clean.len() < 64 {
        return Err(format!("eth_call result too short: {hex}"));
    }
    let word = &clean[clean.len() - 64..];
    Ok(format!("0x{}", &word[24..64]))
}
