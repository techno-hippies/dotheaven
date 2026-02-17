use super::super::*;
use ethers::signers::{LocalWallet, Signer};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const LOCAL_SIGNER_DIR: &str = "xmtp_identity_keys";

pub(super) struct LocalXmtpSigner {
    user_wallet_address: String,
    wallet: LocalWallet,
    signer_address: String,
}

impl LocalXmtpSigner {
    pub(super) fn for_user_wallet(user_wallet: &str) -> Result<Self, String> {
        let user_wallet = normalize_wallet_address(user_wallet)?;
        let key_hex = load_or_create_private_key_hex(&user_wallet)?;
        let private_key =
            hex::decode(&key_hex).map_err(|e| format!("decode local XMTP key hex: {e}"))?;
        let wallet = LocalWallet::from_bytes(&private_key)
            .map_err(|e| format!("parse local XMTP key: {e}"))?;
        let signer_address = format!("{:#x}", wallet.address());
        Ok(Self {
            user_wallet_address: user_wallet,
            wallet,
            signer_address,
        })
    }

    pub(super) fn user_wallet_address(&self) -> &str {
        &self.user_wallet_address
    }

    pub(super) fn signer_address(&self) -> &str {
        &self.signer_address
    }

    pub(super) fn sign_identity_text(&self, signature_text: &[u8]) -> Result<Vec<u8>, String> {
        let hash = ethers::utils::hash_message(signature_text);
        let signature = self
            .wallet
            .sign_hash(hash)
            .map_err(|e| format!("local XMTP sign_hash: {e}"))?;
        let sig_bytes = signature.to_vec();
        if sig_bytes.len() != 65 {
            return Err(format!(
                "Local XMTP signer returned invalid signature length: expected 65, got {}",
                sig_bytes.len()
            ));
        }
        Ok(sig_bytes)
    }
}

fn normalize_wallet_address(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let with_prefix = if trimmed.starts_with("0x") || trimmed.starts_with("0X") {
        trimmed.to_string()
    } else {
        format!("0x{trimmed}")
    };
    let lower = with_prefix.to_ascii_lowercase();
    if !is_evm_address(&lower) {
        return Err(format!(
            "Invalid wallet address for XMTP identity key: {value}"
        ));
    }
    Ok(lower)
}

fn load_or_create_private_key_hex(user_wallet: &str) -> Result<String, String> {
    let key_path = key_path_for_user_wallet(user_wallet)?;
    if key_path.exists() {
        let stored = fs::read_to_string(&key_path)
            .map_err(|e| format!("read {}: {e}", key_path.display()))?;
        return normalize_private_key_hex(&stored);
    }

    let wallet = LocalWallet::new(&mut rand::thread_rng());
    let key_hex = hex::encode(wallet.signer().to_bytes());
    write_private_key_hex(&key_path, &key_hex)?;
    Ok(key_hex)
}

fn key_path_for_user_wallet(user_wallet: &str) -> Result<PathBuf, String> {
    let normalized = normalize_wallet_address(user_wallet)?;
    let keys_dir = app_data_dir().join(LOCAL_SIGNER_DIR);
    fs::create_dir_all(&keys_dir).map_err(|e| format!("mkdir {}: {e}", keys_dir.display()))?;
    let suffix = normalized.trim_start_matches("0x");
    Ok(keys_dir.join(format!("{suffix}.key")))
}

fn normalize_private_key_hex(raw: &str) -> Result<String, String> {
    let clean = raw.trim().trim_start_matches("0x").trim_start_matches("0X");
    if clean.len() != 64 || !clean.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid local XMTP private key format".to_string());
    }
    Ok(clean.to_ascii_lowercase())
}

fn write_private_key_hex(path: &Path, private_key_hex: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| format!("open {}: {e}", path.display()))?;
        file.write_all(private_key_hex.as_bytes())
            .map_err(|e| format!("write {}: {e}", path.display()))?;
        return Ok(());
    }

    #[cfg(not(unix))]
    {
        fs::write(path, private_key_hex).map_err(|e| format!("write {}: {e}", path.display()))
    }
}
