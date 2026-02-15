use std::process::Command;

pub(super) struct DefaultSourceGuard {
    previous_source: Option<String>,
}

impl DefaultSourceGuard {
    pub(super) fn set(source_name: &str) -> Result<Self, String> {
        let previous_source = pactl_output(["get-default-source"])?;
        pactl_status(["set-default-source", source_name])?;
        log::info!(
            "[duet-bridge] set default source to {} (previous: {})",
            source_name,
            previous_source.trim()
        );
        Ok(Self {
            previous_source: Some(previous_source.trim().to_string()),
        })
    }
}

impl Drop for DefaultSourceGuard {
    fn drop(&mut self) {
        let Some(previous) = self.previous_source.take() else {
            return;
        };
        if previous.is_empty() {
            return;
        }
        if let Err(err) = pactl_status(["set-default-source", previous.as_str()]) {
            log::warn!("[duet-bridge] failed to restore default source: {err}");
        } else {
            log::info!("[duet-bridge] restored default source to {}", previous);
        }
    }
}

fn pactl_output<const N: usize>(args: [&str; N]) -> Result<String, String> {
    let output = Command::new("pactl")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run pactl {}: {e}", args.join(" ")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pactl {} failed: {}",
            args.join(" "),
            stderr.trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn pactl_status<const N: usize>(args: [&str; N]) -> Result<(), String> {
    let output = Command::new("pactl")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run pactl {}: {e}", args.join(" ")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pactl {} failed: {}",
            args.join(" "),
            stderr.trim()
        ));
    }
    Ok(())
}
