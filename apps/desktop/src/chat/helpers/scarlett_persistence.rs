use super::*;

const SCARLETT_MESSAGES_PREFIX: &str = "scarlett-messages";
const LEGACY_SCARLETT_MESSAGES_FILE: &str = "scarlett-messages.json";

fn app_data_dir() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("heaven-gpui")
}

fn owner_key(owner_address: Option<&str>) -> Option<String> {
    let owner = owner_address?.trim();
    if owner.is_empty() {
        return None;
    }

    let normalized = owner
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn owner_label(owner_address: Option<&str>) -> String {
    let Some(owner) = owner_address
        .map(str::trim)
        .filter(|owner| !owner.is_empty())
    else {
        return "<none>".to_string();
    };

    if owner.len() <= 14 {
        owner.to_string()
    } else {
        format!("{}...{}", &owner[..8], &owner[owner.len() - 6..])
    }
}

fn scarlett_messages_path(owner_address: Option<&str>) -> Option<std::path::PathBuf> {
    let owner = owner_key(owner_address)?;
    Some(app_data_dir().join(format!("{SCARLETT_MESSAGES_PREFIX}-{owner}.json")))
}

fn remove_legacy_shared_file_best_effort() {
    let legacy_path = app_data_dir().join(LEGACY_SCARLETT_MESSAGES_FILE);
    if !legacy_path.exists() {
        return;
    }

    if let Err(err) = std::fs::remove_file(&legacy_path) {
        log::warn!(
            "[Chat] Failed to remove legacy shared Scarlett history file ({}): {}",
            legacy_path.display(),
            err
        );
    }
}

pub(crate) fn load_scarlett_messages(owner_address: Option<&str>) -> Vec<ChatMessage> {
    remove_legacy_shared_file_best_effort();

    let Some(path) = scarlett_messages_path(owner_address) else {
        log::warn!("[Chat] Scarlett history load skipped (no owner wallet in auth state)");
        return Vec::new();
    };

    let Ok(text) = std::fs::read_to_string(&path) else {
        log::info!(
            "[Chat] Scarlett history file not found for owner={} path={}",
            owner_label(owner_address),
            path.display()
        );
        return Vec::new();
    };

    let mut messages = match serde_json::from_str::<Vec<ChatMessage>>(&text) {
        Ok(messages) => messages,
        Err(err) => {
            log::warn!(
                "[Chat] Failed to parse Scarlett messages at {}: {}",
                path.display(),
                err
            );
            return Vec::new();
        }
    };

    messages.sort_by_key(|m| m.sent_at_ns);
    log::info!(
        "[Chat] Loaded Scarlett history for owner={} path={} messages={}",
        owner_label(owner_address),
        path.display(),
        messages.len()
    );
    messages
}

pub(crate) fn persist_scarlett_messages(
    owner_address: Option<&str>,
    messages: &[ChatMessage],
) -> Result<(), String> {
    remove_legacy_shared_file_best_effort();

    let Some(path) = scarlett_messages_path(owner_address) else {
        // No authenticated wallet context: avoid shared persistence.
        log::warn!(
            "[Chat] Scarlett history persist skipped (no owner wallet in auth state) messages={}",
            messages.len()
        );
        return Ok(());
    };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "failed creating Scarlett history dir ({}): {e}",
                parent.display()
            )
        })?;
    }

    let json = serde_json::to_string_pretty(messages)
        .map_err(|e| format!("failed encoding Scarlett history: {e}"))?;

    std::fs::write(&path, json)
        .map_err(|e| format!("failed writing Scarlett history ({}): {e}", path.display()))?;

    log::info!(
        "[Chat] Persisted Scarlett history for owner={} path={} messages={}",
        owner_label(owner_address),
        path.display(),
        messages.len()
    );
    Ok(())
}
