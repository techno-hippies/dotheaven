//! Lit wallet/auth/action service for GPUI.
//!
//! This module provides a thin synchronous facade over `lit-rust-sdk` so the
//! GPUI app can:
//! - build PKP auth context from persisted auth data
//! - execute Lit Actions natively from Rust
//! - sign payloads with PKP (via Lit nodes)

use std::env;

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

    pub fn initialize_from_auth(&mut self, persisted: &PersistedAuth) -> Result<LitInitStatus, String> {
        let pkp_public_key = persisted
            .pkp_public_key
            .clone()
            .ok_or("Missing PKP public key in persisted auth")?;
        let pkp_address = persisted
            .pkp_address
            .clone()
            .ok_or("Missing PKP address in persisted auth")?;
        let auth_method_id = persisted
            .auth_method_id
            .clone()
            .ok_or("Missing authMethodId in persisted auth")?;
        let auth_method_type = persisted
            .auth_method_type
            .ok_or("Missing authMethodType in persisted auth")?;
        let access_token = persisted
            .access_token
            .clone()
            .ok_or("Missing accessToken in persisted auth")?;

        let network_name = lit_network_name();
        let rpc_url = resolve_lit_rpc_url().ok_or_else(|| {
            "Missing Lit RPC URL. Set HEAVEN_LIT_RPC_URL or LIT_RPC_URL (or LIT_TXSENDER_RPC_URL / LIT_YELLOWSTONE_PRIVATE_RPC_URL / LOCAL_RPC_URL).".to_string()
        })?;

        let config = config_for_network(&network_name)?
            .with_rpc_url(rpc_url);

        let auth_data = AuthData {
            auth_method_id,
            auth_method_type,
            access_token,
            public_key: None,
            metadata: None,
        };

        let auth_config = default_auth_config();

        let pkp_public_key_for_call = pkp_public_key.clone();
        let (client, auth_context) = self
            .runtime
            .block_on(async move {
                let client = create_lit_client(config).await?;
                let auth_context = client
                    .create_pkp_auth_context(
                        &pkp_public_key_for_call,
                        auth_data,
                        auth_config,
                        None,
                        None,
                        None,
                    )
                    .await?;
                Ok::<(LitClient, AuthContext), lit_rust_sdk::LitSdkError>((client, auth_context))
            })
            .map_err(|e| format!("Failed to initialize Lit auth context: {e}"))?;

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
            .block_on(async move { client.execute_js(Some(code), None, js_params, &auth_context).await })
            .map_err(|e| format!("executeJs failed: {e}"))
    }

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
                    .pkp_sign_ethereum(&pkp_public_key, &bytes, &auth_context, None)
                    .await
            })
            .map_err(|e| format!("pkpSignEthereum failed: {e}"))
    }

    pub fn network_name(&self) -> Option<&str> {
        self.network.as_deref()
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
