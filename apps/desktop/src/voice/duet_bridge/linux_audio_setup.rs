use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct LinuxDuetAudioSetupResult {
    pub backend: String,
    pub sink_name: String,
    pub sink_description: String,
    pub source_name: String,
    pub browser_pick_label: String,
    pub created_sink: bool,
    pub moved_inputs_count: u32,
    pub moved_input_ids: Vec<u32>,
    pub set_default_source_requested: bool,
    pub set_default_source: bool,
    pub default_source_before: Option<String>,
    pub default_source_after: Option<String>,
    pub default_source_changed: bool,
    pub default_source_is_duet: bool,
    pub recommended_restore_source: Option<String>,
    pub recommended_restore_label: Option<String>,
}

pub fn setup_linux_duet_audio_source() -> Result<LinuxDuetAudioSetupResult, String> {
    if !cfg!(target_os = "linux") {
        return Err("JackTrip source setup is Linux-only.".to_string());
    }

    let script_path = format!(
        "{}/scripts/setup-duet-audio-source-linux.sh",
        env!("CARGO_MANIFEST_DIR")
    );
    if !std::path::Path::new(&script_path).exists() {
        return Err(format!("setup script not found: {script_path}"));
    }

    let output = Command::new("bash")
        .arg(script_path)
        .output()
        .map_err(|e| format!("failed running duet audio setup script: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let parsed = parse_key_values(&stdout);

    let status = parsed.get("status").map(|v| v.as_str()).unwrap_or_default();
    if !output.status.success() || status != "ok" {
        let msg = parsed
            .get("error_message")
            .cloned()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                if stderr.trim().is_empty() {
                    None
                } else {
                    Some(stderr.trim().to_string())
                }
            })
            .or_else(|| {
                if stdout.trim().is_empty() {
                    None
                } else {
                    Some(stdout.trim().to_string())
                }
            })
            .unwrap_or_else(|| "unknown duet audio setup error".to_string());
        return Err(msg);
    }

    let sink_name = required_field(&parsed, "sink_name")?;
    let sink_description = parsed
        .get("sink_description")
        .cloned()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| sink_name.clone());
    let source_name = required_field(&parsed, "source_name")?;
    let source_description = parsed
        .get("source_description")
        .cloned()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| source_name.clone());
    let browser_pick_label = parsed
        .get("browser_pick_label")
        .cloned()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| source_description.clone());
    let backend = parsed
        .get("backend")
        .cloned()
        .unwrap_or_else(|| "unknown".to_string());
    let created_sink = parsed
        .get("created_sink")
        .map(|v| parse_bool(v))
        .unwrap_or(false);
    let moved_inputs_count = parsed
        .get("moved_inputs_count")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);
    let moved_input_ids = parsed
        .get("moved_input_ids")
        .map(|v| parse_u32_list(v))
        .unwrap_or_default();
    let set_default_source_requested = parsed
        .get("set_default_source_requested")
        .map(|v| parse_bool(v))
        .unwrap_or(false);
    let set_default_source = parsed
        .get("set_default_source")
        .map(|v| parse_bool(v))
        .unwrap_or(false);
    let default_source_before = parsed
        .get("default_source_before")
        .cloned()
        .filter(|v| !v.trim().is_empty());
    let default_source_after = parsed
        .get("default_source_after")
        .cloned()
        .filter(|v| !v.trim().is_empty());
    let default_source_changed = parsed
        .get("default_source_changed")
        .map(|v| parse_bool(v))
        .unwrap_or_else(|| {
            default_source_before
                .as_deref()
                .zip(default_source_after.as_deref())
                .map(|(before, after)| before != after)
                .unwrap_or(false)
        });
    let default_source_is_duet = parsed
        .get("default_source_is_duet")
        .map(|v| parse_bool(v))
        .unwrap_or_else(|| {
            default_source_after
                .as_deref()
                .map(is_duet_like_source_name)
                .unwrap_or(false)
        });
    let recommended_restore_source = parsed
        .get("recommended_restore_source")
        .cloned()
        .filter(|v| !v.trim().is_empty());
    let recommended_restore_label = parsed
        .get("recommended_restore_label")
        .cloned()
        .filter(|v| !v.trim().is_empty());

    Ok(LinuxDuetAudioSetupResult {
        backend,
        sink_name,
        sink_description,
        source_name,
        browser_pick_label,
        created_sink,
        moved_inputs_count,
        moved_input_ids,
        set_default_source_requested,
        set_default_source,
        default_source_before,
        default_source_after,
        default_source_changed,
        default_source_is_duet,
        recommended_restore_source,
        recommended_restore_label,
    })
}

pub fn current_linux_default_source() -> Result<Option<String>, String> {
    if !cfg!(target_os = "linux") {
        return Ok(None);
    }
    let output = Command::new("pactl")
        .arg("get-default-source")
        .output()
        .map_err(|e| format!("failed running pactl get-default-source: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pactl get-default-source failed: {}",
            stderr.trim()
        ));
    }
    let source = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if source.is_empty() {
        Ok(None)
    } else {
        Ok(Some(source))
    }
}

pub fn restore_linux_default_input_source(
    preferred_source: Option<&str>,
) -> Result<String, String> {
    if !cfg!(target_os = "linux") {
        return Err("restore is Linux-only".to_string());
    }

    let sources = list_linux_sources()?;
    let current_default = current_linux_default_source()?;

    let mut target = preferred_source
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .filter(|v| !is_duet_like_source_name(v));

    if target.is_none() {
        target = sources
            .iter()
            .find(|source| !is_duet_like_source_name(source))
            .cloned();
    }

    let Some(target_source) = target else {
        return Err("no non-duet input source found to restore".to_string());
    };

    if current_default.as_deref() == Some(target_source.as_str()) {
        return Ok(target_source);
    }

    let output = Command::new("pactl")
        .args(["set-default-source", target_source.as_str()])
        .output()
        .map_err(|e| format!("failed running pactl set-default-source: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pactl set-default-source failed: {}",
            stderr.trim()
        ));
    }

    Ok(target_source)
}

fn required_field(values: &HashMap<String, String>, key: &str) -> Result<String, String> {
    values
        .get(key)
        .cloned()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| format!("setup script did not return {key}"))
}

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes"
    )
}

fn is_duet_like_source_name(value: &str) -> bool {
    let source = value.trim().to_ascii_lowercase();
    source.contains("jacktrip_duet")
        || source == "jacktrip_duet_input"
        || source == "jacktrip_duet.monitor"
        || source.ends_with(".monitor")
}

fn list_linux_sources() -> Result<Vec<String>, String> {
    let output = Command::new("pactl")
        .args(["list", "short", "sources"])
        .output()
        .map_err(|e| format!("failed running pactl list short sources: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "pactl list short sources failed: {}",
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut out = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.split_whitespace();
        let _id = parts.next();
        let Some(name) = parts.next() else {
            continue;
        };
        out.push(name.to_string());
    }
    Ok(out)
}

fn parse_key_values(raw: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for line in raw.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Some((key, value)) = line.split_once('=') {
            out.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    out
}

fn parse_u32_list(raw: &str) -> Vec<u32> {
    raw.split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .filter_map(|v| v.parse::<u32>().ok())
        .collect()
}
