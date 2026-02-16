#![allow(dead_code)]

use std::env;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

mod impl_commands;
mod path_helpers;
use path_helpers::{binary_exists, jacktrip_bind_port};

#[derive(Clone, Debug)]
pub struct JackTripConfig {
    pub server: String,
    pub port: u16,
}

impl Default for JackTripConfig {
    fn default() -> Self {
        Self {
            server: env::var("HEAVEN_JACKTRIP_SERVER").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("HEAVEN_JACKTRIP_PORT")
                .ok()
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(4464),
        }
    }
}

pub struct JackTripController {
    jackd: Option<Child>,
    jacktrip: Option<Child>,
    local_server: Option<Child>,
}

impl Default for JackTripController {
    fn default() -> Self {
        Self::new()
    }
}

impl JackTripController {
    pub fn new() -> Self {
        Self {
            jackd: None,
            jacktrip: None,
            local_server: None,
        }
    }

    pub fn check_dependencies() -> Result<(), String> {
        let required = ["jacktrip", "jack_lsp", "jack_connect", "jack_disconnect"];
        let mut missing = Vec::new();
        for bin in required {
            if !binary_exists(bin) {
                missing.push(bin);
            }
        }
        if missing.is_empty() {
            Ok(())
        } else {
            Err(format!("Missing required tools: {}", missing.join(", ")))
        }
    }

    pub fn connect_default(&mut self) -> Result<String, String> {
        let cfg = JackTripConfig::default();
        self.connect(&cfg.server, cfg.port)
    }

    pub fn connect(&mut self, server: &str, port: u16) -> Result<String, String> {
        Self::check_dependencies()?;
        self.ensure_jackd_running()?;

        self.disconnect()?;
        let bind_port = jacktrip_bind_port(port);

        let mut child = Self::command_for("jacktrip")
            .args([
                "-c",
                server,
                "-P",
                &port.to_string(),
                "-B",
                &bind_port.to_string(),
                "--bufstrategy",
                "3",
                "-q",
                "4",
            ])
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start JackTrip: {e}"))?;

        std::thread::sleep(Duration::from_millis(250));
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "JackTrip client exited early with status {status}. If using local test mode, set HEAVEN_JACKTRIP_BIND_PORT to a free UDP port (peer={port}, bind={bind_port})."
            ));
        }

        self.jacktrip = Some(child);
        Ok(format!(
            "Connecting to {server}:{port} (local bind UDP {bind_port})"
        ))
    }

    pub fn start_local_server(&mut self, port: u16) -> Result<String, String> {
        Self::ensure_binary_exists("jacktrip")?;

        if self.is_local_server_running() {
            return Ok(format!(
                "Local JackTrip server already running on port {port}"
            ));
        }

        let child = Self::command_for("jacktrip")
            .args(["-s", "-P", &port.to_string(), "-q", "8"])
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start local JackTrip server: {e}"))?;

        self.local_server = Some(child);
        Ok(format!("Started local JackTrip server on 127.0.0.1:{port}"))
    }

    pub fn stop_local_server(&mut self) -> Result<String, String> {
        if let Some(mut child) = self.local_server.take() {
            child
                .kill()
                .map_err(|e| format!("Failed to stop local JackTrip server: {e}"))?;
            let _ = child.try_wait();
            Ok("Stopped local JackTrip server".to_string())
        } else {
            Ok("Local JackTrip server not running".to_string())
        }
    }

    pub fn disconnect(&mut self) -> Result<String, String> {
        if let Some(mut child) = self.jacktrip.take() {
            child
                .kill()
                .map_err(|e| format!("Failed to kill JackTrip: {e}"))?;
            let _ = child.try_wait();
            Ok("Disconnected".to_string())
        } else {
            Ok("Not connected".to_string())
        }
    }

    pub fn is_connected(&mut self) -> bool {
        if let Some(ref mut child) = self.jacktrip {
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    self.jacktrip = None;
                    false
                }
                Err(_) => false,
            }
        } else {
            false
        }
    }

    pub fn is_local_server_running(&mut self) -> bool {
        if let Some(ref mut child) = self.local_server {
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    self.local_server = None;
                    false
                }
                Err(_) => false,
            }
        } else {
            false
        }
    }

    pub fn list_ports(&self) -> Result<Vec<String>, String> {
        Self::ensure_binary_exists("jack_lsp")?;
        let output = Self::command_output("jack_lsp", &[])?;
        if !output.status.success() {
            return Err(Self::format_command_error("jack_lsp", &output));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect())
    }

    pub fn connect_port(&self, source: &str, dest: &str) -> Result<String, String> {
        Self::ensure_binary_exists("jack_connect")?;
        let output = Self::command_output("jack_connect", &[source, dest])?;
        if !output.status.success() {
            return Err(Self::format_command_error("jack_connect", &output));
        }
        Ok(format!("Connected {source} -> {dest}"))
    }

    pub fn disconnect_port(&self, source: &str, dest: &str) -> Result<String, String> {
        Self::ensure_binary_exists("jack_disconnect")?;
        let output = Self::command_output("jack_disconnect", &[source, dest])?;
        if !output.status.success() {
            return Err(Self::format_command_error("jack_disconnect", &output));
        }
        Ok(format!("Disconnected {source} -> {dest}"))
    }

    fn ensure_jackd_running(&mut self) -> Result<(), String> {
        Self::ensure_binary_exists("jack_lsp")?;

        if let Some(ref mut child) = self.jackd {
            match child.try_wait() {
                Ok(None) => return Ok(()),
                Ok(Some(_)) => {
                    self.jackd = None;
                }
                Err(_) => {}
            }
        }

        if Self::is_jack_server_running() {
            log::info!("[JackTrip] Using existing JACK server");
            return Ok(());
        }

        if Self::use_pw_jack() {
            log::info!("[JackTrip] pw-jack detected; using PipeWire-JACK");
            return Ok(());
        }

        if env::var("LD_LIBRARY_PATH")
            .unwrap_or_default()
            .contains("pipewire")
        {
            log::info!("[JackTrip] PipeWire-JACK detected via LD_LIBRARY_PATH");
            return Ok(());
        }

        Self::ensure_binary_exists("jackd")?;

        let device = env::var("HEAVEN_JACKD_DEVICE").unwrap_or_else(|_| "hw:1".to_string());
        let mut child = Command::new("jackd")
            .args([
                "-d",
                "alsa",
                "-d",
                device.as_str(),
                "-r",
                "48000",
                "-p",
                "256",
            ])
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start JACK: {e}"))?;

        std::thread::sleep(Duration::from_millis(300));

        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("JACK exited early: {status}"));
        }

        if !Self::wait_for_jack_server(5, Duration::from_millis(200)) {
            let _ = child.kill();
            return Err("JACK did not start (is the ALSA device busy?)".to_string());
        }

        self.jackd = Some(child);
        Ok(())
    }
}

impl Drop for JackTripController {
    fn drop(&mut self) {
        if let Some(mut child) = self.jacktrip.take() {
            let _ = child.kill();
            let _ = child.try_wait();
        }
        if let Some(mut child) = self.local_server.take() {
            let _ = child.kill();
            let _ = child.try_wait();
        }
        if let Some(mut child) = self.jackd.take() {
            let _ = child.kill();
            let _ = child.try_wait();
        }
    }
}
