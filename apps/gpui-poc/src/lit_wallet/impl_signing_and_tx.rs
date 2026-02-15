use super::signature_helpers::*;
use super::*;

impl LitWalletService {
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
        signature_value_to_65_bytes(sig)
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

    /// Signs arbitrary message bytes using Ethereum personal-sign semantics
    /// and returns the canonical 65-byte signature (r+s+v).
    pub fn pkp_sign_ethereum_message(&mut self, message: &[u8]) -> Result<Vec<u8>, String> {
        let hash = ethereum_personal_message_hash(message);
        let response = self.pkp_sign_ethereum(&hash)?;
        signature_value_to_65_bytes(&response)
    }

    /// Sends a native EVM transaction signed by the authenticated PKP.
    /// Returns the tx hash and, when `wait_for_receipt` is true, mined receipt metadata.
    pub fn pkp_send_native_transaction(
        &mut self,
        rpc_url: &str,
        expected_chain_id: u64,
        to: &str,
        amount_eth: &str,
        wait_for_receipt: bool,
    ) -> Result<serde_json::Value, String> {
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
        let pkp_address = self
            .pkp_address
            .as_ref()
            .ok_or("Missing PKP address")?
            .to_string();
        let rpc_url = rpc_url.trim().to_string();
        let to_address: EthersAddress = to
            .trim()
            .parse()
            .map_err(|e| format!("Invalid recipient address: {e}"))?;
        let from_address: EthersAddress = pkp_address
            .parse()
            .map_err(|e| format!("Invalid PKP address: {e}"))?;
        let value_wei = parse_ether(amount_eth.trim())
            .map_err(|e| format!("Invalid ETH amount ({amount_eth}): {e}"))?;

        self.runtime.block_on(async move {
            let provider = Provider::<Http>::try_from(rpc_url.as_str())
                .map_err(|e| format!("Invalid EVM RPC URL: {e}"))?;
            let chain_id = provider
                .get_chainid()
                .await
                .map_err(|e| format!("Failed to read chain id from RPC: {e}"))?
                .as_u64();

            if chain_id != expected_chain_id {
                return Err(format!(
                    "Unexpected chain id from RPC: got {chain_id}, expected {expected_chain_id}"
                ));
            }

            let signer = PkpSigner::new(client, pkp_public_key, auth_context, chain_id)
                .map_err(|e| format!("Failed to initialize PKP signer: {e}"))?
                .with_chain_id(chain_id);
            let signer_client = SignerMiddleware::new(provider, signer);

            let tx = TransactionRequest::new()
                .from(from_address)
                .to(to_address)
                .value(value_wei)
                .chain_id(chain_id);

            let pending = signer_client
                .send_transaction(tx, Option::<BlockId>::None)
                .await
                .map_err(|e| format!("Failed to broadcast PKP tx: {e}"))?;
            let tx_hash = format!("{:#x}", pending.tx_hash());

            if !wait_for_receipt {
                return Ok(serde_json::json!({
                    "txHash": tx_hash,
                    "chainId": chain_id,
                    "from": format!("{:#x}", from_address),
                    "to": format!("{:#x}", to_address),
                    "valueWei": value_wei.to_string(),
                }));
            }

            let receipt_opt = pending
                .await
                .map_err(|e| format!("Failed waiting for tx receipt: {e}"))?;
            let receipt = receipt_opt.ok_or("Transaction dropped before confirmation")?;
            let block_number = receipt.block_number.map(|n| n.as_u64());
            let status = receipt.status.map(|s| s.as_u64());
            let gas_used = receipt
                .gas_used
                .unwrap_or_else(EthersU256::zero)
                .to_string();

            Ok(serde_json::json!({
                "txHash": tx_hash,
                "chainId": chain_id,
                "from": format!("{:#x}", from_address),
                "to": format!("{:#x}", to_address),
                "valueWei": value_wei.to_string(),
                "blockNumber": block_number,
                "status": status,
                "gasUsed": gas_used,
            }))
        })
    }
}
