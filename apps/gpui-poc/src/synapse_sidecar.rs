//! Minimal NDJSON RPC client for the TS storage sidecar.
//!
//! This bridges GPUI Rust -> `apps/gpui-poc/sidecar/synapse-sidecar.ts` so we
//! can keep a stable JS bridge for Load uploads while native Rust equivalents mature.

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use crate::auth::PersistedAuth;

const SIDECAR_STARTUP_ERR: &str = "Failed to start storage sidecar. Ensure bun is installed and sidecar dependencies are available (apps/gpui-poc/sidecar/node_modules).";

#[derive(Default)]
pub struct SynapseSidecarService {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
    next_id: u64,
}

#[derive(Debug, Clone, Default)]
pub struct TrackMetaInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RpcResponse {
    id: Value,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    message: String,
}

impl SynapseSidecarService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn health(&mut self) -> Result<Value, String> {
        self.call("health", None)
    }

    pub fn storage_status(&mut self, auth: &PersistedAuth) -> Result<Value, String> {
        let params = self.auth_params(auth)?;
        self.call("storage.status", Some(params))
    }

    pub fn storage_preflight(
        &mut self,
        auth: &PersistedAuth,
        size_bytes: u64,
    ) -> Result<Value, String> {
        let mut params = self.auth_params(auth)?;
        params["sizeBytes"] = json!(size_bytes);
        self.call("storage.preflight", Some(params))
    }

    pub fn storage_deposit_and_approve(
        &mut self,
        auth: &PersistedAuth,
        amount_usdfc: &str,
    ) -> Result<Value, String> {
        let mut params = self.auth_params(auth)?;
        params["amount"] = json!(amount_usdfc);
        self.call("storage.depositAndApprove", Some(params))
    }

    pub fn content_encrypt_upload_register(
        &mut self,
        auth: &PersistedAuth,
        file_path: &str,
        with_cdn: bool,
        track: TrackMetaInput,
    ) -> Result<Value, String> {
        let mut params = self.auth_params(auth)?;
        params["filePath"] = json!(file_path);
        params["withCDN"] = json!(with_cdn);
        if let Some(title) = track.title {
            params["title"] = json!(title);
        }
        if let Some(artist) = track.artist {
            params["artist"] = json!(artist);
        }
        if let Some(album) = track.album {
            params["album"] = json!(album);
        }
        if let Some(mbid) = track.mbid {
            params["mbid"] = json!(mbid);
        }
        if let Some(ip_id) = track.ip_id {
            params["ipId"] = json!(ip_id);
        }
        self.call("content.encryptUploadRegister", Some(params))
    }

    fn call(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
        self.call_internal(method, params.clone())
            .or_else(|first_err| {
                self.shutdown();
                self.call_internal(method, params)
                    .map_err(|retry_err| format!("{first_err}; retry failed: {retry_err}"))
            })
    }

    fn call_internal(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
        self.ensure_started()?;
        let id = self.next_id.to_string();
        self.next_id = self.next_id.saturating_add(1);

        let request = json!({
            "id": id,
            "method": method,
            "params": params.unwrap_or_else(|| json!({})),
        });
        let line = format!("{}\n", request);

        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| "Sidecar stdin unavailable".to_string())?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|e| format!("Failed to write request to sidecar: {e}"))?;
        stdin
            .flush()
            .map_err(|e| format!("Failed to flush sidecar request: {e}"))?;

        let stdout = self
            .stdout
            .as_mut()
            .ok_or_else(|| "Sidecar stdout unavailable".to_string())?;

        let mut response_line = String::new();
        loop {
            response_line.clear();
            let bytes = stdout
                .read_line(&mut response_line)
                .map_err(|e| format!("Failed to read sidecar response: {e}"))?;
            if bytes == 0 {
                return Err("Storage sidecar exited unexpectedly".to_string());
            }
            if response_line.trim().is_empty() {
                continue;
            }

            let response: RpcResponse = serde_json::from_str(response_line.trim())
                .map_err(|e| format!("Invalid sidecar JSON response: {e}"))?;
            if !response_id_matches(&response.id, &id) {
                continue;
            }
            if let Some(err) = response.error {
                return Err(err.message);
            }
            return Ok(response.result.unwrap_or_else(|| json!({})));
        }
    }

    fn ensure_started(&mut self) -> Result<(), String> {
        if self.child.is_some() {
            return Ok(());
        }

        let sidecar_dir = sidecar_dir_path();
        let script_path = sidecar_dir.join("synapse-sidecar.ts");
        if !script_path.exists() {
            return Err(format!(
                "Storage sidecar script not found at {}",
                script_path.display()
            ));
        }

        let mut cmd = Command::new("bun");
        cmd.arg(script_path.as_os_str())
            .current_dir(&sidecar_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("{SIDECAR_STARTUP_ERR} ({e})"))?;

        let child_stdin = child.stdin.take().ok_or_else(|| {
            self.shutdown();
            "Failed to capture storage sidecar stdin".to_string()
        })?;
        let child_stdout = child.stdout.take().ok_or_else(|| {
            self.shutdown();
            "Failed to capture storage sidecar stdout".to_string()
        })?;

        self.child = Some(child);
        self.stdin = Some(child_stdin);
        self.stdout = Some(BufReader::new(child_stdout));
        Ok(())
    }

    fn auth_params(&self, auth: &PersistedAuth) -> Result<Value, String> {
        let pkp_public_key = auth
            .pkp_public_key
            .clone()
            .ok_or_else(|| "Missing pkpPublicKey in auth state".to_string())?;
        let pkp_address = auth
            .pkp_address
            .clone()
            .ok_or_else(|| "Missing pkpAddress in auth state".to_string())?;
        let auth_method_type = auth
            .auth_method_type
            .ok_or_else(|| "Missing authMethodType in auth state".to_string())?;
        let auth_method_id = auth
            .auth_method_id
            .clone()
            .ok_or_else(|| "Missing authMethodId in auth state".to_string())?;
        let access_token = auth
            .access_token
            .clone()
            .ok_or_else(|| "Missing accessToken in auth state".to_string())?;

        Ok(json!({
            "pkp": {
                "publicKey": pkp_public_key,
                "ethAddress": pkp_address,
                "tokenId": auth.pkp_token_id.clone(),
            },
            "authData": {
                "authMethodType": auth_method_type,
                "authMethodId": auth_method_id,
                "accessToken": access_token,
            },
        }))
    }

    fn shutdown(&mut self) {
        self.stdin = None;
        self.stdout = None;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for SynapseSidecarService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn response_id_matches(raw_id: &Value, expected: &str) -> bool {
    if raw_id == expected {
        return true;
    }
    match raw_id {
        Value::String(s) => s == expected,
        Value::Number(n) => n.to_string() == expected,
        _ => false,
    }
}

fn sidecar_dir_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecar")
}
