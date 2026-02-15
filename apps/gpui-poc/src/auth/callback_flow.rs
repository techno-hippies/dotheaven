use super::{log_auth_result, AuthResult, AUTH_PAGE_URL};
use futures_lite::io::{AsyncReadExt, AsyncWriteExt};
use smol::net::TcpListener;
use std::time::Duration;

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
    let auth_url = format!(
        "{}?callback={}",
        AUTH_PAGE_URL,
        urlencoding::encode(&callback_url)
    );

    log::info!("Opening browser to: {}", auth_url);
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {e}"))?;

    smol::future::race(handle_auth_callback(listener), async {
        smol::Timer::after(Duration::from_secs(120)).await;
        Err("Authentication timed out after 2 minutes".to_string())
    })
    .await
}

async fn handle_auth_callback(listener: TcpListener) -> Result<AuthResult, String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Accept failed: {e}"))?;

        let mut buffer = vec![0u8; 16384];
        let n = stream
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Read failed: {e}"))?;

        let request = String::from_utf8_lossy(&buffer[..n]);
        log::info!(
            "Received callback: {}",
            request.lines().next().unwrap_or("")
        );

        if request.starts_with("OPTIONS") {
            let response = build_cors_preflight();
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        if !request.starts_with("POST") {
            let response =
                "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        if let Some(result) = parse_callback(&request) {
            log_auth_result("Parsed callback", &result);
            let response = build_json_response(true);
            let _ = stream.write_all(response.as_bytes()).await;

            if let Some(err) = result.error.clone() {
                return Err(err);
            }

            return Ok(result);
        }

        log::error!("Failed to parse callback body");
        let response = build_json_response(false);
        let _ = stream.write_all(response.as_bytes()).await;
        return Err("Invalid callback".to_string());
    }
}

fn parse_callback(request: &str) -> Option<AuthResult> {
    let first_line = request.lines().next()?;

    if first_line.starts_with("POST /callback") {
        if let Some(body_start) = request.find("\r\n\r\n") {
            let body = request[body_start + 4..].trim();
            log::info!("Callback body (CRLF): {}", body);
            return serde_json::from_str(body).ok();
        }

        if let Some(body_start) = request.find("\n\n") {
            let body = request[body_start + 2..].trim();
            log::info!("Callback body (LF): {}", body);
            return serde_json::from_str(body).ok();
        }
    }

    None
}

fn build_cors_preflight() -> String {
    "HTTP/1.1 204 No Content\r\n\
     Access-Control-Allow-Origin: *\r\n\
     Access-Control-Allow-Methods: POST, OPTIONS\r\n\
     Access-Control-Allow-Headers: Content-Type\r\n\
     Access-Control-Max-Age: 86400\r\n\
     Connection: close\r\n\r\n"
        .to_string()
}

fn build_json_response(success: bool) -> String {
    let body = if success {
        r#"{"ok":true}"#
    } else {
        r#"{"ok":false}"#
    };

    format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: application/json\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         Content-Length: {}\r\n\r\n{}",
        body.len(),
        body
    )
}
