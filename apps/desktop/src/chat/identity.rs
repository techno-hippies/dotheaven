use alloy_primitives::keccak256;

use crate::shared::address::is_evm_address;
use crate::shared::config::non_empty_env;
use crate::shared::rpc::eth_call_address;

const DEFAULT_TEMPO_RPC_URL: &str = "https://rpc.moderato.tempo.xyz";
const DEFAULT_ETHEREUM_MAINNET_RPC_URL: &str = "https://ethereum-rpc.publicnode.com";
const REGISTRY_V2: &str = "0xA111c5cA16752B09fF16B3B8B24BA55a8486aB23";
const HEAVEN_NODE_HEX: &str = "8edf6f47e89d05c0e21320161fda1fd1fabd0081a66c959691ea17102e39fb27";
const PIRATE_NODE_HEX: &str = "ace9c9c435cf933be3564cdbcf7b7e2faee63e4f39034849eacb82d13f32f02a";
const ENS_REGISTRY: &str = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

pub(super) fn resolve_recipient_identifier(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Enter a wallet address, heaven/pirate username, or name.eth".to_string());
    }

    if is_evm_address(trimmed) {
        return Ok(trimmed.to_lowercase());
    }

    let lowered = trimmed.to_lowercase();
    if lowered.ends_with(".eth") {
        return resolve_ens_name_to_address(&lowered);
    }

    // Tempo username: "alice", "alice.heaven", "alice.pirate" (also allow "@alice")
    let raw_name = lowered.trim_start_matches('@').trim();
    let (label, parent_node_hex, tld_suffix) = if let Some(base) = raw_name.strip_suffix(".heaven")
    {
        (base.trim(), HEAVEN_NODE_HEX, "heaven")
    } else if let Some(base) = raw_name.strip_suffix(".pirate") {
        (base.trim(), PIRATE_NODE_HEX, "pirate")
    } else {
        (raw_name, HEAVEN_NODE_HEX, "heaven")
    };

    if label.is_empty() {
        return Err("Invalid name".to_string());
    }
    if label.contains('.') {
        return Err(
            "Unsupported name format. Use 0x..., alice, alice.heaven, alice.pirate, or alice.eth"
                .to_string(),
        );
    }

    resolve_tempo_name_to_address(label, parent_node_hex, tld_suffix)
}

fn resolve_tempo_name_to_address(
    label: &str,
    parent_node_hex: &str,
    tld_suffix: &str,
) -> Result<String, String> {
    let rpc_url = non_empty_env("TEMPO_RPC_URL")
        .or_else(|| non_empty_env("HEAVEN_RPC_URL"))
        .unwrap_or_else(|| DEFAULT_TEMPO_RPC_URL.to_string());

    let parent_node_bytes = hex::decode(parent_node_hex)
        .map_err(|e| format!("Invalid parent node constant ({tld_suffix}): {e}"))?;
    if parent_node_bytes.len() != 32 {
        return Err(format!(
            "Invalid parent node constant length ({tld_suffix})"
        ));
    }

    let label_hash = keccak256(label.as_bytes());
    let mut packed = Vec::with_capacity(64);
    packed.extend_from_slice(&parent_node_bytes);
    packed.extend_from_slice(label_hash.as_slice());
    let node = keccak256(&packed);

    // ownerOf(uint256) selector = 0x6352211e
    let data = format!("0x6352211e{}", hex::encode(node.as_slice()));
    let owner = eth_call_address(&rpc_url, REGISTRY_V2, &data)?;
    if owner == "0x0000000000000000000000000000000000000000" {
        return Err(format!("{label}.{tld_suffix} not found"));
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
