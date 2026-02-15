use super::super::*;

impl XmtpService {
    pub(super) fn recover_installation_limit<F>(
        &self,
        db_path: &str,
        inbox_id: &str,
        count: usize,
        max: usize,
        sign_fn: &mut F,
    ) -> Result<(), String>
    where
        F: FnMut(&[u8]) -> Result<Vec<u8>, String>,
    {
        let max_before_new_install = max.saturating_sub(1);
        let revoke_needed = count.saturating_sub(max_before_new_install);
        if revoke_needed == 0 {
            return Ok(());
        }

        log::info!(
            "[XMTP] Revoking {revoke_needed} installation(s) for inbox {inbox_id} \
to get below the {max} installation cap..."
        );

        // Phase 1: build revocation signature request in async context.
        let (mut signature_request, revoked_count) = self.runtime.block_on(async {
            let storage = StorageOption::Persistent(db_path.to_string());
            let db = NativeDb::new_unencrypted(&storage).map_err(|e| format!("db: {e}"))?;
            let store = EncryptedMessageStore::new(db).map_err(|e| format!("store: {e}"))?;
            let cursor_store = SqliteCursorStore::new(store.db());

            let mut backend = MessageBackendBuilder::default();
            backend
                .v3_host(xmtp_host())
                .is_secure(true)
                .app_version("heaven-gpui/0.1.0".to_string())
                .cursor_store(cursor_store);

            let api_client = backend.build().map_err(|e| format!("api: {e}"))?;
            let verifier = ApiClientWrapper::new(api_client, Retry::default());
            let conn = store.db();

            load_identity_updates(&verifier, &conn, &[inbox_id])
                .await
                .map_err(|e| format!("load_identity_updates: {e}"))?;

            let state = get_association_state_with_verifier(&conn, inbox_id, None, &verifier)
                .await
                .map_err(|e| format!("get_association_state: {e}"))?;

            // Revoke the oldest installations first and only as many as required.
            let mut seen = HashSet::new();
            let mut installation_ids_to_revoke = Vec::new();
            for installation in state.installations() {
                if seen.insert(installation.id.clone()) {
                    installation_ids_to_revoke.push(installation.id);
                }
                if installation_ids_to_revoke.len() >= revoke_needed {
                    break;
                }
            }

            if installation_ids_to_revoke.len() < revoke_needed {
                return Err(format!(
                    "Not enough revocable installations: needed {revoke_needed}, found {}",
                    installation_ids_to_revoke.len()
                ));
            }

            let signature_request = revoke_installations_with_verifier(
                state.recovery_identifier(),
                inbox_id,
                installation_ids_to_revoke.clone(),
            )
            .map_err(|e| format!("revoke_installations request: {e}"))?;

            Ok::<_, String>((signature_request, installation_ids_to_revoke.len()))
        })?;

        // Phase 2: sign outside tokio runtime threads to avoid nested-runtime panics.
        let sig_text = signature_request.signature_text().to_string();
        let sig_bytes = sign_fn(sig_text.as_bytes())?;
        if sig_bytes.len() != 65 {
            return Err(format!(
                "Signer returned invalid revocation signature length: expected 65, got {}",
                sig_bytes.len()
            ));
        }

        // Phase 3: apply signed revocation in async context.
        let unverified = UnverifiedSignature::new_recoverable_ecdsa(sig_bytes);
        self.runtime.block_on(async {
            let mut backend = MessageBackendBuilder::default();
            backend
                .v3_host(xmtp_host())
                .is_secure(true)
                .app_version("heaven-gpui/0.1.0".to_string());

            let api_client = backend.build().map_err(|e| format!("api: {e}"))?;
            let verifier = ApiClientWrapper::new(api_client, Retry::default());

            signature_request
                .add_signature(unverified, &verifier)
                .await
                .map_err(|e| format!("revoke_installations add_signature: {e}"))?;

            apply_signature_request_with_verifier(&verifier, signature_request, &verifier)
                .await
                .map_err(|e| format!("revoke_installations apply: {e}"))
        })?;

        log::info!(
            "[XMTP] Revoked {} installation(s) for inbox {}",
            revoked_count,
            inbox_id
        );

        Ok(())
    }
}
