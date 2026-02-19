use super::{short_hex, AuthResult, PersistedAuth, AUTH_FILE};
use std::path::PathBuf;

fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
}

pub fn save_to_disk(auth: &PersistedAuth) -> Result<(), String> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let path = dir.join(AUTH_FILE);
    let json =
        serde_json::to_string_pretty(auth).map_err(|e| format!("Failed to serialize: {e}"))?;

    std::fs::write(&path, json).map_err(|e| format!("Failed to write: {e}"))?;

    log::info!("Saved auth to {:?}", path);
    super::log_persisted_auth("Saved auth", auth);
    Ok(())
}

pub fn load_from_disk() -> Option<PersistedAuth> {
    let path = app_data_dir().join(AUTH_FILE);
    if !path.exists() {
        return None;
    }

    let contents = std::fs::read_to_string(&path).ok()?;
    let parsed: PersistedAuth = serde_json::from_str(&contents).ok()?;

    log::debug!(
        "[Auth] Loaded auth from disk: version={:?}, provider={:?}, wallet={:?}, tempo_credential_id={:?}, tempo_public_key={}",
        parsed.version,
        parsed.provider,
        parsed.wallet_address(),
        parsed.tempo_credential_id,
        parsed
            .tempo_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
    );
    Some(parsed)
}

pub fn delete_from_disk() {
    let path = app_data_dir().join(AUTH_FILE);
    match std::fs::remove_file(&path) {
        Ok(_) => log::info!("[Auth] Removed persisted auth file: {:?}", path),
        Err(e) => log::warn!("[Auth] Failed to remove auth file {:?}: {}", path, e),
    }
}

/// Convert AuthResult → PersistedAuth (strips transient fields)
pub fn to_persisted(result: &AuthResult) -> PersistedAuth {
    PersistedAuth {
        version: result.version,
        provider: result.provider.clone(),
        wallet_address: result.wallet_address.clone(),
        tempo_credential_id: result.tempo_credential_id.clone(),
        tempo_public_key: result.tempo_public_key.clone(),
        tempo_rp_id: result.tempo_rp_id.clone(),
        tempo_key_manager_url: result.tempo_key_manager_url.clone(),
        tempo_fee_payer_url: result.tempo_fee_payer_url.clone(),
        tempo_chain_id: result.tempo_chain_id,
        tempo_session_private_key: result.tempo_session_private_key.clone(),
        tempo_session_address: result.tempo_session_address.clone(),
        tempo_session_expires_at: result.tempo_session_expires_at,
        tempo_session_key_authorization: result.tempo_session_key_authorization.clone(),
        access_token: result.access_token.clone(),
    }
}
