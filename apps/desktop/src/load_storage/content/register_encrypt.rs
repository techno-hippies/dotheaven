use super::*;

const REGISTRY_V1: &str = "0xA111c5cA16752B09fF16B3B8B24BA55a8486aB23";
const RECORDS_V1: &str = "0x57e36738f02Bb90664d00E4EC0C8507feeF3995c";
const CONTENT_PUBKEY_RECORD_KEY: &str = "contentPubKey";
const GAS_LIMIT_SET_TEXT: u64 = 420_000;

fn u64_to_u256_word(value: u64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&value.to_be_bytes());
    out
}

fn resolve_primary_name_node_for_owner(user_address: &str) -> Result<Option<[u8; 32]>, String> {
    let user = user_address
        .parse::<Address>()
        .map_err(|e| format!("Invalid user address ({user_address}): {e}"))?;
    let mut call_data = Vec::with_capacity(4 + 32);
    call_data.extend_from_slice(&keccak256(b"primaryName(address)")[..4]);
    let mut user_word = [0u8; 32];
    user_word[12..].copy_from_slice(user.as_slice());
    call_data.extend_from_slice(&user_word);

    let output = eth_call_raw(
        &tempo_rpc_url(),
        REGISTRY_V1,
        &to_hex_prefixed(call_data.as_slice()),
    )?;
    if output.is_empty() {
        return Ok(None);
    }

    let decoded = abi_decode(
        &[ParamType::String, ParamType::FixedBytes(32)],
        output.as_slice(),
    )
    .map_err(|e| format!("Failed decoding RegistryV1 primaryName response: {e}"))?;
    if decoded.len() != 2 {
        return Ok(None);
    }

    let label = decoded
        .first()
        .and_then(|token| match token {
            Token::String(value) => Some(value.trim().to_lowercase()),
            _ => None,
        })
        .unwrap_or_default();
    if label.is_empty() {
        return Ok(None);
    }
    let parent = match decoded.get(1) {
        Some(Token::FixedBytes(bytes)) if bytes.len() == 32 => {
            let mut out = [0u8; 32];
            out.copy_from_slice(bytes.as_slice());
            out
        }
        _ => return Ok(None),
    };
    if parent.iter().all(|b| *b == 0u8) {
        return Ok(None);
    }

    let label_hash = keccak256(label.as_bytes());
    let mut node_input = Vec::with_capacity(64);
    node_input.extend_from_slice(&parent);
    node_input.extend_from_slice(label_hash.as_slice());
    let node_hash = keccak256(node_input);
    let mut node = [0u8; 32];
    node.copy_from_slice(node_hash.as_slice());
    Ok(Some(node))
}

fn read_text_record(node: &[u8; 32], key: &str) -> Result<Option<String>, String> {
    let key_bytes = key.as_bytes();
    let padded_len = ((key_bytes.len() + 31) / 32) * 32;
    let mut call_data = Vec::with_capacity(4 + 32 + 32 + 32 + padded_len);
    call_data.extend_from_slice(&keccak256(b"text(bytes32,string)")[..4]);
    call_data.extend_from_slice(node);
    call_data.extend_from_slice(&u64_to_u256_word(64));
    call_data.extend_from_slice(&u64_to_u256_word(key_bytes.len() as u64));
    call_data.extend_from_slice(key_bytes);
    if padded_len > key_bytes.len() {
        call_data.extend(std::iter::repeat(0u8).take(padded_len - key_bytes.len()));
    }

    let output = eth_call_raw(
        &tempo_rpc_url(),
        RECORDS_V1,
        &to_hex_prefixed(call_data.as_slice()),
    )?;
    if output.is_empty() {
        return Ok(None);
    }
    let decoded = abi_decode(&[ParamType::String], output.as_slice())
        .map_err(|e| format!("Failed decoding RecordsV1 text(bytes32,string) response: {e}"))?;
    let value = decoded
        .first()
        .and_then(|token| match token {
            Token::String(value) => Some(value.trim().to_string()),
            _ => None,
        })
        .unwrap_or_default();
    if value.is_empty() {
        return Ok(None);
    }
    Ok(Some(value))
}

fn set_text_call_data(node: &[u8; 32], key: &str, value: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + 320);
    out.extend_from_slice(&keccak256(b"setText(bytes32,string,string)")[..4]);
    out.extend_from_slice(
        ethers::abi::encode(&[
            Token::FixedBytes(node.to_vec()),
            Token::String(key.to_string()),
            Token::String(value.to_string()),
        ])
        .as_slice(),
    );
    out
}

fn ensure_tempo_content_pubkey_published(
    auth: &PersistedAuth,
    content_public_key: &[u8],
) -> Result<(), String> {
    let owner = auth
        .wallet_address()
        .ok_or("Missing wallet address in auth")?;
    let owner = normalize_address(owner)?;
    let Some(node) = resolve_primary_name_node_for_owner(&owner)? else {
        log::info!(
            "[LoadStorage] contentPubKey publish skipped: no primary name set for owner={}",
            owner
        );
        return Ok(());
    };

    let desired = format!("0x{}", hex::encode(content_public_key));
    if let Some(existing) = read_text_record(&node, CONTENT_PUBKEY_RECORD_KEY)? {
        if existing.trim().eq_ignore_ascii_case(desired.as_str()) {
            return Ok(());
        }
    }

    let call_data = set_text_call_data(&node, CONTENT_PUBKEY_RECORD_KEY, desired.as_str());
    let tx_hash = crate::scrobble::submit_tempo_contract_call(
        auth,
        RECORDS_V1,
        call_data,
        GAS_LIMIT_SET_TEXT,
        "contentPubKey publish",
    )?;
    log::info!(
        "[LoadStorage] contentPubKey published: owner={} txHash={}",
        owner,
        tx_hash
    );
    Ok(())
}

impl LoadStorageService {
    pub(super) fn encrypt_for_upload(
        &mut self,
        auth: &PersistedAuth,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        self.encrypt_for_upload_tempo(auth, source_bytes, content_id)
    }

    fn encrypt_for_upload_tempo(
        &mut self,
        auth: &PersistedAuth,
        source_bytes: &[u8],
        content_id: &B256,
    ) -> Result<Vec<u8>, String> {
        let mut encrypted = encrypt_audio_blob(source_bytes)?;
        let content_keypair = load_or_create_content_keypair()?;
        if let Err(err) = ensure_tempo_content_pubkey_published(auth, &content_keypair.public_key) {
            log::warn!("[LoadStorage] contentPubKey publish failed: {}", err);
        }
        let wrapped_key = ecies_encrypt(&content_keypair.public_key, &encrypted.raw_key)?;
        encrypted.raw_key.fill(0);

        let content_id_hex = to_hex_prefixed(content_id.as_slice()).to_lowercase();
        save_wrapped_key_for_content(&content_id_hex, &wrapped_key)?;

        let mut blob = Vec::with_capacity(12 + encrypted.ciphertext.len());
        blob.extend_from_slice(&encrypted.iv);
        blob.extend_from_slice(&encrypted.ciphertext);
        Ok(blob)
    }
}
