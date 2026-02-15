use super::*;

pub(super) fn pack_uints_128(high: u128, low: u128) -> [u8; 32] {
    let packed: U256 = (U256::from(high) << 128) | U256::from(low);
    packed.to_be_bytes()
}

pub(super) fn to_hex_u256(value: U256) -> String {
    format!("{value:#x}")
}

pub(super) fn to_hex_fixed32(bytes: &[u8; 32]) -> String {
    format!("0x{}", hex::encode(bytes))
}

pub(super) fn to_hex_h256(value: B256) -> String {
    format!("0x{}", hex::encode(value))
}

pub(super) fn to_hex_bytes(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}

pub(super) fn parse_hex_u256(value: &str) -> Result<U256, String> {
    U256::from_str_radix(value.trim_start_matches("0x"), 16)
        .map_err(|e| format!("invalid hex u256: {e}"))
}

pub(super) fn parse_hex_fixed32(value: &str) -> Result<[u8; 32], String> {
    let bytes = parse_hex_bytes(value)?;
    if bytes.len() != 32 {
        return Err(format!("expected 32-byte hex, got {} bytes", bytes.len()));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

pub(super) fn parse_hex_bytes(value: &str) -> Result<Vec<u8>, String> {
    let s = value.trim();
    if s == "0x" {
        return Ok(Vec::new());
    }
    hex::decode(s.trim_start_matches("0x")).map_err(|e| format!("invalid hex bytes: {e}"))
}

pub(super) fn decode_address_word(data: &[u8]) -> Result<Address, String> {
    if data.len() < 32 {
        return Err(format!(
            "address decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(Address::from_slice(&data[12..32]))
}

pub(super) fn decode_u256_word(data: &[u8]) -> Result<U256, String> {
    if data.len() < 32 {
        return Err(format!(
            "u256 decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(U256::from_be_slice(&data[..32]))
}

pub(super) fn decode_b256_word(data: &[u8]) -> Result<B256, String> {
    if data.len() < 32 {
        return Err(format!(
            "b256 decode failed: expected >=32 bytes, got {}",
            data.len()
        ));
    }
    Ok(B256::from_slice(&data[..32]))
}
