/// Abbreviate a hex address as 0x1234...abcd for compact UI display.
pub fn abbreviate_address(addr: &str) -> String {
    if addr.len() > 10 {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    } else {
        addr.to_string()
    }
}

/// Return true for strict 20-byte EVM addresses in 0x-prefixed hex format.
pub fn is_evm_address(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.len() != 42 || !trimmed.starts_with("0x") {
        return false;
    }
    trimmed
        .as_bytes()
        .iter()
        .skip(2)
        .all(|b| char::from(*b).is_ascii_hexdigit())
}
