use alloy_primitives::{Address, U256};

use crate::shared::address::is_evm_address;
use crate::shared::rpc::rpc_json;

use super::{zero_wallet_assets, WalletAssetRow, WalletBalancesFetchResult, WALLET_ASSETS};

pub(super) async fn fetch_wallet_assets(address: String) -> WalletBalancesFetchResult {
    smol::unblock(move || fetch_wallet_assets_sync(&address)).await
}

fn fetch_wallet_assets_sync(address: &str) -> WalletBalancesFetchResult {
    if !is_evm_address(address) {
        return WalletBalancesFetchResult {
            rows: zero_wallet_assets(),
            error: Some("Invalid wallet address".to_string()),
        };
    }

    let mut rows = Vec::with_capacity(WALLET_ASSETS.len());
    let mut failures = Vec::new();

    for cfg in WALLET_ASSETS {
        let result = if let Some(token) = cfg.token_address {
            fetch_erc20_balance(cfg.rpc_url, token, address, cfg.token_decimals)
        } else {
            fetch_native_balance(cfg.rpc_url, address)
        };

        match result {
            Ok(balance) => {
                let usd = balance * cfg.price_usd;
                rows.push(WalletAssetRow {
                    symbol: cfg.symbol,
                    network: cfg.network,
                    balance_text: format!("{balance:.4}"),
                    balance_usd_text: format!("${usd:.2}"),
                    balance_usd_value: usd,
                    icon: cfg.icon,
                    chain_badge: cfg.chain_badge,
                });
            }
            Err(err) => {
                failures.push(format!("{} {}", cfg.symbol, cfg.network));
                log::warn!(
                    "[Wallet] Failed to fetch {} {}: {}",
                    cfg.symbol,
                    cfg.network,
                    err
                );
                rows.push(WalletAssetRow {
                    symbol: cfg.symbol,
                    network: cfg.network,
                    balance_text: "0.0000".to_string(),
                    balance_usd_text: "$0.00".to_string(),
                    balance_usd_value: 0.0,
                    icon: cfg.icon,
                    chain_badge: cfg.chain_badge,
                });
            }
        }
    }

    let error = if failures.is_empty() {
        None
    } else if failures.len() == WALLET_ASSETS.len() {
        Some("Failed to fetch balances from RPC".to_string())
    } else {
        Some(format!(
            "Partial RPC failures ({}/{})",
            failures.len(),
            WALLET_ASSETS.len()
        ))
    };

    WalletBalancesFetchResult { rows, error }
}

fn fetch_native_balance(rpc_url: &str, address: &str) -> Result<f64, String> {
    let result = rpc_json(
        rpc_url,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getBalance",
            "params": [address, "latest"]
        }),
    )?;
    let wei_hex = result
        .as_str()
        .ok_or("eth_getBalance result is not a string".to_string())?;
    let wei = parse_hex_u256(wei_hex)?;
    Ok(u256_to_units(wei, 18))
}

fn fetch_erc20_balance(
    rpc_url: &str,
    token_address: &str,
    user_address: &str,
    default_decimals: u8,
) -> Result<f64, String> {
    let balance_call_data = encode_balance_of_call(user_address)?;
    let balance_hex = rpc_eth_call(rpc_url, token_address, &balance_call_data)?;
    let raw_balance = parse_hex_u256(&balance_hex)?;

    let decimals = match rpc_eth_call(rpc_url, token_address, "0x313ce567")
        .and_then(|hex| parse_hex_u8_word(&hex))
    {
        Ok(value) => value,
        Err(err) => {
            log::warn!(
                "[Wallet] decimals() failed for token {}: {}. Falling back to {}",
                token_address,
                err,
                default_decimals
            );
            default_decimals
        }
    };

    Ok(u256_to_units(raw_balance, decimals as u32))
}

fn encode_balance_of_call(user_address: &str) -> Result<String, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("invalid user address: {e}"))?;

    let mut data = String::from("0x70a08231");
    data.push_str("000000000000000000000000");
    data.push_str(&hex::encode(user.as_slice()));
    Ok(data)
}

fn rpc_eth_call(rpc_url: &str, to: &str, data: &str) -> Result<String, String> {
    let result = rpc_json(
        rpc_url,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_call",
            "params": [
                {
                    "to": to,
                    "data": data,
                },
                "latest"
            ]
        }),
    )?;
    result
        .as_str()
        .map(|s| s.to_string())
        .ok_or("eth_call result is not a string".to_string())
}

fn parse_hex_u256(value: &str) -> Result<U256, String> {
    let trimmed = value.trim_start_matches("0x");
    if trimmed.is_empty() {
        return Ok(U256::ZERO);
    }
    U256::from_str_radix(trimmed, 16).map_err(|e| format!("invalid hex u256: {e}"))
}

fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let s = value.trim();
    if s == "0x" {
        return Ok(Vec::new());
    }
    hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("invalid hex bytes: {e}"))
}

fn parse_hex_u8_word(value: &str) -> Result<u8, String> {
    let bytes = parse_hex_bytes(value)?;
    bytes
        .last()
        .copied()
        .ok_or("empty hex word for u8 decode".to_string())
}

fn u256_to_units(value: U256, decimals: u32) -> f64 {
    let raw = value.to_string().parse::<f64>().unwrap_or(0.0);
    let scale = 10f64.powi(decimals as i32);
    raw / scale
}
