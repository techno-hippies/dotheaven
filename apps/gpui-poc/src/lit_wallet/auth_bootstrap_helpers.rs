use super::signature_helpers::sign_ecdsa_action_code;
use super::*;

pub(super) async fn probe_auth_context(
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

pub(super) fn default_auth_config() -> AuthConfig {
    auth_config_with("Heaven GPUI native Lit wallet flow", "localhost", 30)
}

pub(super) fn auth_config_with(statement: &str, domain: &str, expiration_days: i64) -> AuthConfig {
    AuthConfig {
        capability_auth_sigs: vec![],
        expiration: (chrono::Utc::now() + chrono::Duration::days(expiration_days)).to_rfc3339(),
        statement: statement.into(),
        domain: domain.into(),
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

pub(super) fn config_for_network(network: &str) -> Result<NetworkConfig, String> {
    match network {
        "naga-dev" => Ok(naga_dev()),
        "naga-test" => Ok(naga_test()),
        "naga-staging" => Ok(naga_staging()),
        "naga-proto" => Ok(naga_proto()),
        "naga" => Ok(naga_mainnet()),
        _ => Err(format!("Unsupported Lit network: {network}")),
    }
}

pub(super) fn lit_network_name() -> String {
    env::var("HEAVEN_LIT_NETWORK")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var("LIT_NETWORK").ok())
        .unwrap_or_else(|| "naga-dev".to_string())
}

pub(super) fn prefer_auth_data_context() -> bool {
    env::var("HEAVEN_LIT_PREFER_AUTHDATA")
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
}

pub(super) fn auth_context_matches_expected_pkp(
    auth_context: &AuthContext,
    expected_pkp_address: &str,
) -> bool {
    let expected = expected_pkp_address.trim().to_ascii_lowercase();
    let delegated = auth_context
        .delegation_auth_sig
        .address
        .trim()
        .to_ascii_lowercase();
    !expected.is_empty() && expected == delegated
}

pub(super) fn delegation_has_required_abilities(auth_sig: &lit_rust_sdk::AuthSig) -> bool {
    crate::auth::delegation_has_lit_action_execution(auth_sig)
}

pub(super) fn resolve_lit_rpc_url() -> Option<String> {
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

pub(super) fn auth_method_id_candidates(
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

pub(super) fn extract_eoa_address_from_access_token(access_token: &str) -> Option<String> {
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

pub(super) fn extract_address_field(value: &serde_json::Value) -> Option<String> {
    value
        .get("address")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| is_evm_address(v))
        .map(str::to_string)
}

pub(super) fn derive_canonical_eoa_auth_method_id(address: &str) -> Option<String> {
    let parsed = address.parse::<Address>().ok()?;
    let checksummed = parsed.to_checksum(None);
    let digest = keccak256(format!("{}:lit", checksummed).as_bytes());
    Some(format!("0x{}", hex::encode(digest.as_slice())))
}

pub(super) fn is_evm_address(value: &str) -> bool {
    let value = value.trim();
    if value.len() != 42 || !value.starts_with("0x") {
        return false;
    }
    value.as_bytes()[2..]
        .iter()
        .all(|b| char::from(*b).is_ascii_hexdigit())
}

pub(super) fn dedupe_case_insensitive(values: Vec<String>) -> Vec<String> {
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
