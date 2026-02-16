use super::super::*;

impl XmtpService {
    pub fn disconnect(&mut self) {
        self.client = None;
        self.my_inbox_id = None;
        self.my_address = None;
        if let Ok(mut last_sync_at) = self.last_dm_sync_at.lock() {
            *last_sync_at = None;
        }
        log::info!("[XMTP] Disconnected");
    }

    /// Clear local XMTP DB state for a wallet address (db + wal/shm/journal side files).
    ///
    /// This is a last-resort recovery path when local DM state gets stuck in an
    /// unrecoverable inactive/validation loop.
    pub fn reset_local_state_for_address(&mut self, address: &str) -> Result<String, String> {
        let address_lower = address.to_lowercase();
        self.disconnect();

        let base = app_data_dir().join(format!("xmtp-{}.db", address_lower));
        let sidecar = |suffix: &str| {
            std::path::PathBuf::from(format!("{}{}", base.to_string_lossy(), suffix))
        };
        let candidates = vec![
            base.clone(),
            sidecar("-wal"),
            sidecar("-shm"),
            sidecar("-journal"),
        ];

        let mut removed = Vec::new();
        for path in candidates {
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("remove {}: {e}", path.display()))?;
                removed.push(path.display().to_string());
            }
        }

        if removed.is_empty() {
            Ok(format!(
                "No local XMTP files found to reset for {}",
                address_lower
            ))
        } else {
            Ok(format!(
                "Removed {} local XMTP file(s) for {}",
                removed.len(),
                address_lower
            ))
        }
    }
}
