//! Browser-based WebAuthn authentication
//!
//! Flow:
//! 1. Start local HTTP server for callback
//! 2. Open browser to auth page with callback URL
//! 3. Auth page handles WebAuthn, POSTs result back
//! 4. Emit event to frontend with auth result

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// Auth page URL
#[cfg(debug_assertions)]
const AUTH_PAGE_URL: &str = "http://localhost:5173/#/auth";
#[cfg(not(debug_assertions))]
const AUTH_PAGE_URL: &str = "https://dotheaven.org/#/auth";

const AUTH_FILE: &str = "heaven-auth.json";

// =============================================================================
// Types
// =============================================================================

/// Auth result from browser callback
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthResult {
    pub pkp_public_key: Option<String>,
    pub pkp_address: Option<String>,
    pub pkp_token_id: Option<String>,
    pub auth_method_type: Option<u32>,
    pub auth_method_id: Option<String>,
    pub access_token: Option<String>,
    pub is_new_user: Option<bool>,
    pub error: Option<String>,
}

/// Persisted auth data
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAuth {
    pub pkp_address: Option<String>,
    pub pkp_public_key: Option<String>,
    pub pkp_token_id: Option<String>,
    pub auth_method_type: Option<u32>,
    pub auth_method_id: Option<String>,
    pub access_token: Option<String>,
}

// =============================================================================
// Browser Auth Flow
// =============================================================================

/// Start browser-based auth flow
pub async fn start_passkey_auth(app: tauri::AppHandle) -> Result<(), String> {
    // Start callback server on random port
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get addr: {}", e))?
        .port();

    log::info!("Auth callback server on port {}", port);

    // Spawn listener task with timeout
    let app_handle = app.clone();
    tokio::spawn(async move {
        // 2 minute timeout for auth flow
        let timeout = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            handle_auth_callback(listener, app_handle.clone()),
        );

        if timeout.await.is_err() {
            log::warn!("Auth callback timed out after 2 minutes");
            let _ = app_handle.emit(
                "auth-error",
                AuthResult {
                    pkp_public_key: None,
                    pkp_address: None,
                    pkp_token_id: None,
                    auth_method_type: None,
                    auth_method_id: None,
                    access_token: None,
                    is_new_user: None,
                    error: Some("Authentication timed out. Please try again.".into()),
                },
            );
        }
    });

    // Build auth URL with callback parameter
    let callback_url = format!("http://127.0.0.1:{}/callback", port);
    let auth_url = format!("{}?callback={}", AUTH_PAGE_URL, urlencoding::encode(&callback_url));

    log::info!("Opening browser to: {}", auth_url);

    // Open browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok(())
}

async fn handle_auth_callback(listener: TcpListener, app: tauri::AppHandle) {
    loop {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buffer = vec![0u8; 16384];

            if let Ok(n) = socket.read(&mut buffer).await {
                let request = String::from_utf8_lossy(&buffer[..n]);
                log::info!(
                    "Received callback: {}",
                    request.lines().next().unwrap_or("")
                );

                // Handle CORS preflight
                if request.starts_with("OPTIONS") {
                    let response = build_cors_preflight();
                    let _ = socket.write_all(response.as_bytes()).await;
                    continue;
                }

                if let Some(result) = parse_callback(&request) {
                    log::info!(
                        "Parsed callback: pkp_address={:?}",
                        result.pkp_address
                    );
                    let response = build_json_response(true);
                    let _ = socket.write_all(response.as_bytes()).await;

                    if result.error.is_some() {
                        log::info!("Emitting auth-error");
                        let _ = app.emit("auth-error", result);
                    } else {
                        log::info!("Emitting auth-complete");
                        let _ = app.emit("auth-complete", result);
                    }
                    break;
                } else {
                    log::error!("Failed to parse callback body");
                    let response = build_json_response(false);
                    let _ = socket.write_all(response.as_bytes()).await;

                    let _ = app.emit(
                        "auth-error",
                        AuthResult {
                            pkp_public_key: None,
                            pkp_address: None,
                            pkp_token_id: None,
                            auth_method_type: None,
                            auth_method_id: None,
                            access_token: None,
                            is_new_user: None,
                            error: Some("Invalid callback".into()),
                        },
                    );
                    break;
                }
            }
        }
    }
}

fn parse_callback(request: &str) -> Option<AuthResult> {
    let first_line = request.lines().next()?;

    // Handle POST requests with JSON body
    if first_line.starts_with("POST /callback") {
        // Find the body (after empty line)
        let body_start = request.find("\r\n\r\n").or_else(|| request.find("\n\n"))?;
        let body = &request[body_start..].trim();
        log::info!("Callback body: {}", body);

        // Parse JSON
        let parsed: AuthResult = serde_json::from_str(body).ok()?;
        return Some(parsed);
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

// =============================================================================
// Persistence
// =============================================================================

pub fn save_to_disk(app_dir: &PathBuf, auth: &PersistedAuth) -> Result<(), String> {
    let path = app_dir.join(AUTH_FILE);
    let json =
        serde_json::to_string_pretty(auth).map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write: {}", e))?;

    log::info!("Saved auth to {:?}", path);
    Ok(())
}

pub fn load_from_disk(app_dir: &PathBuf) -> Option<PersistedAuth> {
    let path = app_dir.join(AUTH_FILE);

    if !path.exists() {
        return None;
    }

    let contents = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&contents).ok()
}

pub fn delete_from_disk(app_dir: &PathBuf) {
    let path = app_dir.join(AUTH_FILE);
    let _ = std::fs::remove_file(&path);
}
