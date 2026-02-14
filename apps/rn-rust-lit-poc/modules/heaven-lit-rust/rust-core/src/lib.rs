use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex, OnceLock};

use ethers::prelude::{Http, Provider, SignerMiddleware, U256};
use ethers::providers::Middleware;
use ethers::signers::{LocalWallet, Signer};

use lit_rust_sdk::{
    create_eth_wallet_auth_data, create_lit_client, naga_dev, naga_mainnet, naga_proto,
    naga_staging, naga_test, AuthConfig, AuthData, LitAbility, LitClient, PkpMintManager,
    ResourceAbilityRequest,
};
use serde::Serialize;

const BRIDGE_VERSION: &str = "0.1.0";

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
    domain: String,
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

        let auth_data = AuthData {
            auth_method_id: auth_method_id.clone(),
            auth_method_type,
            access_token,
            public_key: None,
            metadata: None,
        };

        let auth_config = AuthConfig {
            capability_auth_sigs: vec![],
            expiration: default_auth_expiration(),
            statement: "RN Rust Lit PoC - Browser passkey auth context".to_string(),
            domain,
            resources: vec![ResourceAbilityRequest {
                ability: LitAbility::PKPSigning,
                resource_id: "*".to_string(),
                data: None,
            }],
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
    domain: *const c_char,
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
    let domain = match parse_c_string_arg(domain, "domain") {
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
        domain,
    ))
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
        create_auth_context_from_passkey_callback_impl, create_eth_wallet_auth_data_impl,
        healthcheck_impl, mint_pkp_and_create_auth_context_impl, test_connect_impl,
    };
    use jni::objects::{JObject, JString};
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
        domain: JString<'_>,
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
        let domain = match from_jstring(&mut env, domain, "domain") {
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
                domain,
            ),
        )
    }
}
