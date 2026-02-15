use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::str::FromStr;
use std::sync::{Arc, Mutex, OnceLock};

use aes_gcm::aead::Aead;
use aes_gcm::KeyInit;
use aes_gcm::Nonce;
use base64::Engine;
use ethers::prelude::{Http, Provider, SignerMiddleware, U256};
use ethers::providers::Middleware;
use ethers::signers::{LocalWallet, Signer};
use getrandom::getrandom;
use sha2::{Digest, Sha384};

use lit_rust_sdk::{
    create_eth_wallet_auth_data, create_lit_client, naga_dev, naga_mainnet, naga_proto,
    naga_staging, naga_test, view_pkps_by_auth_data, AuthConfig, AuthContext, AuthData,
    EncryptParams, LitAbility, LitClient, Pagination, PkpMintManager, ResourceAbilityRequest,
};
use lit_rust_sdk::client::ExecuteJsResponseStrategy;
use serde::{Deserialize, Serialize};

const BRIDGE_VERSION: &str = "0.1.0";
const DEFAULT_LOAD_GATEWAY_URL: &str = "https://gateway.s3-node-1.load.network";
const DEFAULT_CONTENT_DECRYPT_V1_CID: &str = "QmUmVkMxC57nAqUmJPZmoBKeBfiZS6ZR8qzYQJvWe4W12w";

fn default_auth_expiration() -> String {
    use chrono::{SecondsFormat, Utc};

    // Lit nodes enforce a maximum session key expiry window (observed ~30 days).
    // Use a short TTL to keep the flow valid across platforms and clock skew.
    (Utc::now() + chrono::Duration::days(7)).to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResponseEnvelope<T: Serialize> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthcheckResult {
    bridge_version: &'static str,
    lit_networks: Vec<&'static str>,
    target: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectResult {
    network: String,
    connected_nodes: usize,
    threshold: usize,
    epoch: u64,
    first_node: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MintAndAuthContextResult {
    network: String,
    chain_id: u64,
    tx_hash: String,
    token_id: String,
    pkp_public_key: String,
    pkp_eth_address: String,
    auth_method_id: String,
    session_public_key: String,
    delegation_signature_address: String,
    delegation_signature_algo: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PasskeyAuthContextResult {
    network: String,
    pkp_public_key: String,
    auth_method_type: u32,
    auth_method_id: String,
    session_public_key: String,
    delegation_signature_address: String,
    delegation_signature_algo: Option<String>,
    connected_nodes: usize,
    threshold: usize,
    epoch: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PkpDataResult {
    token_id: String,
    pubkey: String,
    eth_address: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaginationInfoResult {
    limit: usize,
    offset: usize,
    total: usize,
    has_more: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaginatedPkpsResult {
    pkps: Vec<PkpDataResult>,
    pagination: PaginationInfoResult,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteJsResult {
    success: bool,
    signatures: HashMap<String, serde_json::Value>,
    response: serde_json::Value,
    logs: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignMessageResult {
    signature: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadUploadResult {
    id: String,
    gateway_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    winc: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchAndDecryptContentResult {
    audio_base64: String,
    bytes: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    mime_type: Option<String>,
    source_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncomingAuthConfig {
    #[serde(default)]
    resources: Vec<Vec<String>>,
    expiration: Option<String>,
    statement: Option<String>,
    domain: Option<String>,
}

#[derive(Clone)]
struct CachedLitClient {
    network: String,
    rpc_url: String,
    client: LitClient,
}

static LIT_CLIENT_CACHE: OnceLock<Mutex<Option<CachedLitClient>>> = OnceLock::new();

fn lit_client_cache() -> &'static Mutex<Option<CachedLitClient>> {
    LIT_CLIENT_CACHE.get_or_init(|| Mutex::new(None))
}

#[derive(Clone)]
struct CachedAuthContext {
    network: String,
    rpc_url: String,
    pkp_public_key: String,
    auth_method_id: String,
    auth_context: AuthContext,
}

static AUTH_CONTEXT_CACHE: OnceLock<Mutex<Option<CachedAuthContext>>> = OnceLock::new();

fn auth_context_cache() -> &'static Mutex<Option<CachedAuthContext>> {
    AUTH_CONTEXT_CACHE.get_or_init(|| Mutex::new(None))
}

async fn get_or_create_lit_client(network: &str, rpc_url: &str) -> Result<LitClient, String> {
    if let Ok(cache) = lit_client_cache().lock() {
        if let Some(cached) = cache.as_ref() {
            if cached.network == network && cached.rpc_url == rpc_url {
                return Ok(cached.client.clone());
            }
        }
    }

    let config = build_network_config(network, rpc_url.to_string())?;
    let client = create_lit_client(config)
        .await
        .map_err(|err| format!("failed to connect to Lit nodes: {err}"))?;

    if let Ok(mut cache) = lit_client_cache().lock() {
        *cache = Some(CachedLitClient {
            network: network.to_string(),
            rpc_url: rpc_url.to_string(),
            client: client.clone(),
        });
    }

    Ok(client)
}

fn set_cached_auth_context(cache_value: CachedAuthContext) {
    if let Ok(mut cache) = auth_context_cache().lock() {
        *cache = Some(cache_value);
    }
}

fn clear_cached_auth_context() {
    if let Ok(mut cache) = auth_context_cache().lock() {
        *cache = None;
    }
}

fn get_cached_auth_context(network: &str, rpc_url: &str) -> Result<CachedAuthContext, String> {
    let cache = auth_context_cache()
        .lock()
        .map_err(|_| "auth context cache mutex poisoned".to_string())?;
    let cached = cache
        .as_ref()
        .ok_or_else(|| "no auth context cached; call createAuthContext first".to_string())?;
    if cached.network != network || cached.rpc_url != rpc_url {
        return Err("cached auth context does not match requested network/rpcUrl".to_string());
    }
    Ok(cached.clone())
}

fn ok_json<T: Serialize>(result: T) -> String {
    serde_json::to_string(&ResponseEnvelope {
        ok: true,
        result: Some(result),
        error: None,
    })
    .unwrap_or_else(|err| {
        format!(
            r#"{{"ok":false,"error":"failed to serialize success payload: {}"}}"#,
            sanitize_error(&err.to_string())
        )
    })
}

fn err_json(message: impl Into<String>) -> String {
    serde_json::to_string(&ResponseEnvelope::<serde_json::Value> {
        ok: false,
        result: None,
        error: Some(message.into()),
    })
    .unwrap_or_else(|_| "{\"ok\":false,\"error\":\"unknown error\"}".to_string())
}

fn sanitize_error(message: &str) -> String {
    message
        .replace('"', "'")
        .replace('\n', " ")
        .replace('\r', " ")
}

fn into_c_string(value: String) -> *mut c_char {
    match CString::new(value) {
        Ok(value) => value.into_raw(),
        Err(err) => CString::new(err_json(format!(
            "failed to encode Rust response as CString: {}",
            sanitize_error(&err.to_string())
        )))
        .expect("fallback error JSON is valid CString")
        .into_raw(),
    }
}

fn parse_c_string_arg(value: *const c_char, field_name: &str) -> Result<String, String> {
    if value.is_null() {
        return Err(format!("{field_name} is required"));
    }

    let cstr = unsafe { CStr::from_ptr(value) };
    let parsed = cstr
        .to_str()
        .map_err(|_| format!("{field_name} must be valid UTF-8"))?
        .trim()
        .to_string();

    if parsed.is_empty() {
        return Err(format!("{field_name} cannot be empty"));
    }

    Ok(parsed)
}

fn parse_c_string_arg_allow_empty(value: *const c_char, field_name: &str) -> Result<String, String> {
    if value.is_null() {
        return Err(format!("{field_name} is required"));
    }

    let cstr = unsafe { CStr::from_ptr(value) };
    let parsed = cstr
        .to_str()
        .map_err(|_| format!("{field_name} must be valid UTF-8"))?
        .trim()
        .to_string();

    Ok(parsed)
}

fn build_network_config(
    network: &str,
    rpc_url: String,
) -> Result<lit_rust_sdk::NetworkConfig, String> {
    let config = match network {
        "naga-dev" => naga_dev(),
        "naga-test" => naga_test(),
        "naga-staging" => naga_staging(),
        "naga-proto" => naga_proto(),
        "naga" => naga_mainnet(),
        _ => {
            return Err(format!(
                "unsupported network \"{}\". Use one of: naga-dev, naga-test, naga-staging, naga-proto, naga",
                network
            ))
        }
    };
    Ok(config.with_rpc_url(rpc_url))
}

fn healthcheck_impl() -> String {
    let result = HealthcheckResult {
        bridge_version: BRIDGE_VERSION,
        lit_networks: vec![
            "naga-dev",
            "naga-test",
            "naga-staging",
            "naga-proto",
            "naga",
        ],
        target: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
    };

    ok_json(result)
}

fn create_eth_wallet_auth_data_impl(private_key_hex: String, nonce: String) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let auth_data = runtime.block_on(async {
        create_eth_wallet_auth_data(private_key_hex.as_str(), nonce.as_str()).await
    });

    match auth_data {
        Ok(auth_data) => ok_json(auth_data),
        Err(err) => err_json(format!(
            "failed to create auth data: {}",
            sanitize_error(&err.to_string())
        )),
    }
}

fn test_connect_impl(network: String, rpc_url: String) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let handshake = client.handshake_result();

        Ok::<ConnectResult, String>(ConnectResult {
            network,
            connected_nodes: handshake.connected_nodes.len(),
            threshold: handshake.threshold,
            epoch: handshake.epoch,
            first_node: handshake.connected_nodes.first().cloned(),
        })
    });

    match result {
        Ok(result) => ok_json(result),
        Err(err) => err_json(sanitize_error(&err)),
    }
}

fn mint_pkp_and_create_auth_context_impl(
    network: String,
    rpc_url: String,
    private_key_hex: String,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let config = build_network_config(network.as_str(), rpc_url.clone())?;

        let normalized_private_key = if private_key_hex.starts_with("0x") {
            private_key_hex
        } else {
            format!("0x{private_key_hex}")
        };

        let wallet: LocalWallet = normalized_private_key
            .parse()
            .map_err(|err| format!("failed to parse EOA private key: {err}"))?;

        let provider = Provider::<Http>::try_from(rpc_url.as_str())
            .map_err(|err| format!("failed to create provider from rpcUrl: {err}"))?;
        let chain_id = provider
            .get_chainid()
            .await
            .map_err(|err| format!("failed to read chain id: {err}"))?
            .as_u64();

        let signer_wallet = wallet.with_chain_id(chain_id);
        let middleware = Arc::new(SignerMiddleware::new(provider, signer_wallet));
        let mint_manager = PkpMintManager::new(&config, middleware)
            .map_err(|err| format!("failed to create PKP mint manager: {err}"))?;

        let mint_result = mint_manager
            .mint_next(U256::from(2u64), "naga-keyset1")
            .await
            .map_err(|err| format!("failed to mint PKP: {err}"))?;

        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;

        let nonce = lit_client
            .handshake_result()
            .core_node_config
            .latest_blockhash
            .clone();

        let auth_data =
            create_eth_wallet_auth_data(normalized_private_key.as_str(), nonce.as_str())
                .await
                .map_err(|err| format!("failed to create auth data: {err}"))?;

        let auth_config = AuthConfig {
            capability_auth_sigs: vec![],
            expiration: default_auth_expiration(),
            statement: "RN Rust Lit PoC - PKP auth context".to_string(),
            domain: "localhost".to_string(),
            resources: vec![ResourceAbilityRequest {
                ability: LitAbility::PKPSigning,
                resource_id: "*".to_string(),
                data: None,
            }],
        };

        let auth_context = lit_client
            .create_pkp_auth_context(
                mint_result.data.pubkey.as_str(),
                auth_data.clone(),
                auth_config,
                None,
                None,
                None,
            )
            .await
            .map_err(|err| format!("failed to create PKP auth context: {err}"))?;

        Ok::<MintAndAuthContextResult, String>(MintAndAuthContextResult {
            network,
            chain_id,
            tx_hash: format!("{:#x}", mint_result.hash),
            token_id: mint_result.data.token_id.to_string(),
            pkp_public_key: mint_result.data.pubkey,
            pkp_eth_address: format!("{:#x}", mint_result.data.eth_address),
            auth_method_id: auth_data.auth_method_id,
            session_public_key: auth_context.session_key_pair.public_key,
            delegation_signature_address: auth_context.delegation_auth_sig.address,
            delegation_signature_algo: auth_context.delegation_auth_sig.algo,
        })
    });

    match result {
        Ok(result) => ok_json(result),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn create_auth_context_from_passkey_callback_impl(
    network: String,
    rpc_url: String,
    pkp_public_key: String,
    auth_method_type: u32,
    auth_method_id: String,
    access_token: String,
    auth_config_json: String,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;

        let incoming_config: IncomingAuthConfig = serde_json::from_str(auth_config_json.as_str())
            .map_err(|err| format!("invalid authConfig JSON: {err}"))?;
        let domain = incoming_config.domain.unwrap_or_default().trim().to_string();
        if domain.is_empty() {
            return Err("authConfig.domain cannot be empty".to_string());
        }
        let expiration = incoming_config
            .expiration
            .unwrap_or_default()
            .trim()
            .to_string();
        let expiration = if expiration.is_empty() {
            default_auth_expiration()
        } else {
            expiration
        };
        let statement = incoming_config
            .statement
            .unwrap_or_default()
            .trim()
            .to_string();
        let statement = if statement.is_empty() {
            "Execute Lit Actions and sign messages".to_string()
        } else {
            statement
        };

        let mut resources: Vec<ResourceAbilityRequest> = vec![];
        for entry in incoming_config.resources {
            if entry.len() < 2 {
                continue;
            }
            let ability_raw = entry[0].trim().to_string();
            let resource_id = entry[1].trim().to_string();
            if ability_raw.is_empty() || resource_id.is_empty() {
                continue;
            }
            let ability = LitAbility::from_str(ability_raw.as_str()).map_err(|_| {
                format!("unknown Lit resource ability \"{}\"", sanitize_error(ability_raw.as_str()))
            })?;
            resources.push(ResourceAbilityRequest {
                ability,
                resource_id,
                data: None,
            });
        }
        if !resources.iter().any(|r| r.ability == LitAbility::PKPSigning) {
            resources.push(ResourceAbilityRequest {
                ability: LitAbility::PKPSigning,
                resource_id: "*".to_string(),
                data: None,
            });
        }

        let auth_data = AuthData {
            auth_method_id: auth_method_id.clone(),
            auth_method_type,
            access_token,
            public_key: None,
            metadata: None,
        };

        let auth_config = AuthConfig {
            capability_auth_sigs: vec![],
            expiration,
            statement,
            domain,
            resources,
        };

        let normalized_pkp_public_key =
            if pkp_public_key.starts_with("0x") || pkp_public_key.starts_with("0X") {
                pkp_public_key
            } else {
                format!("0x{pkp_public_key}")
            };

        let auth_context = lit_client
            .create_pkp_auth_context(
                normalized_pkp_public_key.as_str(),
                auth_data,
                auth_config,
                None,
                None,
                None,
            )
            .await
            .map_err(|err| format!("failed to create PKP auth context: {err}"))?;

        set_cached_auth_context(CachedAuthContext {
            network: network.clone(),
            rpc_url: rpc_url.clone(),
            pkp_public_key: normalized_pkp_public_key.clone(),
            auth_method_id: auth_method_id.clone(),
            auth_context: auth_context.clone(),
        });

        let handshake = lit_client.handshake_result();
        Ok::<PasskeyAuthContextResult, String>(PasskeyAuthContextResult {
            network,
            pkp_public_key: normalized_pkp_public_key,
            auth_method_type,
            auth_method_id,
            session_public_key: auth_context.session_key_pair.public_key,
            delegation_signature_address: auth_context.delegation_auth_sig.address,
            delegation_signature_algo: auth_context.delegation_auth_sig.algo,
            connected_nodes: handshake.connected_nodes.len(),
            threshold: handshake.threshold,
            epoch: handshake.epoch,
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn clear_auth_context_impl() -> String {
    clear_cached_auth_context();
    ok_json(serde_json::json!({ "success": true }))
}

fn view_pkps_by_auth_data_impl(
    network: String,
    rpc_url: String,
    auth_method_type: u32,
    auth_method_id: String,
    limit: usize,
    offset: usize,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let config = build_network_config(network.as_str(), rpc_url.clone())?;
        let pagination = Pagination { limit, offset };
        let pkps = view_pkps_by_auth_data(
            &config,
            U256::from(auth_method_type as u64),
            auth_method_id.as_str(),
            pagination,
        )
        .await
        .map_err(|err| format!("failed to view PKPs: {err}"))?;

        let pkps_out = pkps
            .pkps
            .into_iter()
            .map(|pkp| PkpDataResult {
                token_id: pkp.token_id.to_string(),
                pubkey: pkp.pubkey,
                eth_address: format!("{:#x}", pkp.eth_address),
            })
            .collect::<Vec<_>>();

        Ok::<PaginatedPkpsResult, String>(PaginatedPkpsResult {
            pkps: pkps_out,
            pagination: PaginationInfoResult {
                limit: pkps.pagination.limit,
                offset: pkps.pagination.offset,
                total: pkps.pagination.total,
                has_more: pkps.pagination.has_more,
            },
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn execute_js_impl(
    network: String,
    rpc_url: String,
    code: String,
    ipfs_id: String,
    js_params_json: String,
    use_single_node: bool,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let cached = get_cached_auth_context(network.as_str(), rpc_url.as_str())?;

        let code_opt = if code.trim().is_empty() {
            None
        } else {
            Some(code)
        };
        let ipfs_opt = if ipfs_id.trim().is_empty() {
            None
        } else {
            Some(ipfs_id)
        };
        if code_opt.is_none() && ipfs_opt.is_none() {
            return Err("executeJs requires code or ipfsId".to_string());
        }

        let js_params_opt = if js_params_json.trim().is_empty() {
            None
        } else {
            Some(
                serde_json::from_str::<serde_json::Value>(js_params_json.as_str())
                    .map_err(|err| format!("invalid jsParams JSON: {err}"))?,
            )
        };

        let options = lit_rust_sdk::ExecuteJsOptions {
            use_single_node,
            user_max_price_wei: None,
            response_strategy: ExecuteJsResponseStrategy::MostCommon,
        };

        let exec = lit_client
            .execute_js_with_options(code_opt, ipfs_opt, js_params_opt, &cached.auth_context, options)
            .await
            .map_err(|err| format!("executeJs failed: {err}"))?;

        Ok::<ExecuteJsResult, String>(ExecuteJsResult {
            success: exec.success,
            signatures: exec.signatures,
            response: exec.response,
            logs: exec.logs,
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn strip_0x(value: &str) -> &str {
    value.strip_prefix("0x").or_else(|| value.strip_prefix("0X")).unwrap_or(value)
}

fn normalize_hex_like_string(raw: &str) -> String {
    // Some Lit runtimes return doubly-encoded JSON strings like "\"0xabc...\"".
    let mut value = raw.trim().to_string();
    for _ in 0..2 {
        match serde_json::from_str::<String>(&value) {
            Ok(decoded) => value = decoded,
            Err(_) => break,
        }
    }
    value.trim().trim_matches('"').to_string()
}

fn normalize_hex_digits(raw: &str) -> Result<String, String> {
    let normalized = normalize_hex_like_string(raw);
    let no_prefix = strip_0x(normalized.as_str()).trim();
    if no_prefix.is_empty() || !no_prefix.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "invalid hex string: {}",
            sanitize_error(raw)
        ));
    }
    Ok(no_prefix.to_string())
}

fn signature_from_combined_value(combined: &serde_json::Value) -> Result<String, String> {
    let mut r_hex: Option<String> = None;
    let mut s_hex: Option<String> = None;
    let mut recid: Option<i64> = None;

    if let Some(obj) = combined.as_object() {
        if let Some(r) = obj.get("r").and_then(|v| v.as_str()) {
            r_hex = Some(normalize_hex_digits(r)?);
        }
        if let Some(s) = obj.get("s").and_then(|v| v.as_str()) {
            s_hex = Some(normalize_hex_digits(s)?);
        }
        if let Some(v) = obj.get("recid").or_else(|| obj.get("recoveryId")).or_else(|| obj.get("v")) {
            recid = if let Some(n) = v.as_i64() {
                Some(n)
            } else if let Some(s) = v.as_str() {
                s.parse::<i64>().ok()
            } else {
                None
            };
        }
        if r_hex.is_none() || s_hex.is_none() {
            if let Some(sig) = obj.get("signature").and_then(|v| v.as_str()) {
                let sig_hex = normalize_hex_digits(sig)?;
                if sig_hex.len() >= 128 {
                    r_hex = Some(sig_hex[0..64].to_string());
                    s_hex = Some(sig_hex[64..128].to_string());
                }
            }
        }
    }

    let r = r_hex.ok_or_else(|| "missing signature r".to_string())?;
    let s = s_hex.ok_or_else(|| "missing signature s".to_string())?;
    if r.len() > 64 {
        return Err("invalid signature r length".to_string());
    }
    if s.len() > 64 {
        return Err("invalid signature s length".to_string());
    }
    let recid = recid.unwrap_or(0);
    let v = if recid >= 27 { recid } else { recid + 27 };

    let r_padded = format!("{:0>64}", r);
    let s_padded = format!("{:0>64}", s);
    let v_hex = format!("{:02x}", v);
    let signature = format!("0x{}{}{}", r_padded, s_padded, v_hex);
    if signature.len() != 132 {
        return Err(format!(
            "invalid 65-byte signature length (expected 132, got {})",
            signature.len()
        ));
    }
    Ok(signature)
}

fn sign_message_impl(network: String, rpc_url: String, message: String, public_key: String) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let cached = get_cached_auth_context(network.as_str(), rpc_url.as_str())?;

        if !public_key.trim().is_empty()
            && strip_0x(public_key.trim()).to_lowercase()
                != strip_0x(cached.pkp_public_key.as_str()).to_lowercase()
        {
            return Err("publicKey does not match cached auth context PKP".to_string());
        }

        let digest = ethers::utils::hash_message(message);
        let combined = lit_client
            .pkp_sign_ethereum_with_options(
                cached.pkp_public_key.as_str(),
                digest.as_bytes(),
                &cached.auth_context,
                None,
                true,
            )
            .await
            .map_err(|err| format!("pkpSign failed: {err}"))?;

        let signature = signature_from_combined_value(&combined)?;
        Ok::<SignMessageResult, String>(SignMessageResult { signature })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

const ANS104_SIGNATURE_TYPE_ETHEREUM: u16 = 3;

const ANS104_MAX_TAGS: usize = 128;
const ANS104_MAX_NAME_LEN: usize = 1024;
const ANS104_MAX_VALUE_LEN: usize = 3072;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Ans104Tag {
    name: String,
    value: String,
}

impl Ans104Tag {
    fn new(name: &str, value: &str) -> Self {
        Self { name: name.to_string(), value: value.to_string() }
    }
}

fn validate_ans104_tags(tags: &[Ans104Tag]) -> Result<(), String> {
    if tags.len() > ANS104_MAX_TAGS {
        return Err(format!("too many tags (>{})", ANS104_MAX_TAGS));
    }

    for tag in tags {
        if tag.name.is_empty() {
            return Err("empty tag name".to_string());
        }
        if tag.value.is_empty() {
            return Err("empty tag value".to_string());
        }
        if tag.name.as_bytes().len() > ANS104_MAX_NAME_LEN {
            return Err(format!("tag name >{} bytes", ANS104_MAX_NAME_LEN));
        }
        if tag.value.as_bytes().len() > ANS104_MAX_VALUE_LEN {
            return Err(format!("tag value >{} bytes", ANS104_MAX_VALUE_LEN));
        }
    }

    Ok(())
}

fn encode_avro_long(out: &mut Vec<u8>, value: usize) {
    // Avro long uses zigzag varint encoding. For non-negative values, zigzag is value << 1.
    let mut n = (value as u64) << 1;
    loop {
        let mut byte = (n & 0x7F) as u8;
        n >>= 7;
        if n != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if n == 0 {
            break;
        }
    }
}

fn encode_ans104_tags(tags: &[Ans104Tag]) -> Result<Vec<u8>, String> {
    if tags.is_empty() {
        return Ok(Vec::new());
    }
    validate_ans104_tags(tags)?;

    // Single positive-count block + terminating 0 block.
    let mut out = Vec::with_capacity(tags.len() * 32);
    encode_avro_long(&mut out, tags.len());

    for tag in tags {
        let name_bytes = tag.name.as_bytes();
        let value_bytes = tag.value.as_bytes();

        encode_avro_long(&mut out, name_bytes.len());
        out.extend_from_slice(name_bytes);

        encode_avro_long(&mut out, value_bytes.len());
        out.extend_from_slice(value_bytes);
    }

    out.push(0); // end of array
    Ok(out)
}

#[derive(Debug, Clone)]
enum DeepHash<'a> {
    Blob(&'a [u8]),
    List(Vec<DeepHash<'a>>),
}

fn sha384_bytes(data: &[u8]) -> [u8; 48] {
    Sha384::digest(data).into()
}

fn deep_hash_sync(item: &DeepHash<'_>) -> [u8; 48] {
    match item {
        DeepHash::Blob(bytes) => deep_hash_blob(bytes),
        DeepHash::List(list) => deep_hash_list(list),
    }
}

fn deep_hash_blob(data: &[u8]) -> [u8; 48] {
    let tag = format!("blob{}", data.len());
    let hash_tag = sha384_bytes(tag.as_bytes());
    let hash_dat = sha384_bytes(data);

    let mut concat = Vec::with_capacity(96);
    concat.extend_from_slice(&hash_tag);
    concat.extend_from_slice(&hash_dat);
    sha384_bytes(&concat)
}

fn deep_hash_list(list: &[DeepHash<'_>]) -> [u8; 48] {
    let tag = format!("list{}", list.len());
    let mut acc = sha384_bytes(tag.as_bytes());

    for child in list {
        let child_hash = deep_hash_sync(child);

        let mut pair = Vec::with_capacity(96);
        pair.extend_from_slice(&acc);
        pair.extend_from_slice(&child_hash);

        acc = sha384_bytes(&pair);
    }
    acc
}

fn ans104_signing_message(owner: &[u8], tags: &[Ans104Tag], data: &[u8]) -> Result<[u8; 48], String> {
    let tags_bytes = encode_ans104_tags(tags)?;
    let signature_type = ANS104_SIGNATURE_TYPE_ETHEREUM.to_string();

    let dh = DeepHash::List(vec![
        DeepHash::Blob(b"dataitem"),
        DeepHash::Blob(b"1"),
        DeepHash::Blob(signature_type.as_bytes()),
        DeepHash::Blob(owner),
        DeepHash::Blob(&[]), // target bytes
        DeepHash::Blob(&[]), // anchor bytes
        DeepHash::Blob(tags_bytes.as_slice()),
        DeepHash::Blob(data),
    ]);

    Ok(deep_hash_sync(&dh))
}

fn ans104_to_bytes(signature: &[u8], owner: &[u8], tags: &[Ans104Tag], data: &[u8]) -> Result<Vec<u8>, String> {
    validate_ans104_tags(tags)?;

    if signature.len() != 65 {
        return Err(format!(
            "invalid signature length: expected 65 bytes, got {}",
            signature.len()
        ));
    }
    if owner.len() != 65 {
        return Err(format!(
            "invalid owner length: expected 65 bytes, got {}",
            owner.len()
        ));
    }

    let tags_bin = encode_ans104_tags(tags)?;
    let mut out = Vec::with_capacity(
        2 + signature.len() + owner.len() + 2 + 16 + tags_bin.len() + data.len(),
    );

    out.extend_from_slice(&ANS104_SIGNATURE_TYPE_ETHEREUM.to_le_bytes());
    out.extend_from_slice(signature);
    out.extend_from_slice(owner);

    out.push(0); // target absent
    out.push(0); // anchor absent

    out.extend_from_slice(&(tags.len() as u64).to_le_bytes());
    out.extend_from_slice(&(tags_bin.len() as u64).to_le_bytes());
    out.extend_from_slice(tags_bin.as_slice());

    out.extend_from_slice(data);
    Ok(out)
}

fn parse_tags_json(tags_json: &str) -> Result<Vec<Ans104Tag>, String> {
    let raw = tags_json.trim();
    if raw.is_empty() {
        return Ok(Vec::new());
    }

    let parsed: serde_json::Value = serde_json::from_str(raw)
        .map_err(|err| format!("invalid tags JSON: {err}"))?;
    let arr = parsed
        .as_array()
        .ok_or_else(|| "tagsJson must be a JSON array".to_string())?;

    let mut out = Vec::new();
    for tag in arr {
        let name = tag
            .get("name")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("");
        let value = tag
            .get("value")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("");
        if name.is_empty() || value.is_empty() {
            continue;
        }
        out.push(Ans104Tag::new(name, value));
    }
    Ok(out)
}

fn infer_content_type(file_path: &str) -> &'static str {
    let lower = file_path.to_ascii_lowercase();
    if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".m4a") {
        "audio/mp4"
    } else if lower.ends_with(".aac") {
        "audio/aac"
    } else if lower.ends_with(".flac") {
        "audio/flac"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".ogg") || lower.ends_with(".opus") {
        "audio/ogg"
    } else {
        "application/octet-stream"
    }
}

fn parse_pkp_public_key_bytes(pkp_public_key: &str) -> Result<Vec<u8>, String> {
    let raw = strip_0x(pkp_public_key.trim());
    let mut decoded =
        hex::decode(raw).map_err(|err| format!("invalid PKP public key hex: {err}"))?;
    if decoded.len() == 64 {
        decoded.insert(0, 0x04);
    }
    if decoded.len() != 65 {
        return Err(format!(
            "invalid PKP public key length: expected 64 or 65 bytes, got {}",
            decoded.len()
        ));
    }
    if decoded[0] != 0x04 {
        return Err("PKP public key must be uncompressed secp256k1 (0x04 prefix)".to_string());
    }
    Ok(decoded)
}

fn signature_hex_to_65_bytes(signature_hex: &str) -> Result<Vec<u8>, String> {
    let normalized = normalize_hex_like_string(signature_hex);
    let raw = strip_0x(normalized.trim());
    let decoded = hex::decode(raw).map_err(|err| format!("invalid signature hex: {err}"))?;
    if decoded.len() != 65 {
        return Err(format!(
            "invalid signature length: expected 65 bytes, got {}",
            decoded.len()
        ));
    }
    Ok(decoded)
}

fn parse_json_or_text(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({ "raw": raw }))
}

fn extract_gateway_base(payload: &serde_json::Value) -> Option<String> {
    let direct = payload
        .get("dataCaches")
        .or_else(|| payload.get("data_caches"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string);

    if direct.is_some() {
        return direct;
    }

    payload
        .get("gateway")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

fn extract_upload_id(payload: &serde_json::Value) -> Option<String> {
    let direct_keys = ["id", "dataitem_id", "dataitemId"];
    for key in direct_keys {
        if let Some(id) = payload.get(key).and_then(|v| v.as_str()) {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    if let Some(result) = payload.get("result") {
        for key in direct_keys {
            if let Some(id) = result.get(key).and_then(|v| v.as_str()) {
                let trimmed = id.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    None
}

fn normalize_bytes32_hex(value: &str, field_name: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{field_name} cannot be empty"));
    }

    let lower = trimmed.to_lowercase();
    if !lower.starts_with("0x") || lower.len() != 66 {
        return Err(format!(
            "invalid {field_name}: expected 0x-prefixed bytes32 hex, got \"{}\"",
            sanitize_error(trimmed)
        ));
    }
    if !lower[2..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!(
            "invalid {field_name}: expected hex digits, got \"{}\"",
            sanitize_error(trimmed)
        ));
    }
    Ok(lower)
}

fn build_content_decrypt_action_conditions(decrypt_cid: &str) -> Result<serde_json::Value, String> {
    let cid = decrypt_cid.trim();
    if cid.is_empty() {
        return Err("contentDecryptCid cannot be empty".to_string());
    }

    Ok(serde_json::json!([
        {
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "chain": "ethereum",
            "method": "",
            "parameters": [":currentActionIpfsId"],
            "returnValueTest": { "comparator": "=", "value": cid },
        }
    ]))
}

fn build_encrypted_content_blob(
    lit_ciphertext_b64: &str,
    data_to_encrypt_hash_hex: &str,
    iv: &[u8; 12],
    encrypted_audio: &[u8],
) -> Vec<u8> {
    let lit_ciphertext_bytes = lit_ciphertext_b64.as_bytes();
    let data_to_encrypt_hash_bytes = data_to_encrypt_hash_hex.as_bytes();

    let header_size = 4
        + lit_ciphertext_bytes.len()
        + 4
        + data_to_encrypt_hash_bytes.len()
        + 1
        + 1
        + iv.len()
        + 4;
    let mut out = Vec::with_capacity(header_size + encrypted_audio.len());

    out.extend_from_slice(&(lit_ciphertext_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(lit_ciphertext_bytes);

    out.extend_from_slice(&(data_to_encrypt_hash_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(data_to_encrypt_hash_bytes);

    out.push(ALGO_AES_GCM_256 as u8);
    out.push(iv.len() as u8);
    out.extend_from_slice(iv);

    out.extend_from_slice(&(encrypted_audio.len() as u32).to_be_bytes());
    out.extend_from_slice(encrypted_audio);
    out
}

async fn encrypt_audio_for_upload(
    lit_client: &LitClient,
    plaintext_audio: &[u8],
    content_id: &str,
    content_decrypt_cid: &str,
) -> Result<Vec<u8>, String> {
    let normalized_content_id = normalize_bytes32_hex(content_id, "contentId")?;

    let decrypt_cid = content_decrypt_cid.trim();
    let decrypt_cid = if decrypt_cid.is_empty() {
        DEFAULT_CONTENT_DECRYPT_V1_CID
    } else {
        decrypt_cid
    };

    let mut key = [0u8; 32];
    getrandom(&mut key).map_err(|err| format!("AES key generation failed: {err}"))?;
    let mut iv = [0u8; 12];
    getrandom(&mut iv).map_err(|err| format!("IV generation failed: {err}"))?;

    let cipher = aes_gcm::Aes256Gcm::new_from_slice(&key)
        .map_err(|err| format!("failed to init AES-256-GCM: {err}"))?;
    let encrypted_audio = cipher
        .encrypt(Nonce::from_slice(&iv), plaintext_audio)
        .map_err(|err| format!("AES-GCM encrypt failed: {err}"))?;

    let key_base64 = base64::engine::general_purpose::STANDARD.encode(key);
    key.fill(0);

    let payload = serde_json::json!({
        "contentId": normalized_content_id,
        "key": key_base64,
    });
    let payload_bytes = serde_json::to_vec(&payload)
        .map_err(|err| format!("failed to encode content key payload: {err}"))?;

    let conditions = build_content_decrypt_action_conditions(decrypt_cid)?;
    let encrypt_response = lit_client
        .encrypt(EncryptParams {
            data_to_encrypt: payload_bytes,
            unified_access_control_conditions: Some(conditions),
            hashed_access_control_conditions_hex: None,
            metadata: None,
        })
        .await
        .map_err(|err| format!("Lit encrypt failed: {err}"))?;

    Ok(build_encrypted_content_blob(
        encrypt_response.ciphertext_base64.as_str(),
        encrypt_response.data_to_encrypt_hash_hex.as_str(),
        &iv,
        encrypted_audio.as_slice(),
    ))
}

fn load_upload_impl(
    network: String,
    rpc_url: String,
    upload_url: String,
    upload_token: String,
    gateway_url_fallback: String,
    payload: Vec<u8>,
    file_path: String,
    content_type: String,
    tags_json: String,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let cached = get_cached_auth_context(network.as_str(), rpc_url.as_str())?;

        let mut tags = parse_tags_json(tags_json.as_str())?;

        if !tags
            .iter()
            .any(|tag| tag.name.eq_ignore_ascii_case("Content-Type"))
        {
            let hint = content_type.trim();
            let inferred = if !hint.is_empty() {
                hint
            } else {
                infer_content_type(file_path.as_str())
            };
            tags.insert(0, Ans104Tag::new("Content-Type", inferred));
        }

        let owner = parse_pkp_public_key_bytes(cached.pkp_public_key.as_str())?;

        let signing_message =
            ans104_signing_message(owner.as_slice(), tags.as_slice(), payload.as_slice())?;
        let digest = ethers::utils::hash_message(signing_message);
        let combined = lit_client
            .pkp_sign_ethereum_with_options(
                cached.pkp_public_key.as_str(),
                digest.as_bytes(),
                &cached.auth_context,
                None,
                true, // bypass_auto_hashing — payload is already hashed
            )
            .await
            .map_err(|err| format!("pkpSign failed: {err}"))?;

        let signature_hex = signature_from_combined_value(&combined)?;
        let signature_bytes = signature_hex_to_65_bytes(signature_hex.as_str())?;
        let signed_dataitem = ans104_to_bytes(
            signature_bytes.as_slice(),
            owner.as_slice(),
            tags.as_slice(),
            payload.as_slice(),
        )?;

        let endpoint = format!(
            "{}/v1/tx/{}",
            upload_url.trim_end_matches('/'),
            upload_token.trim()
        );

        let http = reqwest::Client::new();
        let resp = http
            .post(endpoint.as_str())
            .header("Content-Type", "application/octet-stream")
            .body(signed_dataitem)
            .send()
            .await
            .map_err(|err| format!("Load upload request failed: {err}"))?;

        let status = resp.status();
        let body_raw = resp
            .text()
            .await
            .map_err(|err| format!("Load upload response body failed: {err}"))?;
        let body = parse_json_or_text(body_raw.as_str());

        if !status.is_success() {
            let message = body
                .get("error")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("Load upload failed with status {status}"));
            return Err(format!("{message}; endpoint={endpoint}"));
        }

        let id = extract_upload_id(&body)
            .ok_or_else(|| "Upload succeeded but no dataitem id was returned".to_string())?;
        let gateway_base = extract_gateway_base(&body).unwrap_or_else(|| {
            let fallback = gateway_url_fallback.trim();
            if fallback.is_empty() {
                DEFAULT_LOAD_GATEWAY_URL.to_string()
            } else {
                fallback.to_string()
            }
        });
        let gateway_url = format!("{}/resolve/{}", gateway_base.trim_end_matches('/'), id);

        let winc = body
            .get("winc")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        Ok::<LoadUploadResult, String>(LoadUploadResult {
            id,
            gateway_url,
            winc,
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn load_encrypt_upload_impl(
    network: String,
    rpc_url: String,
    upload_url: String,
    upload_token: String,
    gateway_url_fallback: String,
    payload: Vec<u8>,
    content_id: String,
    content_decrypt_cid: String,
    file_path: String,
    content_type: String,
    tags_json: String,
) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let cached = get_cached_auth_context(network.as_str(), rpc_url.as_str())?;

        let encrypted_blob = encrypt_audio_for_upload(
            &lit_client,
            payload.as_slice(),
            content_id.as_str(),
            content_decrypt_cid.as_str(),
        )
        .await?;

        let mut tags = parse_tags_json(tags_json.as_str())?;

        if !tags
            .iter()
            .any(|tag| tag.name.eq_ignore_ascii_case("Content-Type"))
        {
            let hint = content_type.trim();
            let inferred = if !hint.is_empty() {
                hint
            } else {
                infer_content_type(file_path.as_str())
            };
            tags.insert(0, Ans104Tag::new("Content-Type", inferred));
        }

        let owner = parse_pkp_public_key_bytes(cached.pkp_public_key.as_str())?;

        let signing_message = ans104_signing_message(
            owner.as_slice(),
            tags.as_slice(),
            encrypted_blob.as_slice(),
        )?;
        let digest = ethers::utils::hash_message(signing_message);
        let combined = lit_client
            .pkp_sign_ethereum_with_options(
                cached.pkp_public_key.as_str(),
                digest.as_bytes(),
                &cached.auth_context,
                None,
                true, // bypass_auto_hashing — payload is already hashed
            )
            .await
            .map_err(|err| format!("pkpSign failed: {err}"))?;

        let signature_hex = signature_from_combined_value(&combined)?;
        let signature_bytes = signature_hex_to_65_bytes(signature_hex.as_str())?;
        let signed_dataitem = ans104_to_bytes(
            signature_bytes.as_slice(),
            owner.as_slice(),
            tags.as_slice(),
            encrypted_blob.as_slice(),
        )?;

        let endpoint = format!(
            "{}/v1/tx/{}",
            upload_url.trim_end_matches('/'),
            upload_token.trim()
        );

        let http = reqwest::Client::new();
        let resp = http
            .post(endpoint.as_str())
            .header("Content-Type", "application/octet-stream")
            .body(signed_dataitem)
            .send()
            .await
            .map_err(|err| format!("Load upload request failed: {err}"))?;

        let status = resp.status();
        let body_raw = resp
            .text()
            .await
            .map_err(|err| format!("Load upload response body failed: {err}"))?;
        let body = parse_json_or_text(body_raw.as_str());

        if !status.is_success() {
            let message = body
                .get("error")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("Load upload failed with status {status}"));
            return Err(format!("{message}; endpoint={endpoint}"));
        }

        let id = extract_upload_id(&body)
            .ok_or_else(|| "Upload succeeded but no dataitem id was returned".to_string())?;
        let gateway_base = extract_gateway_base(&body).unwrap_or_else(|| {
            let fallback = gateway_url_fallback.trim();
            if fallback.is_empty() {
                DEFAULT_LOAD_GATEWAY_URL.to_string()
            } else {
                fallback.to_string()
            }
        });
        let gateway_url = format!("{}/resolve/{}", gateway_base.trim_end_matches('/'), id);

        let winc = body
            .get("winc")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        Ok::<LoadUploadResult, String>(LoadUploadResult {
            id,
            gateway_url,
            winc,
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

const ALGO_AES_GCM_256: u32 = 1;

#[derive(Debug, Clone)]
struct ParsedContentHeader {
    lit_ciphertext: String,
    lit_data_to_encrypt_hash: String,
    algo: u32,
    iv: Vec<u8>,
    audio_len: usize,
    audio_offset: usize,
}

fn parse_u32_be(blob: &[u8], offset: usize) -> Result<u32, String> {
    if blob.len() < offset + 4 {
        return Err("blob truncated".to_string());
    }
    Ok(u32::from_be_bytes([
        blob[offset],
        blob[offset + 1],
        blob[offset + 2],
        blob[offset + 3],
    ]))
}

fn parse_content_header(blob: &[u8]) -> Result<ParsedContentHeader, String> {
    if blob.len() < 10 {
        return Err(format!(
            "blob too small to contain a valid header ({} bytes)",
            blob.len()
        ));
    }

    let mut offset = 0usize;
    let ct_len = parse_u32_be(blob, offset)? as usize;
    offset += 4;
    if ct_len == 0 || offset + ct_len > blob.len() {
        return Err(format!("invalid litCiphertext length: {ct_len}"));
    }
    let lit_ciphertext = String::from_utf8(blob[offset..offset + ct_len].to_vec())
        .map_err(|_| "litCiphertext is not valid UTF-8".to_string())?;
    offset += ct_len;

    let hash_len = parse_u32_be(blob, offset)? as usize;
    offset += 4;
    if hash_len == 0 || offset + hash_len > blob.len() {
        return Err(format!("invalid dataToEncryptHash length: {hash_len}"));
    }
    let lit_data_to_encrypt_hash = String::from_utf8(blob[offset..offset + hash_len].to_vec())
        .map_err(|_| "dataToEncryptHash is not valid UTF-8".to_string())?;
    offset += hash_len;

    if offset + 2 > blob.len() {
        return Err("blob truncated before algo/ivLen".to_string());
    }
    let algo = blob[offset] as u32;
    offset += 1;
    let iv_len = blob[offset] as usize;
    offset += 1;
    if iv_len == 0 || offset + iv_len > blob.len() {
        return Err(format!("invalid IV length: {iv_len}"));
    }
    let iv = blob[offset..offset + iv_len].to_vec();
    offset += iv_len;

    let audio_len = parse_u32_be(blob, offset)? as usize;
    offset += 4;
    if audio_len == 0 || offset + audio_len > blob.len() {
        return Err(format!(
            "invalid audioLen: {audio_len} (available: {})",
            blob.len().saturating_sub(offset)
        ));
    }

    Ok(ParsedContentHeader {
        lit_ciphertext,
        lit_data_to_encrypt_hash,
        algo,
        iv,
        audio_len,
        audio_offset: offset,
    })
}

fn sniff_audio_mime(bytes: &[u8]) -> Option<String> {
    if bytes.len() >= 3 && bytes[0] == 0x49 && bytes[1] == 0x44 && bytes[2] == 0x33 {
        return Some("audio/mpeg".to_string());
    }
    if bytes.len() >= 2 && bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0 {
        return Some("audio/mpeg".to_string());
    }
    if bytes.len() >= 4 && bytes[0] == 0x66 && bytes[1] == 0x4c && bytes[2] == 0x61 && bytes[3] == 0x43 {
        return Some("audio/flac".to_string());
    }
    if bytes.len() >= 4 && bytes[0] == 0x4f && bytes[1] == 0x67 && bytes[2] == 0x67 && bytes[3] == 0x53 {
        return Some("audio/ogg".to_string());
    }
    if bytes.len() >= 12
        && bytes[0] == 0x52
        && bytes[1] == 0x49
        && bytes[2] == 0x46
        && bytes[3] == 0x46
        && bytes[8] == 0x57
        && bytes[9] == 0x41
        && bytes[10] == 0x56
        && bytes[11] == 0x45
    {
        return Some("audio/wav".to_string());
    }
    if bytes.len() >= 12 && bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70 {
        return Some("audio/mp4".to_string());
    }
    None
}

fn build_content_url(
    dataset_owner: &str,
    piece_cid: &str,
    network: &str,
    gateway_url: Option<&str>,
) -> Result<String, String> {
    let is_filecoin_piece_cid =
        piece_cid.starts_with("baga") || piece_cid.starts_with("bafy") || piece_cid.starts_with("Qm");
    if is_filecoin_piece_cid {
        if dataset_owner.trim().is_empty() {
            return Err("missing datasetOwner for Filecoin piece CID".to_string());
        }
        let host = if network == "calibration" {
            "calibration.filbeam.io"
        } else {
            "filbeam.io"
        };
        return Ok(format!("https://{}.{}{}", dataset_owner, host, format!("/{}", piece_cid)));
    }

    let normalized_gateway = gateway_url
        .unwrap_or("https://gateway.s3-node-1.load.network")
        .trim_end_matches('/')
        .to_string();
    Ok(format!("{}/resolve/{}", normalized_gateway, piece_cid))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FetchAndDecryptContentParams {
    #[serde(default)]
    dataset_owner: String,
    piece_cid: String,
    content_id: String,
    user_pkp_public_key: String,
    content_decrypt_cid: String,
    #[serde(default = "default_content_algo")]
    algo: u32,
    #[serde(default)]
    network: String,
    gateway_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecryptedPayload {
    key: Option<String>,
    content_id: Option<String>,
}

fn fetch_and_decrypt_content_impl(network: String, rpc_url: String, params_json: String) -> String {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(err) => {
            return err_json(format!(
                "failed to create tokio runtime: {}",
                sanitize_error(&err.to_string())
            ));
        }
    };

    let result = runtime.block_on(async {
        let lit_client = get_or_create_lit_client(network.as_str(), rpc_url.as_str()).await?;
        let cached = get_cached_auth_context(network.as_str(), rpc_url.as_str())?;

        let mut params: FetchAndDecryptContentParams =
            serde_json::from_str(params_json.as_str()).map_err(|err| format!("invalid params JSON: {err}"))?;
        if params.network.trim().is_empty() {
            params.network = "mainnet".to_string();
        }

        let piece_cid = params.piece_cid.trim();
        if piece_cid.is_empty() {
            return Err("missing pieceCid".to_string());
        }
        let content_id = params.content_id.trim().to_lowercase();
        if !content_id.starts_with("0x") || content_id.len() != 66 {
            return Err(format!("invalid contentId: \"{}\"", sanitize_error(content_id.as_str())));
        }

        let requested_algo = params.algo;
        let source_url = build_content_url(
            params.dataset_owner.as_str(),
            piece_cid,
            if params.network == "calibration" {
                "calibration"
            } else {
                "mainnet"
            },
            params.gateway_url.as_deref(),
        )?;

        let http = reqwest::Client::new();
        let resp = http
            .get(source_url.as_str())
            .send()
            .await
            .map_err(|err| format!("cloud fetch failed: {err}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "cloud fetch failed: {} {}",
                resp.status(),
                resp.status().canonical_reason().unwrap_or("")
            ));
        }
        let blob = resp
            .bytes()
            .await
            .map_err(|err| format!("cloud fetch body failed: {err}"))?
            .to_vec();

        // Plaintext mode (algo=0) skips Lit key decryption.
        if requested_algo == 0 {
            let mime_type = sniff_audio_mime(blob.as_slice());
            let audio_base64 = base64::engine::general_purpose::STANDARD.encode(blob.as_slice());
            return Ok::<FetchAndDecryptContentResult, String>(FetchAndDecryptContentResult {
                audio_base64,
                bytes: blob.len(),
                mime_type,
                source_url,
            });
        }

        if requested_algo != ALGO_AES_GCM_256 {
            return Err(format!("unsupported content algorithm: {}", requested_algo));
        }
        if params.content_decrypt_cid.trim().is_empty() {
            return Err("missing contentDecryptCid".to_string());
        }

        let header = parse_content_header(blob.as_slice())?;
        if header.algo != ALGO_AES_GCM_256 {
            return Err(format!("unsupported encrypted content algorithm: {}", header.algo));
        }

        let user_pkp_public_key = strip_0x(params.user_pkp_public_key.trim()).to_string();
        if user_pkp_public_key.is_empty() {
            return Err("missing userPkpPublicKey".to_string());
        }

        let timestamp = chrono::Utc::now().timestamp_millis();
        let nonce_id = uuid::Uuid::new_v4().to_string();
        let decrypt_result = lit_client
            .execute_js(
                None,
                Some(params.content_decrypt_cid.clone()),
                Some(serde_json::json!({
                    "userPkpPublicKey": user_pkp_public_key,
                    "contentId": content_id,
                    "ciphertext": header.lit_ciphertext,
                    "dataToEncryptHash": header.lit_data_to_encrypt_hash,
                    "decryptCid": params.content_decrypt_cid,
                    "timestamp": timestamp,
                    "nonce": nonce_id,
                })),
                &cached.auth_context,
            )
            .await
            .map_err(|err| format!("content decrypt Lit Action failed: {err}"))?;

        let response_val = decrypt_result.response;
        let decrypt_response: serde_json::Value = if let Some(text) = response_val.as_str() {
            serde_json::from_str(text).map_err(|_| "Lit Action returned non-JSON response".to_string())?
        } else {
            response_val
        };
        if decrypt_response
            .get("success")
            .and_then(|v| v.as_bool())
            != Some(true)
        {
            let msg = decrypt_response
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            return Err(format!("content decrypt failed: {}", sanitize_error(msg)));
        }
        let decrypted_payload_raw = decrypt_response
            .get("decryptedPayload")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if decrypted_payload_raw.trim().is_empty() {
            return Err("content decrypt response missing decryptedPayload".to_string());
        }

        let decrypted_payload: DecryptedPayload = serde_json::from_str(decrypted_payload_raw)
            .map_err(|_| "decrypted payload is not valid JSON".to_string())?;
        let key_b64 = decrypted_payload
            .key
            .ok_or_else(|| "decrypted payload missing AES key".to_string())?;
        if let Some(payload_cid) = decrypted_payload.content_id {
            if payload_cid.to_lowercase() != content_id {
                return Err("contentId mismatch in decrypted payload".to_string());
            }
        }

        let raw_key = base64::engine::general_purpose::STANDARD
            .decode(key_b64.as_bytes())
            .map_err(|_| "invalid AES key base64".to_string())?;
        if raw_key.len() != 32 {
            return Err(format!("invalid AES key length: {}", raw_key.len()));
        }
        if header.iv.len() != 12 {
            return Err(format!("invalid IV length: {}", header.iv.len()));
        }

        let cipher = aes_gcm::Aes256Gcm::new_from_slice(raw_key.as_slice())
            .map_err(|_| "failed to init AES-256-GCM".to_string())?;
        let nonce = aes_gcm::Nonce::from_slice(header.iv.as_slice());
        let encrypted_audio =
            &blob[header.audio_offset..(header.audio_offset + header.audio_len)];
        let audio_bytes = cipher
            .decrypt(nonce, encrypted_audio)
            .map_err(|_| "AES-GCM decrypt failed".to_string())?;

        let mime_type = sniff_audio_mime(audio_bytes.as_slice());
        let audio_base64 = base64::engine::general_purpose::STANDARD.encode(audio_bytes.as_slice());
        Ok::<FetchAndDecryptContentResult, String>(FetchAndDecryptContentResult {
            audio_base64,
            bytes: audio_bytes.len(),
            mime_type,
            source_url,
        })
    });

    match result {
        Ok(value) => ok_json(value),
        Err(err) => err_json(sanitize_error(err.as_str())),
    }
}

fn default_content_algo() -> u32 {
    ALGO_AES_GCM_256
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_healthcheck() -> *mut c_char {
    into_c_string(healthcheck_impl())
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_create_eth_wallet_auth_data(
    private_key_hex: *const c_char,
    nonce: *const c_char,
) -> *mut c_char {
    let private_key_hex = match parse_c_string_arg(private_key_hex, "privateKeyHex") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let nonce = match parse_c_string_arg(nonce, "nonce") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(create_eth_wallet_auth_data_impl(private_key_hex, nonce))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_test_connect(
    network: *const c_char,
    rpc_url: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(test_connect_impl(network, rpc_url))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_mint_pkp_and_create_auth_context(
    network: *const c_char,
    rpc_url: *const c_char,
    private_key_hex: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let private_key_hex = match parse_c_string_arg(private_key_hex, "privateKeyHex") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(mint_pkp_and_create_auth_context_impl(
        network,
        rpc_url,
        private_key_hex,
    ))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_create_auth_context_from_passkey_callback(
    network: *const c_char,
    rpc_url: *const c_char,
    pkp_public_key: *const c_char,
    auth_method_type: *const c_char,
    auth_method_id: *const c_char,
    access_token: *const c_char,
    auth_config_json: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let pkp_public_key = match parse_c_string_arg(pkp_public_key, "pkpPublicKey") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let auth_method_type = match parse_c_string_arg(auth_method_type, "authMethodType") {
        Ok(value) => match value.parse::<u32>() {
            Ok(parsed) => parsed,
            Err(_) => return into_c_string(err_json("authMethodType must be a positive integer")),
        },
        Err(err) => return into_c_string(err_json(err)),
    };
    let auth_method_id = match parse_c_string_arg(auth_method_id, "authMethodId") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let access_token = match parse_c_string_arg(access_token, "accessToken") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let auth_config_json = match parse_c_string_arg(auth_config_json, "authConfigJson") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(create_auth_context_from_passkey_callback_impl(
        network,
        rpc_url,
        pkp_public_key,
        auth_method_type,
        auth_method_id,
        access_token,
        auth_config_json,
    ))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_clear_auth_context() -> *mut c_char {
    into_c_string(clear_auth_context_impl())
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_view_pkps_by_auth_data(
    network: *const c_char,
    rpc_url: *const c_char,
    auth_method_type: *const c_char,
    auth_method_id: *const c_char,
    limit: *const c_char,
    offset: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let auth_method_type = match parse_c_string_arg(auth_method_type, "authMethodType") {
        Ok(value) => match value.parse::<u32>() {
            Ok(parsed) => parsed,
            Err(_) => return into_c_string(err_json("authMethodType must be a positive integer")),
        },
        Err(err) => return into_c_string(err_json(err)),
    };
    let auth_method_id = match parse_c_string_arg(auth_method_id, "authMethodId") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let limit = match parse_c_string_arg(limit, "limit") {
        Ok(value) => match value.parse::<usize>() {
            Ok(parsed) => parsed,
            Err(_) => return into_c_string(err_json("limit must be a positive integer")),
        },
        Err(err) => return into_c_string(err_json(err)),
    };
    let offset = match parse_c_string_arg(offset, "offset") {
        Ok(value) => match value.parse::<usize>() {
            Ok(parsed) => parsed,
            Err(_) => return into_c_string(err_json("offset must be a positive integer")),
        },
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(view_pkps_by_auth_data_impl(
        network,
        rpc_url,
        auth_method_type,
        auth_method_id,
        limit,
        offset,
    ))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_execute_js(
    network: *const c_char,
    rpc_url: *const c_char,
    code: *const c_char,
    ipfs_id: *const c_char,
    js_params_json: *const c_char,
    use_single_node: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let code = match parse_c_string_arg_allow_empty(code, "code") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let ipfs_id = match parse_c_string_arg_allow_empty(ipfs_id, "ipfsId") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let js_params_json = match parse_c_string_arg_allow_empty(js_params_json, "jsParamsJson") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let use_single_node = match parse_c_string_arg_allow_empty(use_single_node, "useSingleNode") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let use_single_node = matches!(
        use_single_node.to_lowercase().as_str(),
        "1" | "true" | "yes" | "y"
    );

    into_c_string(execute_js_impl(
        network,
        rpc_url,
        code,
        ipfs_id,
        js_params_json,
        use_single_node,
    ))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_sign_message(
    network: *const c_char,
    rpc_url: *const c_char,
    message: *const c_char,
    public_key: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let message = match parse_c_string_arg_allow_empty(message, "message") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let public_key = match parse_c_string_arg_allow_empty(public_key, "publicKey") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(sign_message_impl(network, rpc_url, message, public_key))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_fetch_and_decrypt_content(
    network: *const c_char,
    rpc_url: *const c_char,
    params_json: *const c_char,
) -> *mut c_char {
    let network = match parse_c_string_arg(network, "network") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let rpc_url = match parse_c_string_arg(rpc_url, "rpcUrl") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };
    let params_json = match parse_c_string_arg(params_json, "paramsJson") {
        Ok(value) => value,
        Err(err) => return into_c_string(err_json(err)),
    };

    into_c_string(fetch_and_decrypt_content_impl(network, rpc_url, params_json))
}

#[no_mangle]
pub extern "C" fn heaven_lit_rust_free_string(value: *mut c_char) {
    if value.is_null() {
        return;
    }

    unsafe {
        let _ = CString::from_raw(value);
    }
}

#[cfg(target_os = "android")]
mod android_jni {
    use super::{
        clear_auth_context_impl, create_auth_context_from_passkey_callback_impl,
        create_eth_wallet_auth_data_impl, execute_js_impl, fetch_and_decrypt_content_impl,
        healthcheck_impl, load_encrypt_upload_impl, load_upload_impl,
        mint_pkp_and_create_auth_context_impl, sign_message_impl, test_connect_impl,
        view_pkps_by_auth_data_impl,
    };
    use jni::objects::{JByteArray, JObject, JString};
    use jni::sys::jstring;
    use jni::JNIEnv;

    fn from_jstring(
        env: &mut JNIEnv<'_>,
        value: JString<'_>,
        field_name: &str,
    ) -> Result<String, String> {
        let parsed: String = env
            .get_string(&value)
            .map_err(|err| format!("failed to read {field_name}: {err}"))?
            .into();
        let parsed = parsed.trim().to_string();

        if parsed.is_empty() {
            return Err(format!("{field_name} cannot be empty"));
        }

        Ok(parsed)
    }

    fn from_jstring_allow_empty(
        env: &mut JNIEnv<'_>,
        value: JString<'_>,
        field_name: &str,
    ) -> Result<String, String> {
        let parsed: String = env
            .get_string(&value)
            .map_err(|err| format!("failed to read {field_name}: {err}"))?
            .into();
        Ok(parsed.trim().to_string())
    }

    fn to_jstring(env: &mut JNIEnv<'_>, value: String) -> jstring {
        match env.new_string(value) {
            Ok(value) => value.into_raw(),
            Err(_) => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeHealthcheck(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
    ) -> jstring {
        to_jstring(&mut env, healthcheck_impl())
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeCreateEthWalletAuthData(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        private_key_hex: JString<'_>,
        nonce: JString<'_>,
    ) -> jstring {
        let private_key_hex = match from_jstring(&mut env, private_key_hex, "privateKeyHex") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let nonce = match from_jstring(&mut env, nonce, "nonce") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            create_eth_wallet_auth_data_impl(private_key_hex, nonce),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeTestConnect(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(&mut env, test_connect_impl(network, rpc_url))
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeMintPkpAndCreateAuthContext(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        private_key_hex: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let private_key_hex = match from_jstring(&mut env, private_key_hex, "privateKeyHex") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            mint_pkp_and_create_auth_context_impl(network, rpc_url, private_key_hex),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeCreateAuthContextFromPasskeyCallback(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        pkp_public_key: JString<'_>,
        auth_method_type: JString<'_>,
        auth_method_id: JString<'_>,
        access_token: JString<'_>,
        auth_config_json: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let pkp_public_key = match from_jstring(&mut env, pkp_public_key, "pkpPublicKey") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let auth_method_type = match from_jstring(&mut env, auth_method_type, "authMethodType") {
            Ok(value) => match value.parse::<u32>() {
                Ok(parsed) => parsed,
                Err(_) => {
                    return to_jstring(
                        &mut env,
                        r#"{"ok":false,"error":"authMethodType must be a positive integer"}"#
                            .to_string(),
                    )
                }
            },
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let auth_method_id = match from_jstring(&mut env, auth_method_id, "authMethodId") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let access_token = match from_jstring(&mut env, access_token, "accessToken") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let auth_config_json = match from_jstring(&mut env, auth_config_json, "authConfigJson") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            create_auth_context_from_passkey_callback_impl(
                network,
                rpc_url,
                pkp_public_key,
                auth_method_type,
                auth_method_id,
                access_token,
                auth_config_json,
            ),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeClearAuthContext(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
    ) -> jstring {
        to_jstring(&mut env, clear_auth_context_impl())
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeViewPKPsByAuthData(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        auth_method_type: JString<'_>,
        auth_method_id: JString<'_>,
        limit: JString<'_>,
        offset: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let auth_method_type =
            match from_jstring(&mut env, auth_method_type, "authMethodType") {
                Ok(value) => match value.parse::<u32>() {
                    Ok(parsed) => parsed,
                    Err(_) => {
                        return to_jstring(
                            &mut env,
                            r#"{"ok":false,"error":"authMethodType must be a positive integer"}"#
                                .to_string(),
                        )
                    }
                },
                Err(err) => {
                    return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
                }
            };
        let auth_method_id = match from_jstring(&mut env, auth_method_id, "authMethodId") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let limit = match from_jstring(&mut env, limit, "limit") {
            Ok(value) => match value.parse::<usize>() {
                Ok(parsed) => parsed,
                Err(_) => {
                    return to_jstring(
                        &mut env,
                        r#"{"ok":false,"error":"limit must be a positive integer"}"#.to_string(),
                    )
                }
            },
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let offset = match from_jstring(&mut env, offset, "offset") {
            Ok(value) => match value.parse::<usize>() {
                Ok(parsed) => parsed,
                Err(_) => {
                    return to_jstring(
                        &mut env,
                        r#"{"ok":false,"error":"offset must be a positive integer"}"#.to_string(),
                    )
                }
            },
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            view_pkps_by_auth_data_impl(
                network,
                rpc_url,
                auth_method_type,
                auth_method_id,
                limit,
                offset,
            ),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeExecuteJs(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        code: JString<'_>,
        ipfs_id: JString<'_>,
        js_params_json: JString<'_>,
        use_single_node: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let code = match from_jstring_allow_empty(&mut env, code, "code") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let ipfs_id = match from_jstring_allow_empty(&mut env, ipfs_id, "ipfsId") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let js_params_json = match from_jstring_allow_empty(&mut env, js_params_json, "jsParamsJson")
        {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let use_single_node = match from_jstring_allow_empty(&mut env, use_single_node, "useSingleNode")
        {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let use_single_node = matches!(
            use_single_node.to_lowercase().as_str(),
            "1" | "true" | "yes" | "y"
        );

        to_jstring(
            &mut env,
            execute_js_impl(
                network,
                rpc_url,
                code,
                ipfs_id,
                js_params_json,
                use_single_node,
            ),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeSignMessage(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        message: JString<'_>,
        public_key: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let message = match from_jstring_allow_empty(&mut env, message, "message") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let public_key = match from_jstring_allow_empty(&mut env, public_key, "publicKey") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(&mut env, sign_message_impl(network, rpc_url, message, public_key))
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeLoadUpload(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        upload_url: JString<'_>,
        upload_token: JString<'_>,
        gateway_url_fallback: JString<'_>,
        payload: JByteArray<'_>,
        file_path: JString<'_>,
        content_type: JString<'_>,
        tags_json: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let upload_url = match from_jstring(&mut env, upload_url, "uploadUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let upload_token = match from_jstring(&mut env, upload_token, "uploadToken") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let gateway_url_fallback =
            match from_jstring_allow_empty(&mut env, gateway_url_fallback, "gatewayUrlFallback")
            {
                Ok(value) => value,
                Err(err) => {
                    return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
                }
            };
        let payload = match env.convert_byte_array(&payload) {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(
                    &mut env,
                    format!(
                        r#"{{"ok":false,"error":"failed to read payload bytes: {}"}}"#,
                        err
                    ),
                )
            }
        };
        let file_path = match from_jstring_allow_empty(&mut env, file_path, "filePath") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let content_type = match from_jstring_allow_empty(&mut env, content_type, "contentType") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let tags_json = match from_jstring_allow_empty(&mut env, tags_json, "tagsJson") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            load_upload_impl(
                network,
                rpc_url,
                upload_url,
                upload_token,
                gateway_url_fallback,
                payload,
                file_path,
                content_type,
                tags_json,
            ),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeLoadEncryptUpload(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        upload_url: JString<'_>,
        upload_token: JString<'_>,
        gateway_url_fallback: JString<'_>,
        payload: JByteArray<'_>,
        content_id: JString<'_>,
        content_decrypt_cid: JString<'_>,
        file_path: JString<'_>,
        content_type: JString<'_>,
        tags_json: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let upload_url = match from_jstring(&mut env, upload_url, "uploadUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let upload_token = match from_jstring(&mut env, upload_token, "uploadToken") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let gateway_url_fallback =
            match from_jstring_allow_empty(&mut env, gateway_url_fallback, "gatewayUrlFallback")
            {
                Ok(value) => value,
                Err(err) => {
                    return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
                }
            };
        let payload = match env.convert_byte_array(&payload) {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(
                    &mut env,
                    format!(
                        r#"{{"ok":false,"error":"failed to read payload bytes: {}"}}"#,
                        err
                    ),
                )
            }
        };
        let content_id = match from_jstring_allow_empty(&mut env, content_id, "contentId") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let content_decrypt_cid =
            match from_jstring_allow_empty(&mut env, content_decrypt_cid, "contentDecryptCid") {
                Ok(value) => value,
                Err(err) => {
                    return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
                }
            };
        let file_path = match from_jstring_allow_empty(&mut env, file_path, "filePath") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let content_type = match from_jstring_allow_empty(&mut env, content_type, "contentType") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let tags_json = match from_jstring_allow_empty(&mut env, tags_json, "tagsJson") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            load_encrypt_upload_impl(
                network,
                rpc_url,
                upload_url,
                upload_token,
                gateway_url_fallback,
                payload,
                content_id,
                content_decrypt_cid,
                file_path,
                content_type,
                tags_json,
            ),
        )
    }

    #[no_mangle]
    pub extern "system" fn Java_expo_modules_heavenlitrust_HeavenLitRustModule_nativeFetchAndDecryptContent(
        mut env: JNIEnv<'_>,
        _this: JObject<'_>,
        network: JString<'_>,
        rpc_url: JString<'_>,
        params_json: JString<'_>,
    ) -> jstring {
        let network = match from_jstring(&mut env, network, "network") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let rpc_url = match from_jstring(&mut env, rpc_url, "rpcUrl") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };
        let params_json = match from_jstring(&mut env, params_json, "paramsJson") {
            Ok(value) => value,
            Err(err) => {
                return to_jstring(&mut env, format!(r#"{{"ok":false,"error":"{}"}}"#, err))
            }
        };

        to_jstring(
            &mut env,
            fetch_and_decrypt_content_impl(network, rpc_url, params_json),
        )
    }
}
