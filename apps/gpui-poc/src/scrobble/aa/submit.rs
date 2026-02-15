use super::*;

pub(super) fn submit_scrobble_aa(
    lit: &mut LitWalletService,
    user_address: Address,
    track: &SubmitScrobbleInput,
) -> Result<SubmitScrobbleResult, String> {
    let rpc_url = util::env_or("HEAVEN_AA_RPC_URL", "AA_RPC_URL")
        .unwrap_or_else(|| DEFAULT_AA_RPC_URL.to_string());
    let gateway_url = util::env_or("HEAVEN_AA_GATEWAY_URL", "AA_GATEWAY_URL")
        .unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string());
    let gateway_key = util::env_or("HEAVEN_AA_GATEWAY_KEY", "AA_GATEWAY_KEY").unwrap_or_default();
    let entrypoint = util::env_or("HEAVEN_AA_ENTRYPOINT", "AA_ENTRYPOINT")
        .unwrap_or_else(|| DEFAULT_ENTRYPOINT.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid EntryPoint address: {e}"))?;
    let factory = util::env_or("HEAVEN_AA_FACTORY", "AA_FACTORY")
        .unwrap_or_else(|| DEFAULT_FACTORY.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid Factory address: {e}"))?;
    let scrobble_v4 = util::env_or("HEAVEN_AA_SCROBBLE_V4", "AA_SCROBBLE_V4")
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid ScrobbleV4 address: {e}"))?;

    log::info!(
        "[Scrobble] submit start: user={} artist='{}' title='{}' playedAt={} gateway={} rpc={} entrypoint={} scrobbleV4={}",
        user_address,
        track.artist,
        track.title,
        track.played_at_sec,
        gateway_url,
        rpc_url,
        entrypoint,
        scrobble_v4
    );

    let sender = call_get_address(&rpc_url, factory, user_address, U256::ZERO)?;
    let code = rpc::eth_get_code(&rpc_url, sender)?;
    let needs_init = code.trim() == "0x";

    let init_code_bytes = if needs_init {
        let create_calldata = createAccountCall {
            owner: user_address,
            salt: U256::ZERO,
        }
        .abi_encode();
        let mut bytes = factory.as_slice().to_vec();
        bytes.extend_from_slice(&create_calldata);
        bytes
    } else {
        Vec::new()
    };

    let nonce = call_get_nonce(&rpc_url, entrypoint, sender, U256::ZERO)?;
    let (kind, payload) = track::derive_track_kind_and_payload(track)?;
    let track_id = track::compute_track_id(kind, payload);
    log::info!(
        "[Scrobble] derived ids: user={} sender={} kind={} trackId={}",
        user_address,
        sender,
        kind,
        track_id
    );

    let already_registered = call_is_registered(&rpc_url, scrobble_v4, track_id).unwrap_or_else(|e| {
        log::warn!(
            "[Scrobble] isRegistered check failed for trackId={}: {}; defaulting to registerAndScrobbleBatch",
            track_id,
            e
        );
        false
    });
    let inner_calldata = if already_registered {
        log::info!(
            "[Scrobble] using scrobbleBatch for existing trackId={}",
            track_id
        );
        scrobbleBatchCall {
            user: user_address,
            trackIds: vec![track_id],
            timestamps: vec![track.played_at_sec],
        }
        .abi_encode()
    } else {
        log::info!(
            "[Scrobble] using registerAndScrobbleBatch for new trackId={}",
            track_id
        );
        registerAndScrobbleBatchCall {
            user: user_address,
            regKinds: vec![kind],
            regPayloads: vec![payload],
            titles: vec![track.title.clone()],
            artists: vec![track.artist.clone()],
            albums: vec![track.album.clone().unwrap_or_default()],
            durations: vec![track.duration_sec],
            trackIds: vec![track_id],
            timestamps: vec![track.played_at_sec],
        }
        .abi_encode()
    };

    let outer_calldata = executeCall {
        dest: scrobble_v4,
        value: U256::ZERO,
        func: inner_calldata.into(),
    }
    .abi_encode();

    let account_gas_limits = codec::pack_uints_128(VERIFICATION_GAS_LIMIT, CALL_GAS_LIMIT);
    let gas_fees = codec::pack_uints_128(MAX_PRIORITY_FEE, MAX_FEE);

    let mut user_op = UserOp {
        sender: sender.to_string(),
        nonce: codec::to_hex_u256(nonce),
        init_code: codec::to_hex_bytes(&init_code_bytes),
        call_data: codec::to_hex_bytes(&outer_calldata),
        account_gas_limits: codec::to_hex_fixed32(&account_gas_limits),
        pre_verification_gas: codec::to_hex_u256(U256::from(PRE_VERIFICATION_GAS)),
        gas_fees: codec::to_hex_fixed32(&gas_fees),
        paymaster_and_data: "0x".to_string(),
        signature: "0x".to_string(),
    };

    let quote_req = GatewayQuoteRequest {
        user_op: user_op.clone(),
    };
    let quote: GatewayQuoteResponse =
        gateway::gateway_post_json(&gateway_url, "/quotePaymaster", &gateway_key, &quote_req)?;
    user_op.paymaster_and_data = quote.paymaster_and_data;

    let user_op_hash = call_get_user_op_hash(&rpc_url, entrypoint, &user_op)?;
    let signature = signature::sign_user_op_hash(lit, user_op_hash)?;
    user_op.signature = signature;

    let send_req = GatewaySendRequest {
        user_op: user_op.clone(),
        user_op_hash: codec::to_hex_h256(user_op_hash),
    };
    let send: GatewaySendResponse =
        gateway::gateway_post_json(&gateway_url, "/sendUserOp", &gateway_key, &send_req)?;

    if let Some(err) = send.error {
        let detail = send.detail.map(|d| format!(": {d}")).unwrap_or_default();
        return Err(format!("sendUserOp failed: {err}{detail}"));
    }

    let result_hash = send
        .user_op_hash
        .unwrap_or_else(|| codec::to_hex_h256(user_op_hash));
    match poll_user_op_receipt(&rpc_url, &result_hash) {
        Ok(Some(receipt)) => {
            let success = receipt
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let tx_hash = receipt
                .get("receipt")
                .and_then(|v| v.get("transactionHash"))
                .and_then(|v| v.as_str())
                .unwrap_or("-");
            if !success {
                let reason = receipt
                    .get("reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                return Err(format!(
                    "userOp execution failed: userOpHash={} txHash={} reason={} receipt={}",
                    result_hash, tx_hash, reason, receipt
                ));
            }
            log::info!(
                "[Scrobble] userOp confirmed: userOpHash={} txHash={} success={}",
                result_hash,
                tx_hash,
                success
            );
        }
        Ok(None) => {
            log::warn!(
                "[Scrobble] userOp receipt not available yet: userOpHash={} (continuing)",
                result_hash
            );
        }
        Err(err) => {
            log::warn!(
                "[Scrobble] userOp receipt poll failed: userOpHash={} err={} (continuing)",
                result_hash,
                err
            );
        }
    }
    log::info!(
        "[Scrobble] submit success: user={} sender={} trackId={} userOpHash={}",
        user_address,
        user_op.sender,
        track_id,
        result_hash,
    );

    Ok(SubmitScrobbleResult {
        user_op_hash: result_hash,
        sender: user_op.sender,
    })
}

fn call_get_address(
    rpc_url: &str,
    factory: Address,
    owner: Address,
    salt: U256,
) -> Result<Address, String> {
    let data = getAddressCall { owner, salt }.abi_encode();
    let out = rpc::eth_call(rpc_url, factory, &data)?;
    codec::decode_address_word(&out)
}

fn call_get_nonce(
    rpc_url: &str,
    entrypoint: Address,
    sender: Address,
    key: U256,
) -> Result<U256, String> {
    let key_limbs = key.into_limbs();
    let key192 = U192::from_limbs([key_limbs[0], key_limbs[1], key_limbs[2]]);
    let data = getNonceCall {
        sender,
        key: key192,
    }
    .abi_encode();
    let out = rpc::eth_call(rpc_url, entrypoint, &data)?;
    codec::decode_u256_word(&out)
}

fn call_is_registered(rpc_url: &str, scrobble_v4: Address, track_id: B256) -> Result<bool, String> {
    let data = isRegisteredCall { trackId: track_id }.abi_encode();
    let out = rpc::eth_call(rpc_url, scrobble_v4, &data)?;
    let decoded = isRegisteredCall::abi_decode_returns(&out)
        .map_err(|e| format!("isRegistered decode failed: {e}"))?;
    Ok(decoded)
}

fn call_get_user_op_hash(
    rpc_url: &str,
    entrypoint: Address,
    user_op: &UserOp,
) -> Result<B256, String> {
    let sender = user_op
        .sender
        .parse::<Address>()
        .map_err(|e| format!("invalid sender address in UserOp: {e}"))?;
    let data = getUserOpHashCall {
        userOp: UserOperation {
            sender,
            nonce: codec::parse_hex_u256(&user_op.nonce)?,
            initCode: codec::parse_hex_bytes(&user_op.init_code)?.into(),
            callData: codec::parse_hex_bytes(&user_op.call_data)?.into(),
            accountGasLimits: B256::from(codec::parse_hex_fixed32(&user_op.account_gas_limits)?),
            preVerificationGas: codec::parse_hex_u256(&user_op.pre_verification_gas)?,
            gasFees: B256::from(codec::parse_hex_fixed32(&user_op.gas_fees)?),
            paymasterAndData: codec::parse_hex_bytes(&user_op.paymaster_and_data)?.into(),
            signature: Vec::new().into(),
        },
    }
    .abi_encode();
    let out = rpc::eth_call(rpc_url, entrypoint, &data)?;
    codec::decode_b256_word(&out)
}

const RECEIPT_POLL_ATTEMPTS: usize = 15;
const RECEIPT_POLL_INTERVAL_MS: u64 = 2_000;

fn poll_user_op_receipt(
    rpc_url: &str,
    user_op_hash: &str,
) -> Result<Option<serde_json::Value>, String> {
    let user_op_hash = user_op_hash.trim();
    if user_op_hash.is_empty() {
        return Ok(None);
    }

    for attempt in 0..RECEIPT_POLL_ATTEMPTS {
        std::thread::sleep(Duration::from_millis(RECEIPT_POLL_INTERVAL_MS));
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getUserOperationReceipt",
            "params": [user_op_hash],
        });
        match crate::shared::rpc::rpc_json(rpc_url, payload) {
            Ok(result) => {
                if result.is_null() {
                    continue;
                }
                return Ok(Some(result));
            }
            Err(err) => {
                let lowered = err.to_ascii_lowercase();
                if lowered.contains("method not found")
                    || lowered.contains("does not exist")
                    || lowered.contains("unsupported")
                {
                    return Ok(None);
                }
                if attempt + 1 == RECEIPT_POLL_ATTEMPTS {
                    return Err(err);
                }
            }
        }
    }

    Ok(None)
}
