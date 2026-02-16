use super::*;

pub(super) fn eth_get_code(rpc_url: &str, address: Address) -> Result<String, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getCode",
        "params": [address.to_string(), "latest"]
    });
    let result = rpc_json(rpc_url, payload)?;
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or("eth_getCode returned non-string result".to_string())
}

pub(super) fn eth_call(rpc_url: &str, to: Address, data: &[u8]) -> Result<Vec<u8>, String> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [
            {
                "to": to.to_string(),
                "data": codec::to_hex_bytes(data),
            },
            "latest"
        ]
    });
    let result = rpc_json(rpc_url, payload)?;
    let hex = result
        .as_str()
        .ok_or("eth_call returned non-string result".to_string())?;
    codec::parse_hex_bytes(hex)
}
