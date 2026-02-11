//! Lit wallet/auth/action service for GPUI.
//!
//! This module provides a thin synchronous facade over `lit-rust-sdk` so the
//! GPUI app can:
//! - build PKP auth context from persisted auth data
//! - execute Lit Actions natively from Rust
//! - sign payloads with PKP (via Lit nodes)

use std::env;

use alloy_primitives::{keccak256, Address};

use lit_rust_sdk::{
    create_lit_client, naga_dev, naga_mainnet, naga_proto, naga_staging, naga_test, AuthConfig,
    AuthContext, AuthData, ExecuteJsResponse, LitAbility, LitClient, NetworkConfig,
    ResourceAbilityRequest,
};

use crate::auth::PersistedAuth;

#[derive(Debug, Clone)]
pub struct LitInitStatus {
    pub network: String,
    pub pkp_address: String,
}

pub struct LitWalletService {
    runtime: tokio::runtime::Runtime,
    client: Option<LitClient>,
    auth_context: Option<AuthContext>,
    pkp_public_key: Option<String>,
    pkp_address: Option<String>,
    network: Option<String>,
}

impl LitWalletService {
    pub fn new() -> Result<Self, String> {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create tokio runtime: {e}"))?;

        Ok(Self {
            runtime,
            client: None,
            auth_context: None,
            pkp_public_key: None,
            pkp_address: None,
            network: None,
        })
    }

    pub fn clear(&mut self) {
        self.client = None;
        self.auth_context = None;
        self.pkp_public_key = None;
        self.pkp_address = None;
        self.network = None;
    }

    pub fn is_ready(&self) -> bool {
        self.client.is_some() && self.auth_context.is_some() && self.pkp_public_key.is_some()
    }

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

        let config = config_for_network(&network_name)?.with_rpc_url(rpc_url);

        let auth_config = default_auth_config();

        let pkp_public_key_for_call = pkp_public_key.clone();
        let (client, auth_context, selected_auth_method_id) = self
            .runtime
            .block_on(async move {
                let client = create_lit_client(config).await?;
                let mut last_err = None;
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
                                    log::info!("[Auth] Using pre-generated Lit delegation auth material from disk");
                                    return Ok::<
                                        (LitClient, AuthContext, Option<String>),
                                        lit_rust_sdk::LitSdkError,
                                    >((client, auth_context, None));
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

        if persisted.lit_session_key_pair.is_none() || persisted.lit_delegation_auth_sig.is_none() {
            let mut updated = persisted.clone();
            updated.lit_session_key_pair = Some(auth_context.session_key_pair.clone());
            updated.lit_delegation_auth_sig = Some(auth_context.delegation_auth_sig.clone());
            if let Err(err) = crate::auth::save_to_disk(&updated) {
                log::warn!(
                    "[Auth] Failed to cache pre-generated Lit delegation auth material: {}",
                    err
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

    pub fn execute_js(
        &mut self,
        code: String,
        js_params: Option<serde_json::Value>,
    ) -> Result<ExecuteJsResponse, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let auth_context = self
            .auth_context
            .as_ref()
            .ok_or("Lit auth context is not initialized")?
            .clone();

        self.runtime
            .block_on(async move {
                client
                    .execute_js(Some(code), None, js_params, &auth_context)
                    .await
            })
            .map_err(|e| format!("executeJs failed: {e}"))
    }

    /// Sign bytes with PKP through executeJs + Lit.Actions.signEcdsa.
    /// This mirrors the Solid/Tauri path and avoids the pkpSign endpoint.
    pub fn pkp_sign_via_execute_js(&mut self, payload: &[u8]) -> Result<serde_json::Value, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let auth_context = self
            .auth_context
            .as_ref()
            .ok_or("Lit auth context is not initialized")?
            .clone();
        let pkp_public_key = self
            .pkp_public_key
            .as_ref()
            .ok_or("Missing PKP public key")?
            .clone();
        let js_params = serde_json::json!({
            "toSign": payload.to_vec(),
            "publicKey": pkp_public_key,
        });

        let result = self
            .runtime
            .block_on(async move {
                client
                    .execute_js(
                        Some(sign_ecdsa_action_code().to_string()),
                        None,
                        Some(js_params),
                        &auth_context,
                    )
                    .await
            })
            .map_err(|e| format!("executeJs sign failed: {e}"))?;

        result.signatures.get("sig").cloned().ok_or_else(|| {
            format!(
                "executeJs returned no 'sig' signature (response={})",
                result.response
            )
        })
    }

    /// EIP-191 personal sign of a human-readable message string.
    /// Uses `ethPersonalSignMessageEcdsa` Lit Action (applies EIP-191 prefix internally).
    /// Returns the 65-byte signature (r + s + v) as a Vec<u8>.
    pub fn pkp_personal_sign(&mut self, message: &str) -> Result<Vec<u8>, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let auth_context = self
            .auth_context
            .as_ref()
            .ok_or("Lit auth context is not initialized")?
            .clone();
        let pkp_public_key = self
            .pkp_public_key
            .as_ref()
            .ok_or("Missing PKP public key")?
            .clone();
        let js_params = serde_json::json!({
            "message": message,
            "publicKey": pkp_public_key,
        });

        let result = self
            .runtime
            .block_on(async move {
                client
                    .execute_js(
                        Some(personal_sign_action_code().to_string()),
                        None,
                        Some(js_params),
                        &auth_context,
                    )
                    .await
            })
            .map_err(|e| format!("executeJs personal sign failed: {e}"))?;

        let sig = result
            .signatures
            .get("sig")
            .ok_or_else(|| format!("executeJs returned no 'sig' (response={})", result.response))?;

        // Combine r+s+v into 65 bytes (same as JS: signature + (recoveryId + 27)).
        // Lit responses can be inconsistently encoded (quoted JSON string, r/s fields, etc.),
        // so normalize before decoding.
        let sig_hex = extract_compact_signature_hex(sig)?;
        let recovery_id = sig
            .get("recid")
            .and_then(|v| v.as_u64())
            .or_else(|| sig.get("recoveryId").and_then(|v| v.as_u64()))
            .or_else(|| sig.get("recovery_id").and_then(|v| v.as_u64()))
            .or_else(|| {
                sig.get("recid")
                    .and_then(|v| v.as_str())
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .or_else(|| {
                sig.get("recoveryId")
                    .and_then(|v| v.as_str())
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .or_else(|| {
                sig.get("recovery_id")
                    .and_then(|v| v.as_str())
                    .and_then(|v| v.parse::<u64>().ok())
            })
            .ok_or("Missing 'recid' field in sig")?;

        let clean_hex = sig_hex.strip_prefix("0x").unwrap_or(&sig_hex);
        let mut sig_bytes = hex::decode(clean_hex)
            .map_err(|e| format!("hex decode sig: {e}; sig={}", truncate_for_log(&sig_hex)))?;
        if sig_bytes.len() != 64 {
            return Err(format!(
                "Invalid signature length: expected 64 bytes for r+s, got {}",
                sig_bytes.len()
            ));
        }

        let v = if recovery_id >= 27 {
            recovery_id as u8
        } else {
            (recovery_id as u8) + 27
        };
        sig_bytes.push(v);

        Ok(sig_bytes)
    }

    /// Sign pre-hashed bytes with PKP via `/web/pkp/sign`.
    /// `payload` must already be a 32-byte hash (e.g. EIP-191 prefixed).
    /// Uses `bypass_auto_hashing: true` so the SDK won't keccak256 it again.
    pub fn pkp_sign_ethereum(&mut self, payload: &[u8]) -> Result<serde_json::Value, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let auth_context = self
            .auth_context
            .as_ref()
            .ok_or("Lit auth context is not initialized")?
            .clone();
        let pkp_public_key = self
            .pkp_public_key
            .as_ref()
            .ok_or("Missing PKP public key")?
            .clone();
        let bytes = payload.to_vec();

        self.runtime
            .block_on(async move {
                client
                    .pkp_sign_ethereum_with_options(
                        &pkp_public_key,
                        &bytes,
                        &auth_context,
                        None,
                        true, // bypass_auto_hashing — payload is already hashed
                    )
                    .await
            })
            .map_err(|e| format!("pkpSignEthereum failed: {e}"))
    }

    pub fn network_name(&self) -> Option<&str> {
        self.network.as_deref()
    }
}

async fn probe_auth_context(
    client: &LitClient,
    auth_context: &AuthContext,
    pkp_public_key: &str,
    sign_probe_payload: &[u8],
) -> Result<(), lit_rust_sdk::LitSdkError> {
    let js_params = serde_json::json!({
        "toSign": sign_probe_payload,
        "publicKey": pkp_public_key,
    });
    let resp = client
        .execute_js(
            Some(sign_ecdsa_action_code().to_string()),
            None,
            Some(js_params),
            auth_context,
        )
        .await?;

    if resp.signatures.contains_key("sig") {
        Ok(())
    } else {
        Err(lit_rust_sdk::LitSdkError::Network(
            "executeJs probe succeeded but returned no sig".into(),
        ))
    }
}

fn default_auth_config() -> AuthConfig {
    AuthConfig {
        capability_auth_sigs: vec![],
        expiration: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
        statement: "Heaven GPUI native Lit wallet flow".into(),
        domain: "localhost".into(),
        resources: vec![
            ResourceAbilityRequest {
                ability: LitAbility::PKPSigning,
                resource_id: "*".into(),
                data: None,
            },
            ResourceAbilityRequest {
                ability: LitAbility::LitActionExecution,
                resource_id: "*".into(),
                data: None,
            },
            ResourceAbilityRequest {
                ability: LitAbility::AccessControlConditionDecryption,
                resource_id: "*".into(),
                data: None,
            },
        ],
    }
}

fn config_for_network(network: &str) -> Result<NetworkConfig, String> {
    match network {
        "naga-dev" => Ok(naga_dev()),
        "naga-test" => Ok(naga_test()),
        "naga-staging" => Ok(naga_staging()),
        "naga-proto" => Ok(naga_proto()),
        "naga" => Ok(naga_mainnet()),
        _ => Err(format!("Unsupported Lit network: {network}")),
    }
}

fn lit_network_name() -> String {
    env::var("HEAVEN_LIT_NETWORK")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var("LIT_NETWORK").ok())
        .unwrap_or_else(|| "naga-dev".to_string())
}

fn resolve_lit_rpc_url() -> Option<String> {
    for key in [
        "HEAVEN_LIT_RPC_URL",
        "LIT_RPC_URL",
        "LIT_TXSENDER_RPC_URL",
        "LIT_YELLOWSTONE_PRIVATE_RPC_URL",
        "LOCAL_RPC_URL",
    ] {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn auth_method_id_candidates(
    persisted: &PersistedAuth,
    auth_method_type: u32,
    auth_method_id: &str,
    access_token: &str,
) -> Vec<String> {
    let mut candidates = Vec::new();

    // EOA auth only. The Solid app moved from raw-address IDs to canonical
    // keccak256("<checksumAddress>:lit") IDs; keep GPUI compatible with both.
    if auth_method_type == 1 {
        let eoa_source = persisted
            .eoa_address
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .map(str::to_string)
            .or_else(|| extract_eoa_address_from_access_token(access_token));

        if let Some(eoa_address) = eoa_source {
            if let Some(canonical_id) = derive_canonical_eoa_auth_method_id(&eoa_address) {
                if !canonical_id.eq_ignore_ascii_case(auth_method_id) {
                    candidates.push(canonical_id);
                }
            }
        }
    }

    candidates.push(auth_method_id.to_string());
    dedupe_case_insensitive(candidates)
}

fn extract_eoa_address_from_access_token(access_token: &str) -> Option<String> {
    let parsed = serde_json::from_str::<serde_json::Value>(access_token).ok()?;

    match parsed {
        serde_json::Value::Object(_) => extract_address_field(&parsed),
        serde_json::Value::String(inner) => {
            if is_evm_address(&inner) {
                return Some(inner);
            }
            serde_json::from_str::<serde_json::Value>(&inner)
                .ok()
                .and_then(|v| extract_address_field(&v))
        }
        _ => None,
    }
}

fn extract_address_field(value: &serde_json::Value) -> Option<String> {
    value
        .get("address")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| is_evm_address(v))
        .map(str::to_string)
}

fn derive_canonical_eoa_auth_method_id(address: &str) -> Option<String> {
    let parsed = address.parse::<Address>().ok()?;
    let checksummed = parsed.to_checksum(None);
    let digest = keccak256(format!("{}:lit", checksummed).as_bytes());
    Some(format!("0x{}", hex::encode(digest.as_slice())))
}

fn is_evm_address(value: &str) -> bool {
    let value = value.trim();
    if value.len() != 42 || !value.starts_with("0x") {
        return false;
    }
    value.as_bytes()[2..]
        .iter()
        .all(|b| char::from(*b).is_ascii_hexdigit())
}

fn dedupe_case_insensitive(values: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if out
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&value))
        {
            continue;
        }
        out.push(value);
    }
    out
}

fn personal_sign_action_code() -> &'static str {
    r#"(async () => {
  const message =
    (jsParams && jsParams.message) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.message);
  const publicKey =
    (jsParams && jsParams.publicKey) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.publicKey);
  if (!message || !publicKey) {
    throw new Error("Missing message/publicKey in jsParams");
  }
  await Lit.Actions.ethPersonalSignMessageEcdsa({
    message,
    publicKey,
    sigName: "sig",
  });
})();"#
}

fn extract_compact_signature_hex(sig: &serde_json::Value) -> Result<String, String> {
    if let Some(raw) = sig.get("signature").and_then(|v| v.as_str()) {
        return normalize_hex_like_string(raw);
    }

    let r = sig.get("r").and_then(|v| v.as_str()).ok_or_else(|| {
        format!(
            "Missing 'signature' or 'r' in sig: {}",
            truncate_for_log(&sig.to_string())
        )
    })?;
    let s = sig
        .get("s")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Missing 's' in sig: {}", truncate_for_log(&sig.to_string())))?;

    let r_clean = normalize_hex_like_string(r)?;
    let s_clean = normalize_hex_like_string(s)?;
    let r_no_prefix = r_clean.strip_prefix("0x").unwrap_or(&r_clean);
    let s_no_prefix = s_clean.strip_prefix("0x").unwrap_or(&s_clean);
    Ok(format!("{}{}", r_no_prefix, s_no_prefix))
}

fn normalize_hex_like_string(raw: &str) -> Result<String, String> {
    // Some Lit runtimes return a doubly-encoded JSON string like "\"0xabc...\"".
    let mut value = raw.trim().to_string();
    for _ in 0..2 {
        match serde_json::from_str::<String>(&value) {
            Ok(decoded) => value = decoded,
            Err(_) => break,
        }
    }

    value = value.trim().trim_matches('"').to_string();

    let no_prefix = value.strip_prefix("0x").unwrap_or(&value);
    if no_prefix.is_empty() || !no_prefix.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "Signature is not valid hex: {}",
            truncate_for_log(raw)
        ));
    }

    if no_prefix.len() % 2 != 0 {
        return Err(format!(
            "Signature hex has odd length ({}): {}",
            no_prefix.len(),
            truncate_for_log(raw)
        ));
    }

    if value.starts_with("0x") {
        Ok(value)
    } else {
        Ok(format!("0x{no_prefix}"))
    }
}

fn truncate_for_log(value: &str) -> String {
    const MAX: usize = 140;
    if value.len() <= MAX {
        value.to_string()
    } else {
        format!("{}...", &value[..MAX])
    }
}

fn sign_ecdsa_action_code() -> &'static str {
    r#"(async () => {
  const rawToSign =
    (jsParams && jsParams.toSign) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.toSign);
  const publicKey =
    (jsParams && jsParams.publicKey) ||
    (jsParams && jsParams.jsParams && jsParams.jsParams.publicKey);
  if (!rawToSign || !publicKey) {
    throw new Error("Missing toSign/publicKey in jsParams");
  }
  const toSign = new Uint8Array(rawToSign);
  await Lit.Actions.signEcdsa({
    toSign,
    publicKey,
    sigName: "sig",
  });
})();"#
}
