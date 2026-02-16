use super::*;
use crate::shared::config::bool_env;

pub fn duet_worker_base_url() -> String {
    shared_duet_worker_base_url()
}

pub fn native_bridge_supported() -> bool {
    native_bridge_disabled_reason().is_none()
}

pub fn native_bridge_disabled_reason() -> Option<String> {
    let opted_in = bool_env("HEAVEN_ENABLE_DUET_NATIVE_BRIDGE")
        || bool_env("HEAVEN_ENABLE_SCARLETT_DESKTOP_AGORA");
    if cfg!(target_os = "linux") && !opted_in {
        return Some(
            "Native bridge is disabled by default on Linux. Use browser bridge, or set HEAVEN_ENABLE_DUET_NATIVE_BRIDGE=1 to opt in."
                .to_string(),
        );
    }

    None
}

pub fn duet_bridge_pulse_source() -> Option<String> {
    env::var("HEAVEN_DUET_PULSE_SOURCE")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn duet_bridge_refresh_seconds() -> Option<u64> {
    env::var("HEAVEN_DUET_BRIDGE_REFRESH_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(|v| v.max(DEFAULT_REFRESH_FLOOR_SECONDS))
}

pub fn launch_native_bridge_process(config: NativeBridgeLaunchConfig<'_>) -> Result<Child, String> {
    if let Some(reason) = native_bridge_disabled_reason() {
        return Err(reason);
    }

    let exe_path = env::current_exe().map_err(|e| format!("resolve current exe failed: {e}"))?;

    let mut cmd = Command::new(&exe_path);
    cmd.arg("duet-bridge")
        .arg("--room")
        .arg(config.room_id)
        .arg("--bridge-ticket")
        .arg(config.bridge_ticket)
        .arg("--worker-url")
        .arg(config.worker_url)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    if let Some(app_id) = config.agora_app_id {
        if !app_id.trim().is_empty() {
            cmd.arg("--agora-app-id").arg(app_id);
        }
    }

    if config.china_cn_only {
        cmd.arg("--china-cn-only");
    }

    if let Some(refresh_seconds) = config.refresh_seconds {
        cmd.arg("--refresh-seconds")
            .arg(refresh_seconds.to_string());
    }

    if let Some(source) = config.pulse_source {
        if !source.trim().is_empty() {
            cmd.arg("--pulse-source").arg(source);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn native bridge process: {e}"))?;

    // Catch fast-fail cases (missing native feature/SDK) and surface a clear UI error.
    thread::sleep(Duration::from_millis(400));
    match child.try_wait() {
        Ok(Some(status)) => Err(format!(
            "native bridge exited immediately ({status}). Ensure app is built with --features agora-native and AGORA_SDK_ROOT is configured."
        )),
        Ok(None) => Ok(child),
        Err(e) => Err(format!("failed checking native bridge process health: {e}")),
    }
}
