use std::env;
use std::io::ErrorKind;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;
use which::which;

pub struct JacktripState {
    jackd: Mutex<Option<Child>>,
    jacktrip: Mutex<Option<Child>>,
}

impl Default for JacktripState {
    fn default() -> Self {
        Self {
            jackd: Mutex::new(None),
            jacktrip: Mutex::new(None),
        }
    }
}

fn env_default(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn ensure_binary_exists(name: &str) -> Result<(), String> {
    which(name)
        .map(|_| ())
        .map_err(|_| format!("{name} not found in PATH"))
}

#[tauri::command]
pub fn check_jacktrip_dependencies() -> Result<(), String> {
    let required = ["jacktrip", "jack_lsp", "jack_connect", "jack_disconnect"];
    let mut missing = Vec::new();
    for bin in required {
        if which(bin).is_err() {
            missing.push(bin);
        }
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!("Missing required tools: {}", missing.join(", ")))
    }
}

fn command_output(command: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new(command)
        .args(args)
        .output()
        .map_err(|e| format!("{command} failed to start: {e}"))
}

fn format_command_error(command: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let message = stderr.trim();
    if message.is_empty() {
        format!("{command} failed with status {}", output.status)
    } else {
        format!("{command} failed: {message}")
    }
}

fn is_jack_server_running() -> bool {
    match Command::new("jack_lsp")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
    {
        Ok(status) => status.success(),
        Err(e) => e.kind() != ErrorKind::NotFound,
    }
}

fn wait_for_jack_server(attempts: u8, delay: Duration) -> bool {
    for _ in 0..attempts {
        if is_jack_server_running() {
            return true;
        }
        std::thread::sleep(delay);
    }
    false
}

#[tauri::command]
pub fn list_jack_ports() -> Result<Vec<String>, String> {
    ensure_binary_exists("jack_lsp")?;
    let output = command_output("jack_lsp", &[])?;
    if !output.status.success() {
        return Err(format_command_error("jack_lsp", &output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let ports = stdout
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect();

    Ok(ports)
}

#[tauri::command]
pub fn connect_jack_port(source: &str, dest: &str) -> Result<String, String> {
    ensure_binary_exists("jack_connect")?;
    let output = command_output("jack_connect", &[source, dest])?;
    if !output.status.success() {
        return Err(format_command_error("jack_connect", &output));
    }

    Ok(format!("Connected {source} -> {dest}"))
}

#[tauri::command]
pub fn disconnect_jack_port(source: &str, dest: &str) -> Result<String, String> {
    ensure_binary_exists("jack_disconnect")?;
    let output = command_output("jack_disconnect", &[source, dest])?;
    if !output.status.success() {
        return Err(format_command_error("jack_disconnect", &output));
    }

    Ok(format!("Disconnected {source} -> {dest}"))
}

fn ensure_jackd_running(state: &State<JacktripState>) -> Result<(), String> {
    ensure_binary_exists("jack_lsp")?;

    let mut jackd = state.jackd.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *jackd {
        match child.try_wait() {
            Ok(None) => return Ok(()),
            Ok(Some(_)) => {
                *jackd = None;
            }
            Err(_) => {}
        }
    }

    if is_jack_server_running() {
        println!("[JackTrip] Using existing JACK server (likely PipeWire-JACK)");
        return Ok(());
    }

    if env::var("LD_LIBRARY_PATH")
        .unwrap_or_default()
        .contains("pipewire")
    {
        println!("[JackTrip] PipeWire-JACK detected via LD_LIBRARY_PATH");
        println!("[JackTrip] Will use PipeWire's JACK server when JackTrip connects");
        return Ok(());
    }

    ensure_binary_exists("jackd")?;

    let device = env_default("HEAVEN_JACKD_DEVICE", "hw:1");
    let mut child = Command::new("jackd")
        .args(["-d", "alsa", "-d", device.as_str(), "-r", "48000", "-p", "256"])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start JACK: {e}"))?;

    std::thread::sleep(Duration::from_millis(300));

    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!("JACK exited early: {status}"));
    }

    if !wait_for_jack_server(5, Duration::from_millis(200)) {
        let _ = child.kill();
        return Err("JACK did not start (is the ALSA device busy?)".to_string());
    }

    *jackd = Some(child);
    Ok(())
}

#[tauri::command]
pub fn connect_jacktrip(
    server: &str,
    port: u16,
    state: State<JacktripState>,
) -> Result<String, String> {
    check_jacktrip_dependencies()?;
    ensure_jackd_running(&state)?;

    let mut jacktrip = state.jacktrip.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = jacktrip.take() {
        let _ = child.kill();
        let _ = child.try_wait();
    }

    let child = Command::new("jacktrip")
        .args([
            "-C",
            server,
            "-P",
            &port.to_string(),
            "--bufstrategy",
            "3",
            "-q",
            "auto",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to start JackTrip: {e}"))?;

    *jacktrip = Some(child);

    Ok(format!("Connecting to {server}:{port}"))
}

#[tauri::command]
pub fn disconnect_jacktrip(state: State<JacktripState>) -> Result<String, String> {
    let mut jacktrip = state.jacktrip.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = jacktrip.take() {
        child
            .kill()
            .map_err(|e| format!("Failed to kill JackTrip: {e}"))?;
        let _ = child.try_wait();
        Ok("Disconnected".to_string())
    } else {
        Ok("Not connected".to_string())
    }
}

#[tauri::command]
pub fn is_jacktrip_connected(state: State<JacktripState>) -> bool {
    if let Ok(mut jacktrip) = state.jacktrip.lock() {
        if let Some(ref mut child) = *jacktrip {
            match child.try_wait() {
                Ok(None) => return true,
                Ok(Some(_)) => {
                    *jacktrip = None;
                }
                Err(_) => {}
            }
        }
    }
    false
}
