use super::auth_bootstrap_helpers::*;
use super::*;

impl LitWalletService {
    pub fn initialize_from_auth(
        &mut self,
        persisted: &PersistedAuth,
    ) -> Result<LitInitStatus, String> {
        crate::auth::log_persisted_auth("LitWallet initialize_from_auth input", persisted);
        let pkp_public_key = persisted
            .pkp_public_key
            .clone()
            .ok_or("Missing PKP public key in persisted auth")?;
        let pkp_address = persisted
            .pkp_address
            .clone()
            .ok_or("Missing PKP address in persisted auth")?;
        let pre_generated_session_key_pair = persisted.lit_session_key_pair.clone();
        let pre_generated_delegation_auth_sig = persisted.lit_delegation_auth_sig.clone();

        let auth_method_id = persisted.auth_method_id.clone();
        let auth_method_type = persisted.auth_method_type;
        let access_token = persisted.access_token.clone();

        let mut auth_data_candidates = Vec::new();
        if let (Some(method_id), Some(method_type), Some(token)) =
            (&auth_method_id, auth_method_type, &access_token)
        {
            let auth_method_ids =
                auth_method_id_candidates(persisted, method_type, method_id, token);
            for candidate_auth_method_id in auth_method_ids {
                auth_data_candidates.push(AuthData {
                    auth_method_id: candidate_auth_method_id,
                    auth_method_type: method_type,
                    access_token: token.clone(),
                    public_key: None,
                    metadata: None,
                });
            }
        }

        let has_pre_generated =
            pre_generated_session_key_pair.is_some() && pre_generated_delegation_auth_sig.is_some();
        if !has_pre_generated && auth_data_candidates.is_empty() {
            return Err(
                "Missing Lit auth material. Provide either pre-generated delegation auth (litSessionKeyPair + litDelegationAuthSig) or authData (authMethodId/authMethodType/accessToken).".to_string()
            );
        }

        let network_name = lit_network_name();
        let rpc_url = resolve_lit_rpc_url().ok_or_else(|| {
            "Missing Lit RPC URL. Set HEAVEN_LIT_RPC_URL or LIT_RPC_URL (or LIT_TXSENDER_RPC_URL / LIT_YELLOWSTONE_PRIVATE_RPC_URL / LOCAL_RPC_URL).".to_string()
        })?;
        let expected_pkp_address = pkp_address.clone();

        let config = config_for_network(&network_name)?.with_rpc_url(rpc_url);

        let auth_config = default_auth_config();
        let prefer_auth_data = prefer_auth_data_context();

        let pkp_public_key_for_call = pkp_public_key.clone();
        let (client, auth_context, selected_auth_method_id) = self
            .runtime
            .block_on(async move {
                let client = create_lit_client(config).await?;
                let mut last_err = None;
                let mut pre_generated_ok_context = None;
                let sign_probe_payload: Vec<u8> =
                    keccak256(b"heaven-gpui-auth-probe").as_slice().to_vec();

                if let (Some(session_key_pair), Some(delegation_auth_sig)) = (
                    pre_generated_session_key_pair,
                    pre_generated_delegation_auth_sig,
                ) {
                    match client
                        .create_pkp_auth_context_from_pre_generated(
                            session_key_pair,
                            delegation_auth_sig,
                        ) {
                        Ok(auth_context) => {
                            match probe_auth_context(
                                &client,
                                &auth_context,
                                &pkp_public_key_for_call,
                                &sign_probe_payload,
                            )
                            .await
                            {
                                Ok(()) => {
                                    if !auth_context_matches_expected_pkp(
                                        &auth_context,
                                        &expected_pkp_address,
                                    ) {
                                        let delegated =
                                            auth_context.delegation_auth_sig.address.clone();
                                        log::warn!(
                                            "[Auth] Pre-generated delegation signer address mismatch: expected PKP={}, got={}",
                                            expected_pkp_address,
                                            delegated
                                        );
                                        last_err = Some(lit_rust_sdk::LitSdkError::Config(
                                            format!(
                                                "pre-generated delegation address mismatch: expected {}, got {}",
                                                expected_pkp_address, delegated
                                            ),
                                        ));
                                    } else {
                                        if !delegation_has_required_abilities(
                                            &auth_context.delegation_auth_sig,
                                        ) {
                                            if auth_data_candidates.is_empty() {
                                                log::warn!(
                                                    "[Auth] Pre-generated delegation missing LitActionExecution ability and no authData is available; re-auth required"
                                                );
                                                last_err = Some(lit_rust_sdk::LitSdkError::Config(
                                                    "pre-generated delegation missing LitActionExecution ability and authData fallback is unavailable".into(),
                                                ));
                                            } else {
                                                log::warn!(
                                                    "[Auth] Pre-generated delegation missing LitActionExecution ability; rebuilding from authData"
                                                );
                                            }
                                        } else {
                                            if auth_data_candidates.is_empty() {
                                                log::info!("[Auth] Using pre-generated Lit delegation auth material from disk");
                                                return Ok::<
                                                    (LitClient, AuthContext, Option<String>),
                                                    lit_rust_sdk::LitSdkError,
                                                >((client, auth_context, None));
                                            }
                                            if prefer_auth_data {
                                                log::info!("[Auth] Pre-generated Lit delegation auth is valid; trying authData first for refreshed capabilities (HEAVEN_LIT_PREFER_AUTHDATA=true)");
                                                pre_generated_ok_context = Some(auth_context);
                                            } else {
                                                log::info!("[Auth] Using valid pre-generated Lit delegation auth material (default preference)");
                                                return Ok::<
                                                    (LitClient, AuthContext, Option<String>),
                                                    lit_rust_sdk::LitSdkError,
                                                >((client, auth_context, None));
                                            }
                                        }
                                    }
                                }
                                Err(err) => {
                                    log::warn!(
                                        "[Auth] Pre-generated Lit delegation auth probe failed (will try authData fallback if available): {}",
                                        err
                                    );
                                    last_err = Some(err);
                                }
                            }
                        }
                        Err(err) => {
                            log::warn!(
                                "[Auth] Pre-generated Lit delegation auth invalid (will try authData fallback if available): {}",
                                err
                            );
                            last_err = Some(err);
                        }
                    }
                }

                for auth_data in auth_data_candidates {
                    let candidate_auth_method_id = auth_data.auth_method_id.clone();
                    match client
                        .create_pkp_auth_context(
                            &pkp_public_key_for_call,
                            auth_data,
                            auth_config.clone(),
                            None,
                            None,
                            None,
                        )
                        .await
                    {
                        Ok(auth_context) => {
                            match probe_auth_context(
                                &client,
                                &auth_context,
                                &pkp_public_key_for_call,
                                &sign_probe_payload,
                            )
                            .await
                            {
                                Ok(()) => {
                                    if !auth_context_matches_expected_pkp(
                                        &auth_context,
                                        &expected_pkp_address,
                                    ) {
                                        let delegated =
                                            auth_context.delegation_auth_sig.address.clone();
                                        log::warn!(
                                            "[Auth] Lit auth context delegation signer address mismatch for authMethodId={}: expected PKP={}, got={}; trying next candidate",
                                            candidate_auth_method_id,
                                            expected_pkp_address,
                                            delegated
                                        );
                                        last_err = Some(lit_rust_sdk::LitSdkError::Config(
                                            format!(
                                                "authData delegation address mismatch: expected {}, got {}",
                                                expected_pkp_address, delegated
                                            ),
                                        ));
                                        continue;
                                    }
                                    return Ok::<
                                        (LitClient, AuthContext, Option<String>),
                                        lit_rust_sdk::LitSdkError,
                                    >((
                                        client,
                                        auth_context,
                                        Some(candidate_auth_method_id),
                                    ));
                                }
                                Err(err) => {
                                    log::warn!(
                                        "[Auth] Lit auth context probe sign failed for authMethodId={} (will try fallback if available): {}",
                                        candidate_auth_method_id,
                                        err
                                    );
                                    last_err = Some(err);
                                }
                            }
                        }
                        Err(err) => {
                            log::warn!(
                                "[Auth] Lit auth context failed for authMethodId={} (will try fallback if available): {}",
                                candidate_auth_method_id,
                                err
                            );
                            last_err = Some(err);
                        }
                    }
                }

                if let Some(auth_context) = pre_generated_ok_context {
                    log::info!("[Auth] Falling back to pre-generated Lit delegation auth after authData attempts failed");
                    return Ok::<
                        (LitClient, AuthContext, Option<String>),
                        lit_rust_sdk::LitSdkError,
                    >((client, auth_context, None));
                }

                Err(last_err.unwrap_or_else(|| {
                    lit_rust_sdk::LitSdkError::Config(
                        "No valid auth material available for Lit auth context initialization".into(),
                    )
                }))
            })
            .map_err(|e| {
                let mut msg = format!("Failed to initialize Lit auth context: {e}");
                let lower = e.to_string().to_lowercase();
                if auth_method_type == Some(3) && lower.contains("invalid blockhash used as challenge")
                {
                    msg.push_str(
                        ". Persisted WebAuthn access token is stale. Sign in again once (Wallet/Sidebar) to refresh and cache delegation auth material.",
                    );
                }
                msg
            })?;

        if let (Some(selected_auth_method_id), Some(auth_method_id)) =
            (&selected_auth_method_id, &auth_method_id)
        {
            if selected_auth_method_id != auth_method_id {
                log::info!(
                    "[Auth] Using canonical EOA authMethodId derived from token/address: {}",
                    selected_auth_method_id
                );
            }
        }

        log::info!(
            "[Auth] Lit auth context selected: pkpAddress={} delegationSigner={} source={} authMethodId={}",
            pkp_address,
            auth_context.delegation_auth_sig.address,
            if selected_auth_method_id.is_some() {
                "authData"
            } else {
                "pre-generated"
            },
            selected_auth_method_id.as_deref().unwrap_or("n/a")
        );

        let should_cache_delegation = selected_auth_method_id.is_some()
            || persisted.lit_session_key_pair.is_none()
            || persisted.lit_delegation_auth_sig.is_none();
        if should_cache_delegation {
            let mut updated = persisted.clone();
            updated.lit_session_key_pair = Some(auth_context.session_key_pair.clone());
            updated.lit_delegation_auth_sig = Some(auth_context.delegation_auth_sig.clone());
            if let Err(err) = crate::auth::save_to_disk(&updated) {
                log::warn!(
                    "[Auth] Failed to cache pre-generated Lit delegation auth material: {}",
                    err
                );
            } else if selected_auth_method_id.is_some() {
                log::info!(
                    "[Auth] Refreshed and cached Lit delegation auth material from authData context"
                );
            } else {
                log::info!("[Auth] Cached Lit delegation auth material for future app launches");
            }
        }

        self.client = Some(client);
        self.auth_context = Some(auth_context);
        self.pkp_public_key = Some(pkp_public_key);
        self.pkp_address = Some(pkp_address.clone());
        self.network = Some(network_name.clone());

        Ok(LitInitStatus {
            network: network_name,
            pkp_address,
        })
    }
}
