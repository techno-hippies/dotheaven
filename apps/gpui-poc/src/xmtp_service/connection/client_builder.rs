use super::super::*;

impl XmtpService {
    pub(super) fn build_client(
        &self,
        identity_strategy: &IdentityStrategy,
        db_path: &str,
    ) -> Result<XmtpClient, ConnectBuildError> {
        let storage = StorageOption::Persistent(db_path.to_string());
        let db = NativeDb::new_unencrypted(&storage)
            .map_err(|e| ConnectBuildError::Other(format!("db: {e}")))?;
        let store = EncryptedMessageStore::new(db)
            .map_err(|e| ConnectBuildError::Other(format!("store: {e}")))?;

        let cursor_store = SqliteCursorStore::new(store.db());
        let mut backend = MessageBackendBuilder::default();
        backend
            .v3_host(xmtp_host())
            .is_secure(true)
            .app_version("heaven-gpui/0.1.0".to_string())
            .cursor_store(cursor_store);

        self.runtime.block_on(async {
            let api_client = backend
                .clone()
                .build()
                .map_err(|e| ConnectBuildError::Other(format!("api: {e}")))?;
            let sync_api_client = backend
                .build()
                .map_err(|e| ConnectBuildError::Other(format!("sync_api: {e}")))?;

            let builder = Client::builder(identity_strategy.clone())
                .api_clients(api_client, sync_api_client)
                .enable_api_stats()
                .map_err(|e| ConnectBuildError::Other(format!("api_stats: {e}")))?
                .enable_api_debug_wrapper()
                .map_err(|e| ConnectBuildError::Other(format!("debug_wrapper: {e}")))?
                .with_remote_verifier()
                .map_err(|e| ConnectBuildError::Other(format!("verifier: {e}")))?
                .store(store)
                .default_mls_store()
                .map_err(|e| ConnectBuildError::Other(format!("mls_store: {e}")))?;

            builder.build().await.map_err(map_builder_error)
        })
    }
}
