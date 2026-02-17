use super::{log_auth_result, AuthResult, AUTH_PAGE_URL};
use futures_lite::io::{AsyncReadExt, AsyncWriteExt};
use rand::RngCore;
use smol::net::TcpListener;
use std::env;
use std::time::Duration;

const CALLBACK_MAX_REQUEST_BYTES: usize = 256 * 1024;
const CALLBACK_READ_CHUNK_BYTES: usize = 4096;
const ALLOWED_CALLBACK_ORIGINS: &[&str] = &["http://localhost:5173", "https://dotheaven.org"];
const DEFAULT_TEMPO_KEY_MANAGER_URL: &str = "https://keys.tempo.xyz";
const DEFAULT_TEMPO_FEE_PAYER_URL: &str = "https://sponsor.moderato.tempo.xyz";
const DEFAULT_TEMPO_CHAIN_ID: u64 = 42431;

/// Run the browser callback auth flow.
/// Binds a local TCP server, opens browser, waits for POST callback.
/// Returns the parsed AuthResult on success.
pub async fn run_auth_callback_server() -> Result<AuthResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind: {e}"))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get addr: {e}"))?
        .port();

    log::info!("Auth callback server on port {}", port);

    let callback_url = format!("http://127.0.0.1:{port}/callback");
    let callback_state = generate_callback_state();
    let tempo_key_manager_url = resolve_tempo_key_manager_url();
    let tempo_fee_payer_url = resolve_tempo_fee_payer_url();
    let tempo_chain_id = resolve_tempo_chain_id();

    let mut query = vec![
        format!("callback={}", urlencoding::encode(&callback_url)),
        format!("state={}", urlencoding::encode(&callback_state)),
        "callbackVersion=2".to_string(),
        format!(
            "tempoKeyManagerUrl={}",
            urlencoding::encode(&tempo_key_manager_url)
        ),
        format!(
            "tempoFeePayerUrl={}",
            urlencoding::encode(&tempo_fee_payer_url)
        ),
        format!("tempoChainId={tempo_chain_id}"),
    ];
    if let Some(tempo_rp_id) = resolve_tempo_rp_id() {
        query.push(format!("tempoRpId={}", urlencoding::encode(&tempo_rp_id)));
    }
    let auth_url = format!("{AUTH_PAGE_URL}?{}", query.join("&"));

    log::info!("Opening browser to: {}", auth_url);
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    smol::future::race(handle_auth_callback(listener, callback_state), async {
        smol::Timer::after(Duration::from_secs(120)).await;
        Err("Authentication timed out after 2 minutes".to_string())
    })
    .await
}

async fn handle_auth_callback(
    listener: TcpListener,
    expected_state: String,
) -> Result<AuthResult, String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Accept failed: {e}"))?;

        let request_bytes = match read_http_request(&mut stream).await {
            Ok(bytes) => bytes,
            Err(err) => {
                log::error!("Failed to read callback request: {err}");
                let response = build_json_response(false, None);
                let _ = stream.write_all(response.as_bytes()).await;
                return Err("Invalid callback request".to_string());
            }
        };

        let request = match parse_http_request(&request_bytes) {
            Ok(parsed) => parsed,
            Err(err) => {
                log::error!("Failed to parse callback request: {err}");
                let response = build_json_response(false, None);
                let _ = stream.write_all(response.as_bytes()).await;
                return Err("Invalid callback request".to_string());
            }
        };

        log::info!("Received callback: {} {}", request.method, request.path);

        let allow_origin = resolve_allow_origin(request.origin.as_deref());

        if request.method.eq_ignore_ascii_case("OPTIONS") {
            let response = build_cors_preflight(allow_origin);
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        if !request.method.eq_ignore_ascii_case("POST") || !request.path.starts_with("/callback") {
            let response =
                "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        if request.origin.is_some() && allow_origin.is_none() {
            log::warn!("[Auth] Rejected callback from disallowed origin");
            let response = build_json_response(false, None);
            let _ = stream.write_all(response.as_bytes()).await;
            return Err("Callback origin not allowed".to_string());
        }

        if let Some(result) = parse_callback(&request.body) {
            if !validate_callback_state(&result, &expected_state) {
                log::warn!("[Auth] Rejected callback due to state mismatch");
                let response = build_json_response(false, allow_origin);
                let _ = stream.write_all(response.as_bytes()).await;
                return Err("Invalid callback state".to_string());
            }
            log_auth_result("Parsed callback", &result);
            let response = build_json_response(true, allow_origin);
            let _ = stream.write_all(response.as_bytes()).await;

            if let Some(err) = result.error.clone() {
                return Err(err);
            }

            return Ok(result);
        }

        log::error!("Failed to parse callback body");
        let response = build_json_response(false, allow_origin);
        let _ = stream.write_all(response.as_bytes()).await;
        return Err("Invalid callback".to_string());
    }
}

fn parse_callback(body: &[u8]) -> Option<AuthResult> {
    let body = String::from_utf8_lossy(body);
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

fn build_cors_preflight(allow_origin: Option<&str>) -> String {
    let mut response = String::from("HTTP/1.1 204 No Content\r\n");
    if let Some(origin) = allow_origin {
        response.push_str(&format!("Access-Control-Allow-Origin: {origin}\r\n"));
        response.push_str("Vary: Origin\r\n");
    }
    response.push_str(
        "Access-Control-Allow-Methods: POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: Content-Type\r\n\
     Access-Control-Max-Age: 86400\r\n\
     Connection: close\r\n\r\n",
    );
    response
}

fn build_json_response(success: bool, allow_origin: Option<&str>) -> String {
    let body = if success {
        r#"{"ok":true}"#
    } else {
        r#"{"ok":false}"#
    };

    let mut response = String::from("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n");
    if let Some(origin) = allow_origin {
        response.push_str(&format!("Access-Control-Allow-Origin: {origin}\r\n"));
        response.push_str("Vary: Origin\r\n");
    }
    response.push_str(&format!(
        "Connection: close\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    ));
    response
}

fn validate_callback_state(result: &AuthResult, expected_state: &str) -> bool {
    let requires_state = result.version.unwrap_or_default() >= 2;
    match result.callback_state.as_deref() {
        Some(received) => received == expected_state,
        None => {
            if requires_state {
                return false;
            }
            log::warn!("[Auth] Callback state missing; accepting legacy payload");
            true
        }
    }
}

fn generate_callback_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn resolve_allow_origin(origin: Option<&str>) -> Option<&'static str> {
    let origin = origin?;
    ALLOWED_CALLBACK_ORIGINS
        .iter()
        .find(|allowed| origin.eq_ignore_ascii_case(allowed))
        .copied()
}

fn find_header_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    if let Some(pos) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
        return Some((pos, 4));
    }
    if let Some(pos) = buffer.windows(2).position(|w| w == b"\n\n") {
        return Some((pos, 2));
    }
    None
}

fn parse_content_length(headers: &str) -> usize {
    headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.trim().eq_ignore_ascii_case("content-length") {
                return value.trim().parse::<usize>().ok();
            }
            None
        })
        .unwrap_or(0)
}

async fn read_http_request(stream: &mut smol::net::TcpStream) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::with_capacity(CALLBACK_READ_CHUNK_BYTES * 2);
    let mut chunk = vec![0u8; CALLBACK_READ_CHUNK_BYTES];
    let mut expected_total_len: Option<usize> = None;

    loop {
        let n = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("Read failed: {e}"))?;
        if n == 0 {
            break;
        }

        buffer.extend_from_slice(&chunk[..n]);
        if buffer.len() > CALLBACK_MAX_REQUEST_BYTES {
            return Err(format!(
                "Request exceeded {} bytes",
                CALLBACK_MAX_REQUEST_BYTES
            ));
        }

        if let Some((headers_end, delimiter_len)) = find_header_boundary(&buffer) {
            if expected_total_len.is_none() {
                let headers = String::from_utf8_lossy(&buffer[..headers_end]);
                let content_length = parse_content_length(&headers);
                expected_total_len = Some(headers_end + delimiter_len + content_length);
            }

            if let Some(total) = expected_total_len {
                if buffer.len() >= total {
                    buffer.truncate(total);
                    break;
                }
            }
        }
    }

    if buffer.is_empty() {
        return Err("Request was empty".to_string());
    }

    Ok(buffer)
}

struct ParsedHttpRequest {
    method: String,
    path: String,
    origin: Option<String>,
    body: Vec<u8>,
}

fn parse_http_request(raw: &[u8]) -> Result<ParsedHttpRequest, String> {
    let (headers_end, delimiter_len) = find_header_boundary(raw)
        .ok_or_else(|| "Missing request headers terminator".to_string())?;
    let headers = String::from_utf8_lossy(&raw[..headers_end]);
    let mut lines = headers.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Missing request line".to_string())?;

    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "Missing HTTP method".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "Missing request path".to_string())?
        .to_string();

    let origin = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("origin") {
            return Some(value.trim().to_string());
        }
        None
    });

    Ok(ParsedHttpRequest {
        method,
        path,
        origin,
        body: raw[headers_end + delimiter_len..].to_vec(),
    })
}

fn non_empty_env_var(keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        env::var(key).ok().and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }
            Some(trimmed.to_string())
        })
    })
}

fn resolve_tempo_key_manager_url() -> String {
    non_empty_env_var(&["HEAVEN_TEMPO_KEY_MANAGER_URL", "TEMPO_KEY_MANAGER_URL"])
        .unwrap_or_else(|| DEFAULT_TEMPO_KEY_MANAGER_URL.to_string())
}

fn resolve_tempo_fee_payer_url() -> String {
    non_empty_env_var(&["HEAVEN_TEMPO_FEE_PAYER_URL", "TEMPO_FEE_PAYER_URL"])
        .unwrap_or_else(|| DEFAULT_TEMPO_FEE_PAYER_URL.to_string())
}

fn resolve_tempo_chain_id() -> u64 {
    non_empty_env_var(&["HEAVEN_TEMPO_CHAIN_ID", "TEMPO_CHAIN_ID"])
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(DEFAULT_TEMPO_CHAIN_ID)
}

fn resolve_tempo_rp_id() -> Option<String> {
    non_empty_env_var(&["HEAVEN_TEMPO_RP_ID", "TEMPO_RP_ID"])
}
