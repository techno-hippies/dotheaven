use super::super::*;
use super::local_signer::LocalXmtpSigner;

impl XmtpService {
    /// Connect to XMTP for the given Ethereum address.
    pub fn connect(&mut self, address: &str) -> Result<String, String> {
        if let Some(ref c) = self.client {
            return Ok(c.inbox_id().to_string());
        }

        let local_signer = LocalXmtpSigner::for_user_wallet(address)?;
        let wallet_address = local_signer.user_wallet_address().to_string();
        let identity_address = local_signer.signer_address().to_string();

        let identifier = Identifier::Ethereum(ident::Ethereum(identity_address.clone()));
        let nonce_override = xmtp_nonce_override();
        let inbox_id_nonce_0 = identifier.inbox_id(0).ok();
        let inbox_id_nonce_1 = identifier.inbox_id(1).ok();
        let nonce: u64 = nonce_override.unwrap_or(1);
        let inbox_id = identifier
            .inbox_id(nonce)
            .map_err(|e| format!("inbox_id: {e}"))?;
        log::info!(
            "[XMTP] Inbox selection: wallet={}, identity={}, nonce={}, override={:?}, nonce0_inbox={:?}, nonce1_inbox={:?}",
            wallet_address,
            identity_address,
            nonce,
            nonce_override,
            inbox_id_nonce_0,
            inbox_id_nonce_1
        );

        let data_dir = app_data_dir();
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir: {e}"))?;
        let db_file = if nonce == 1 {
            // Keep legacy filename for nonce=1 to preserve existing local data.
            format!("xmtp-{}.db", &wallet_address)
        } else {
            format!("xmtp-{}-n{}.db", &wallet_address, nonce)
        };
        let db_path = data_dir.join(db_file).to_string_lossy().to_string();

        log::info!(
            "[XMTP] Connecting for wallet={wallet_address} identity={identity_address}, env={}, host={}, db={db_path}",
            xmtp_env_name(),
            xmtp_host()
        );

        let identity_strategy = IdentityStrategy::new(inbox_id.clone(), identifier, nonce, None);

        let xmtp_client = match self.build_client(&identity_strategy, &db_path) {
            Ok(client) => client,
            Err(ConnectBuildError::TooManyInstallations {
                inbox_id,
                count,
                max,
            }) => {
                log::warn!(
                    "[XMTP] Installation limit reached ({count}/{max}) for inbox {inbox_id}. \
Attempting automatic revocation of stale installations..."
                );

                let mut sign_with_local =
                    |sig_text: &[u8]| local_signer.sign_identity_text(sig_text);
                self.recover_installation_limit(
                    &db_path,
                    &inbox_id,
                    count,
                    max,
                    &mut sign_with_local,
                )?;

                match self.build_client(&identity_strategy, &db_path) {
                    Ok(client) => client,
                    Err(ConnectBuildError::TooManyInstallations {
                        inbox_id,
                        count,
                        max,
                    }) => {
                        return Err(format!(
                            "build: Cannot register a new installation because the InboxID \
{inbox_id} still has {count}/{max} installations after attempted recovery."
                        ));
                    }
                    Err(ConnectBuildError::Other(err)) => return Err(err),
                }
            }
            Err(ConnectBuildError::Other(err)) => return Err(err),
        };

        if let Some(signature_request) = xmtp_client.identity().signature_request() {
            let sig_text = signature_request.signature_text();
            log::info!(
                "[XMTP] Identity needs signing: {}...",
                &sig_text[..80.min(sig_text.len())]
            );

            let sig_bytes = local_signer.sign_identity_text(sig_text.as_bytes())?;
            if sig_bytes.len() != 65 {
                return Err(format!(
                    "Signer returned invalid XMTP signature length: expected 65, got {}",
                    sig_bytes.len()
                ));
            }

            let unverified = UnverifiedSignature::new_recoverable_ecdsa(sig_bytes);
            let mut sig_req = signature_request;

            self.runtime.block_on(async {
                sig_req
                    .add_signature(unverified, xmtp_client.scw_verifier().as_ref())
                    .await
                    .map_err(|e| format!("add_sig: {e}"))?;

                xmtp_client
                    .register_identity(sig_req)
                    .await
                    .map_err(|e| format!("register: {e}"))
            })?;

            log::info!("[XMTP] Identity registered successfully");
        }

        let result_inbox_id = xmtp_client.inbox_id().to_string();
        self.client = Some(Arc::new(xmtp_client));
        self.my_inbox_id = Some(result_inbox_id.clone());
        self.my_address = Some(wallet_address);

        log::info!("[XMTP] Connected with inbox_id={result_inbox_id}");
        Ok(result_inbox_id)
    }
}
