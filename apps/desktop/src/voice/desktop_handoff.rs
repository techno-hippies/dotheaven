use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

pub fn launch_jacktrip_desktop() -> Result<String, String> {
    let binary = resolve_jacktrip_binary();
    let args_raw = env::var("HEAVEN_JACKTRIP_ARGS").unwrap_or_else(|_| "--gui".to_string());
    let args: Vec<String> = args_raw
        .split_whitespace()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();

    if cfg!(target_os = "linux") && use_pw_jack() {
        let mut cmd = Command::new("pw-jack");
        cmd.arg(&binary)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to launch JackTrip with pw-jack: {e}"))?;
        if let Some(status) = wait_briefly_and_check_exit(&mut child)? {
            return Ok(format!(
                "Launched JackTrip via pw-jack ({binary} {args_raw}); process exited with status {status}"
            ));
        }
        reap_in_background(child);
        Ok(format!("Opened JackTrip via pw-jack ({binary} {args_raw})"))
    } else {
        let mut child = Command::new(&binary)
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to launch JackTrip ({binary}): {e}"))?;
        if let Some(status) = wait_briefly_and_check_exit(&mut child)? {
            return Ok(format!(
                "Launched JackTrip ({binary} {args_raw}); process exited with status {status}"
            ));
        }
        reap_in_background(child);
        Ok(format!("Opened JackTrip ({binary} {args_raw})"))
    }
}

pub fn jacktrip_web_url() -> String {
    env::var("HEAVEN_JACKTRIP_WEB_URL").unwrap_or_else(|_| "https://app.jacktrip.com".to_string())
}

fn use_pw_jack() -> bool {
    env_truthy("HEAVEN_JACKTRIP_USE_PW_JACK").unwrap_or(true) && binary_exists("pw-jack")
}

fn resolve_jacktrip_binary() -> String {
    if let Ok(explicit) = env::var("HEAVEN_JACKTRIP_BIN") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // Prefer a user-local extracted JackTrip bundle when present.
    if let Some(home) = env::var_os("HOME") {
        let bundled = PathBuf::from(home).join("Downloads/jacktrip/jacktrip");
        if bundled.is_file() {
            return bundled.to_string_lossy().to_string();
        }
    }

    "jacktrip".to_string()
}

fn wait_briefly_and_check_exit(child: &mut std::process::Child) -> Result<Option<String>, String> {
    std::thread::sleep(Duration::from_millis(250));
    match child.try_wait() {
        Ok(Some(status)) => Ok(Some(status.to_string())),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to query JackTrip process state: {e}")),
    }
}

fn reap_in_background(mut child: std::process::Child) {
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

fn env_truthy(key: &str) -> Option<bool> {
    let raw = env::var(key).ok()?;
    Some(matches!(
        raw.to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    ))
}

fn binary_exists(name: &str) -> bool {
    find_binary_in_path(name).is_some()
}

fn find_binary_in_path(name: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let path = dir.join(name);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}
