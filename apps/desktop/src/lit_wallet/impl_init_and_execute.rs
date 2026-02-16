use super::*;

mod auth_init;

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

    pub fn execute_js_ipfs(
        &mut self,
        ipfs_id: String,
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
                    .execute_js(None, Some(ipfs_id), js_params, &auth_context)
                    .await
            })
            .map_err(|e| format!("executeJs(ipfs) failed: {e}"))
    }
}
