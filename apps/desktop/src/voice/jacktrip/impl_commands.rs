use super::*;

impl JackTripController {
    pub(super) fn ensure_binary_exists(name: &str) -> Result<(), String> {
        if binary_exists(name) {
            Ok(())
        } else {
            Err(format!("{name} not found in PATH"))
        }
    }

    pub(super) fn use_pw_jack() -> bool {
        binary_exists("pw-jack")
    }

    pub(super) fn command_for(base: &str) -> Command {
        if Self::use_pw_jack() {
            let mut cmd = Command::new("pw-jack");
            cmd.arg(base);
            cmd
        } else {
            Command::new(base)
        }
    }

    pub(super) fn command_output(
        command: &str,
        args: &[&str],
    ) -> Result<std::process::Output, String> {
        Self::command_for(command)
            .args(args)
            .output()
            .map_err(|e| format!("{command} failed to start: {e}"))
    }

    pub(super) fn format_command_error(command: &str, output: &std::process::Output) -> String {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.trim();
        if message.is_empty() {
            format!("{command} failed with status {}", output.status)
        } else {
            format!("{command} failed: {message}")
        }
    }

    pub(super) fn is_jack_server_running() -> bool {
        match Self::command_for("jack_lsp")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
        {
            Ok(status) => status.success(),
            Err(e) => e.kind() != ErrorKind::NotFound,
        }
    }

    pub(super) fn wait_for_jack_server(attempts: u8, delay: Duration) -> bool {
        for _ in 0..attempts {
            if Self::is_jack_server_running() {
                return true;
            }
            std::thread::sleep(delay);
        }
        false
    }
}
