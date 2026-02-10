//! Browser-based WebAuthn authentication for GPUI
//!
//! Flow:
//! 1. Start local HTTP server for callback on random port
//! 2. Open system browser to auth page with callback URL
//! 3. Auth page handles WebAuthn, POSTs result back
//! 4. Parse result, update global AuthState, persist to disk
//!
//! Ported from apps/frontend/src-tauri/src/auth.rs (tokio → smol)

use futures_lite::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Deserialize, Serialize};
use smol::net::TcpListener;
use std::path::PathBuf;
use std::time::Duration;

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
    #[serde(default)]
    pub eoa_address: Option<String>,
}

/// Persisted auth data (stored on disk)
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAuth {
    pub pkp_address: Option<String>,
    pub pkp_public_key: Option<String>,
    pub pkp_token_id: Option<String>,
    pub auth_method_type: Option<u32>,
    pub auth_method_id: Option<String>,
    pub access_token: Option<String>,
    #[serde(default)]
    pub eoa_address: Option<String>,
}

/// Global auth state observable by UI
#[derive(Clone, Default)]
pub struct AuthState {
    /// True while browser auth flow is in progress
    pub authing: bool,
    /// Set after successful auth (or loaded from disk)
    pub persisted: Option<PersistedAuth>,
}

impl gpui::Global for AuthState {}

impl AuthState {
    pub fn is_authenticated(&self) -> bool {
        self.persisted.is_some()
    }

    pub fn display_address(&self) -> Option<&str> {
        self.persisted.as_ref()?.pkp_address.as_deref()
    }
}

// =============================================================================
// Browser Auth Flow
// =============================================================================

/// Run the browser callback auth flow.
/// Binds a local TCP server, opens browser, waits for POST callback.
/// Returns the parsed AuthResult on success.
pub async fn run_auth_callback_server() -> Result<AuthResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind: {}", e))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get addr: {}", e))?
        .port();

    log::info!("Auth callback server on port {}", port);

    // Build auth URL with callback parameter
    let callback_url = format!("http://127.0.0.1:{}/callback", port);
    let auth_url = format!(
        "{}?callback={}",
        AUTH_PAGE_URL,
        urlencoding::encode(&callback_url)
    );

    log::info!("Opening browser to: {}", auth_url);
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback with 2 minute timeout
    let result = smol::future::race(
        handle_auth_callback(listener),
        async {
            smol::Timer::after(Duration::from_secs(120)).await;
            Err("Authentication timed out after 2 minutes".to_string())
        },
    )
    .await;

    result
}

async fn handle_auth_callback(listener: TcpListener) -> Result<AuthResult, String> {
    loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Accept failed: {}", e))?;

        let mut buffer = vec![0u8; 16384];
        let n = stream
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Read failed: {}", e))?;

        let request = String::from_utf8_lossy(&buffer[..n]);
        log::info!(
            "Received callback: {}",
            request.lines().next().unwrap_or("")
        );

        // Handle CORS preflight
        if request.starts_with("OPTIONS") {
            let response = build_cors_preflight();
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        // Ignore non-POST requests (favicon, etc.)
        if !request.starts_with("POST") {
            let response =
                "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            continue;
        }

        if let Some(result) = parse_callback(&request) {
            log::info!("Parsed callback: pkp_address={:?}", result.pkp_address);
            let response = build_json_response(true);
            let _ = stream.write_all(response.as_bytes()).await;

            if result.error.is_some() {
                return Err(result.error.clone().unwrap());
            }

            return Ok(result);
        } else {
            log::error!("Failed to parse callback body");
            let response = build_json_response(false);
            let _ = stream.write_all(response.as_bytes()).await;
            return Err("Invalid callback".to_string());
        }
    }
}

fn parse_callback(request: &str) -> Option<AuthResult> {
    let first_line = request.lines().next()?;

    if first_line.starts_with("POST /callback") {
        // Find the body (after empty line)
        if let Some(body_start) = request.find("\r\n\r\n") {
            let body = request[body_start + 4..].trim();
            log::info!("Callback body (CRLF): {}", body);
            return serde_json::from_str(body).ok();
        } else if let Some(body_start) = request.find("\n\n") {
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

// =============================================================================
// Persistence
// =============================================================================

fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
}

pub fn save_to_disk(auth: &PersistedAuth) -> Result<(), String> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let path = dir.join(AUTH_FILE);
    let json =
        serde_json::to_string_pretty(auth).map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write: {}", e))?;

    log::info!("Saved auth to {:?}", path);
    Ok(())
}

pub fn load_from_disk() -> Option<PersistedAuth> {
    let path = app_data_dir().join(AUTH_FILE);
    if !path.exists() {
        return None;
    }
    let contents = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&contents).ok()
}

pub fn delete_from_disk() {
    let path = app_data_dir().join(AUTH_FILE);
    let _ = std::fs::remove_file(&path);
}

/// Convert AuthResult → PersistedAuth (strips transient fields)
pub fn to_persisted(result: &AuthResult) -> PersistedAuth {
    PersistedAuth {
        pkp_address: result.pkp_address.clone(),
        pkp_public_key: result.pkp_public_key.clone(),
        pkp_token_id: result.pkp_token_id.clone(),
        auth_method_type: result.auth_method_type,
        auth_method_id: result.auth_method_id.clone(),
        access_token: result.access_token.clone(),
        eoa_address: result.eoa_address.clone(),
    }
}
