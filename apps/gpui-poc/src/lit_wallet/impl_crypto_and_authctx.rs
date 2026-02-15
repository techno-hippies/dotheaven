use super::auth_bootstrap_helpers::auth_config_with;
use super::*;

impl LitWalletService {
    pub fn network_name(&self) -> Option<&str> {
        self.network.as_deref()
    }

    pub fn encrypt_with_access_control(
        &mut self,
        data_to_encrypt: Vec<u8>,
        unified_access_control_conditions: serde_json::Value,
    ) -> Result<EncryptResponse, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();

        self.runtime
            .block_on(async move {
                client
                    .encrypt(EncryptParams {
                        data_to_encrypt,
                        unified_access_control_conditions: Some(unified_access_control_conditions),
                        hashed_access_control_conditions_hex: None,
                        metadata: None,
                    })
                    .await
            })
            .map_err(|e| format!("encrypt failed: {e}"))
    }

    pub fn decrypt_with_access_control(
        &mut self,
        ciphertext_base64: String,
        data_to_encrypt_hash_hex: String,
        unified_access_control_conditions: serde_json::Value,
        chain: &str,
    ) -> Result<DecryptResponse, String> {
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
        let chain = chain.to_string();

        self.runtime
            .block_on(async move {
                client
                    .decrypt(
                        DecryptParams {
                            ciphertext_base64,
                            data_to_encrypt_hash_hex,
                            unified_access_control_conditions: Some(
                                unified_access_control_conditions,
                            ),
                            hashed_access_control_conditions_hex: None,
                        },
                        &auth_context,
                        &chain,
                    )
                    .await
            })
            .map_err(|e| format!("decrypt failed: {e}"))
    }

    pub fn execute_js_with_auth_context(
        &mut self,
        code: Option<String>,
        ipfs_id: Option<String>,
        js_params: Option<serde_json::Value>,
        auth_context: &AuthContext,
    ) -> Result<ExecuteJsResponse, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let auth_context = auth_context.clone();

        self.runtime
            .block_on(async move {
                client
                    .execute_js(code, ipfs_id, js_params, &auth_context)
                    .await
            })
            .map_err(|e| format!("executeJs failed: {e}"))
    }

    pub fn create_auth_context_from_eth_wallet(
        &mut self,
        pkp_public_key: &str,
        private_key_hex: &str,
        statement: &str,
        domain: &str,
        expiration_days: i64,
    ) -> Result<AuthContext, String> {
        let client = self
            .client
            .as_ref()
            .ok_or("Lit client is not initialized")?
            .clone();
        let pkp_public_key = pkp_public_key.to_string();
        let private_key_hex = private_key_hex.to_string();
        let auth_config = auth_config_with(statement, domain, expiration_days);

        self.runtime
            .block_on(async move {
                let nonce = format!(
                    "heaven{}",
                    chrono::Utc::now()
                        .timestamp_nanos_opt()
                        .unwrap_or_default()
                        .unsigned_abs()
                );
                let auth_data = create_eth_wallet_auth_data(&private_key_hex, &nonce).await?;
                client
                    .create_pkp_auth_context(
                        &pkp_public_key,
                        auth_data,
                        auth_config,
                        None,
                        None,
                        None,
                    )
                    .await
            })
            .map_err(|e| format!("create auth context from eth wallet failed: {e}"))
    }
}
