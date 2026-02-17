use alloy_primitives::keccak256;

use crate::shared::address::is_evm_address;
use crate::shared::config::non_empty_env;
use crate::shared::rpc::eth_call_address;

const DEFAULT_MEGAETH_RPC_URL: &str = "https://carrot.megaeth.com/rpc";
const DEFAULT_ETHEREUM_MAINNET_RPC_URL: &str = "https://ethereum-rpc.publicnode.com";
const REGISTRY_V1: &str = "0x22B618DaBB5aCdC214eeaA1c4C5e2eF6eb4488C2";
const HEAVEN_NODE_HEX: &str = "8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";
const ENS_REGISTRY: &str = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

pub(super) fn resolve_recipient_identifier(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter a wallet address, heaven username, or name.eth".to_string());
    }

    if is_evm_address(trimmed) {
        return Ok(trimmed.to_lowercase());
    }

    let lowered = trimmed.to_lowercase();
    if lowered.ends_with(".eth") {
        return resolve_ens_name_to_address(&lowered);
    }

    // Heaven username: "alice" or "alice.heaven" (also allow "@alice")
    let label = lowered
        .trim_start_matches('@')
        .strip_suffix(".heaven")
        .unwrap_or(lowered.trim_start_matches('@'))
        .trim();

    if label.is_empty() {
        return Err("Invalid heaven username".to_string());
    }
    if label.contains('.') {
        return Err(
            "Unsupported name format. Use 0x..., alice, alice.heaven, or alice.eth".to_string(),
        );
    }

    resolve_heaven_name_to_address(label)
}

fn resolve_heaven_name_to_address(label: &str) -> Result<String, String> {
    let rpc_url =
        non_empty_env("HEAVEN_RPC_URL").unwrap_or_else(|| DEFAULT_MEGAETH_RPC_URL.to_string());

    let heaven_node_bytes =
        hex::decode(HEAVEN_NODE_HEX).map_err(|e| format!("Invalid HEAVEN_NODE constant: {e}"))?;
    if heaven_node_bytes.len() != 32 {
        return Err("Invalid HEAVEN_NODE constant length".to_string());
    }

    let label_hash = keccak256(label.as_bytes());
    let mut packed = Vec::with_capacity(64);
    packed.extend_from_slice(&heaven_node_bytes);
    packed.extend_from_slice(label_hash.as_slice());
    let node = keccak256(&packed);

    // ownerOf(uint256) selector = 0x6352211e
    let data = format!("0x6352211e{}", hex::encode(node.as_slice()));
    let owner = eth_call_address(&rpc_url, REGISTRY_V1, &data)?;
    if owner == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{label}.heaven not found"));
    }
    Ok(owner.to_lowercase())
}

fn resolve_ens_name_to_address(name: &str) -> Result<String, String> {
    let rpc_url = non_empty_env("HEAVEN_MAINNET_RPC_URL")
        .unwrap_or_else(|| DEFAULT_ETHEREUM_MAINNET_RPC_URL.to_string());

    let node = ens_namehash(name);

    // resolver(bytes32) selector = 0x0178b8bf
    let resolver_call_data = format!("0x0178b8bf{}", hex::encode(node));
    let resolver = eth_call_address(&rpc_url, ENS_REGISTRY, &resolver_call_data)?;
    if resolver == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{name} not found"));
    }

    // addr(bytes32) selector = 0x3b3b57de
    let addr_call_data = format!("0x3b3b57de{}", hex::encode(node));
    let address = eth_call_address(&rpc_url, &resolver, &addr_call_data)?;
    if address == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{name} not found"));
    }
    Ok(address.to_lowercase())
}

fn ens_namehash(name: &str) -> [u8; 32] {
    let mut node = [0u8; 32];
    for label in name.trim().trim_end_matches('.').rsplit('.') {
        if label.is_empty() {
            continue;
        }
        let label_hash = keccak256(label.as_bytes());
        let mut packed = [0u8; 64];
        packed[..32].copy_from_slice(&node);
        packed[32..].copy_from_slice(label_hash.as_slice());
        node = keccak256(packed).into();
    }
    node
}
