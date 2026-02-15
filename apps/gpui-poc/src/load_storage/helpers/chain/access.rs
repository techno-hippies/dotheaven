use super::*;

pub(crate) fn check_content_access_on_base(
    user_address: &str,
    content_id_hex: &str,
) -> Result<bool, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;
    let content_id = decode_hex_32(content_id_hex)?;

    let mut call_data = Vec::with_capacity(4 + 32 + 32);
    call_data.extend_from_slice(&keccak256(b"canAccess(address,bytes32)")[..4]);

    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);
    call_data.extend_from_slice(&content_id);

    let output = eth_call_raw(
        &base_sepolia_rpc_url(),
        &content_access_mirror(),
        &to_hex_prefixed(&call_data),
    )?;
    if output.is_empty() {
        return Ok(false);
    }

    let decoded = abi_decode(&[ParamType::Bool], &output)
        .map_err(|e| format!("Failed decoding canAccess response: {e}"))?;
    match decoded.first() {
        Some(Token::Bool(v)) => Ok(*v),
        other => Err(format!("Unexpected canAccess response payload: {other:?}")),
    }
}

pub(crate) fn build_content_access_conditions_for_chain(
    content_id_hex: &str,
    chain: &str,
) -> Value {
    let normalized = normalize_content_id_hex(content_id_hex)
        .unwrap_or_else(|_| content_id_hex.trim().to_lowercase());
    json!([
        {
            "conditionType": "evmContract",
            "contractAddress": content_access_mirror(),
            "chain": chain,
            "functionName": "canAccess",
            "functionParams": [":userAddress", normalized],
            "functionAbi": {
                "type": "function",
                "name": "canAccess",
                "stateMutability": "view",
                "inputs": [
                    { "type": "address", "name": "user", "internalType": "address" },
                    { "type": "bytes32", "name": "contentId", "internalType": "bytes32" }
                ],
                "outputs": [{ "type": "bool", "name": "", "internalType": "bool" }]
            },
            "returnValueTest": { "key": "", "comparator": "=", "value": "true" }
        }
    ])
}
