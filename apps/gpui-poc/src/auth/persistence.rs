use super::{short_hex, AuthResult, PersistedAuth, AUTH_FILE};
use lit_rust_sdk::{auth_config_from_delegation_auth_sig, AuthSig as LitAuthSig, LitAbility};
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
    let mut parsed: PersistedAuth = serde_json::from_str(&contents).ok()?;
    if let Some(auth_sig) = parsed.lit_delegation_auth_sig.as_ref() {
        if !delegation_has_lit_action_execution(auth_sig) {
            log::warn!(
                "[Auth] Persisted delegation is missing LitActionExecution ability; clearing cached delegation and forcing refresh on next Lit init"
            );
            parsed.lit_session_key_pair = None;
            parsed.lit_delegation_auth_sig = None;
        }
    }

    log::debug!(
        "[Auth] Loaded auth from disk: pkp_address={:?}, pkp_public_key={}, pkp_token_id={:?}, eoa_address={:?}, auth_method_type={:?}",
        parsed.pkp_address,
        parsed
            .pkp_public_key
            .as_deref()
            .map(short_hex)
            .unwrap_or_else(|| "-".to_string()),
        parsed.pkp_token_id,
        parsed.eoa_address,
        parsed.auth_method_type
    );
    Some(parsed)
}

pub fn delegation_has_lit_action_execution(auth_sig: &LitAuthSig) -> bool {
    let config = match auth_config_from_delegation_auth_sig(auth_sig) {
        Ok(cfg) => cfg,
        Err(err) => {
            log::warn!(
                "[Auth] Failed to parse delegation capabilities from signed SIWE: {}",
                err
            );
            return false;
        }
    };

    config
        .resources
        .iter()
        .any(|req| req.ability == LitAbility::LitActionExecution)
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
        pkp_address: result.pkp_address.clone(),
        pkp_public_key: result.pkp_public_key.clone(),
        pkp_token_id: result.pkp_token_id.clone(),
        auth_method_type: result.auth_method_type,
        auth_method_id: result.auth_method_id.clone(),
        access_token: result.access_token.clone(),
        eoa_address: result.eoa_address.clone(),
        lit_session_key_pair: result.lit_session_key_pair.clone(),
        lit_delegation_auth_sig: result.lit_delegation_auth_sig.clone(),
    }
}
