use super::*;
use p256::ecdh::diffie_hellman;
use p256::elliptic_curve::rand_core::OsRng;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::{PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const CONTENT_KEYPAIR_FILE: &str = "content_keypair_v1.json";
const WRAPPED_KEYS_FILE: &str = "content_wrapped_keys_v1.json";
const ENVELOPE_TAG_TYPE: &str = "content-key-envelope";
const CONTENT_KEYPAIR_ENC_PREFIX: &str = "enc:v1";
const CONTENT_KEYPAIR_ENC_SALT: &[u8] = b"heaven-content-keypair-v1";

#[derive(Debug, Clone)]
pub(crate) struct ContentKeyPair {
    pub(crate) private_key: Vec<u8>,
    pub(crate) public_key: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct EciesEnvelope {
    pub(crate) ephemeral_pub: Vec<u8>,
    pub(crate) iv: Vec<u8>,
    pub(crate) ciphertext: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct EncryptedAudioBlob {
    pub(crate) iv: [u8; 12],
    pub(crate) ciphertext: Vec<u8>,
    pub(crate) raw_key: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredContentKeyPair {
    private_key: String,
    public_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredEnvelope {
    ephemeral_pub: String,
    iv: String,
    ciphertext: String,
}

fn load_storage_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
}

fn content_keypair_path() -> PathBuf {
    load_storage_data_dir().join(CONTENT_KEYPAIR_FILE)
}

fn wrapped_keys_path() -> PathBuf {
    load_storage_data_dir().join(WRAPPED_KEYS_FILE)
}

fn normalize_content_key(content_id_hex: &str) -> String {
    normalize_content_id_hex(content_id_hex)
        .unwrap_or_else(|_| content_id_hex.trim().to_lowercase())
        .trim()
        .to_lowercase()
}

pub(crate) fn normalize_address(address: &str) -> Result<String, String> {
    let parsed = address
        .trim()
        .parse::<Address>()
        .map_err(|e| format!("Invalid EVM address ({address}): {e}"))?;
    Ok(format!("{parsed:#x}").to_lowercase())
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed creating data dir ({}): {e}", parent.display()))?;
    }
    Ok(())
}

fn decode_hex_bytes(raw: &str, label: &str) -> Result<Vec<u8>, String> {
    let clean = raw
        .trim()
        .strip_prefix("0x")
        .or_else(|| raw.trim().strip_prefix("0X"))
        .unwrap_or(raw.trim());
    hex::decode(clean).map_err(|e| format!("Invalid {label} hex: {e}"))
}

fn write_content_keypair_file(path: &Path, stored: &StoredContentKeyPair) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let encoded = serde_json::to_string_pretty(stored)
        .map_err(|e| format!("Failed encoding content keypair: {e}"))?;
    fs::write(path, encoded)
        .map_err(|e| format!("Failed writing content keypair ({}): {e}", path.display()))
}

fn machine_secret_material() -> String {
    if let Ok(raw) = fs::read_to_string("/etc/machine-id") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let host = std::env::var("HOSTNAME")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "unknown-host".to_string());
    let user = std::env::var("USER")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "unknown-user".to_string());
    let home = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".to_string());
    format!("{host}:{user}:{home}")
}

fn derive_content_keypair_wrap_key() -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CONTENT_KEYPAIR_ENC_SALT);
    hasher.update(machine_secret_material().as_bytes());
    let digest = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

fn encrypt_private_key_hex(private_key_hex: &str) -> Result<String, String> {
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let key = derive_content_keypair_wrap_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed creating content-key encryption cipher: {e}"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&iv), private_key_hex.as_bytes())
        .map_err(|e| format!("Failed encrypting content private key: {e}"))?;
    Ok(format!(
        "{}:{}:{}",
        CONTENT_KEYPAIR_ENC_PREFIX,
        hex::encode(iv),
        hex::encode(ciphertext)
    ))
}

fn decrypt_private_key_hex(encoded: &str) -> Result<String, String> {
    let trimmed = encoded.trim();
    let mut parts = trimmed.split(':');
    let prefix = parts.next().unwrap_or_default();
    let version = parts.next().unwrap_or_default();
    let iv_hex = parts.next().unwrap_or_default();
    let ciphertext_hex = parts.next().unwrap_or_default();
    if prefix != "enc" || version != "v1" || iv_hex.is_empty() || ciphertext_hex.is_empty() {
        return Err("Invalid encrypted content private key format.".to_string());
    }
    let iv = decode_hex_bytes(iv_hex, "content private key iv")?;
    if iv.len() != 12 {
        return Err(format!(
            "Invalid encrypted content private key IV length: expected 12, got {}",
            iv.len()
        ));
    }
    let ciphertext = decode_hex_bytes(ciphertext_hex, "content private key ciphertext")?;
    let key = derive_content_keypair_wrap_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed creating content-key decryption cipher: {e}"))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&iv), ciphertext.as_slice())
        .map_err(|e| format!("Failed decrypting content private key: {e}"))?;
    String::from_utf8(plaintext).map_err(|e| format!("Invalid UTF-8 in decrypted content key: {e}"))
}

fn read_wrapped_keys() -> HashMap<String, StoredEnvelope> {
    let path = wrapped_keys_path();
    let Ok(text) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str::<HashMap<String, StoredEnvelope>>(&text).unwrap_or_default()
}

fn write_wrapped_keys(entries: &HashMap<String, StoredEnvelope>) -> Result<(), String> {
    let path = wrapped_keys_path();
    ensure_parent_dir(&path)?;
    let encoded = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Failed encoding wrapped key store: {e}"))?;
    fs::write(&path, encoded)
        .map_err(|e| format!("Failed writing wrapped key store ({}): {e}", path.display()))
}

pub(crate) fn load_or_create_content_keypair() -> Result<ContentKeyPair, String> {
    let path = content_keypair_path();
    if path.exists() {
        let text = fs::read_to_string(&path)
            .map_err(|e| format!("Failed reading content keypair ({}): {e}", path.display()))?;
        let mut stored = serde_json::from_str::<StoredContentKeyPair>(&text)
            .map_err(|e| format!("Failed parsing content keypair JSON: {e}"))?;
        let mut migrated_to_encrypted = false;
        let private_key = if stored
            .private_key
            .trim()
            .starts_with(CONTENT_KEYPAIR_ENC_PREFIX)
        {
            let private_key_hex = decrypt_private_key_hex(&stored.private_key)?;
            decode_hex_bytes(&private_key_hex, "content private key (encrypted)")?
        } else {
            let key = decode_hex_bytes(&stored.private_key, "content private key")?;
            let key_hex = hex::encode(&key);
            match encrypt_private_key_hex(&key_hex) {
                Ok(encrypted_value) => {
                    stored.private_key = encrypted_value;
                    migrated_to_encrypted = true;
                    key
                }
                Err(err) => {
                    log::warn!(
                        "[LoadStorage] content key migration to encrypted file format failed; continuing with plaintext legacy entry: {}",
                        err
                    );
                    key
                }
            }
        };
        let public_key = decode_hex_bytes(&stored.public_key, "content public key")?;
        if private_key.len() != 32 {
            return Err(format!(
                "Invalid content private key length: expected 32, got {}",
                private_key.len()
            ));
        }
        if public_key.len() != 65 || public_key[0] != 0x04 {
            return Err(
                "Invalid content public key format (expected 65-byte uncompressed P256)."
                    .to_string(),
            );
        }
        if migrated_to_encrypted {
            if let Err(err) = write_content_keypair_file(&path, &stored) {
                log::warn!(
                    "[LoadStorage] failed rewriting encrypted content keypair file after migration: {}",
                    err
                );
            }
        }
        return Ok(ContentKeyPair {
            private_key,
            public_key,
        });
    }

    let secret = SecretKey::random(&mut OsRng);
    let public = secret.public_key().to_encoded_point(false);
    let private_key = secret.to_bytes().to_vec();
    let public_key = public.as_bytes().to_vec();

    let stored = StoredContentKeyPair {
        private_key: encrypt_private_key_hex(&hex::encode(&private_key))?,
        public_key: hex::encode(&public_key),
    };
    write_content_keypair_file(&path, &stored)?;

    Ok(ContentKeyPair {
        private_key,
        public_key,
    })
}

fn derive_ecies_key(private_key: &SecretKey, public_key: &PublicKey) -> [u8; 32] {
    let shared = diffie_hellman(private_key.to_nonzero_scalar(), public_key.as_affine());
    let digest = Sha256::digest(shared.raw_secret_bytes());
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub(crate) fn encrypt_audio_blob(source_bytes: &[u8]) -> Result<EncryptedAudioBlob, String> {
    let mut raw_key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw_key);
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);

    let cipher = Aes256Gcm::new_from_slice(&raw_key)
        .map_err(|e| format!("Failed to initialize AES-256-GCM key: {e}"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&iv), source_bytes)
        .map_err(|e| format!("Failed encrypting audio payload: {e}"))?;

    Ok(EncryptedAudioBlob {
        iv,
        ciphertext,
        raw_key,
    })
}

pub(crate) fn decrypt_audio_blob(
    raw_key: &[u8],
    iv: &[u8],
    ciphertext: &[u8],
) -> Result<Vec<u8>, String> {
    if raw_key.len() != 32 {
        return Err(format!(
            "Invalid AES key length for decrypt: expected 32, got {}",
            raw_key.len()
        ));
    }
    if iv.len() != 12 {
        return Err(format!(
            "Invalid IV length for decrypt: expected 12, got {}",
            iv.len()
        ));
    }
    let cipher = Aes256Gcm::new_from_slice(raw_key)
        .map_err(|e| format!("Failed to initialize AES key for decrypt: {e}"))?;
    cipher
        .decrypt(Nonce::from_slice(iv), ciphertext)
        .map_err(|e| format!("Failed decrypting audio payload: {e}"))
}

pub(crate) fn ecies_encrypt(
    recipient_public_key: &[u8],
    plaintext: &[u8],
) -> Result<EciesEnvelope, String> {
    let recipient = PublicKey::from_sec1_bytes(recipient_public_key)
        .map_err(|e| format!("Invalid recipient content public key: {e}"))?;
    let ephemeral_secret = SecretKey::random(&mut OsRng);
    let ephemeral_pub = ephemeral_secret.public_key().to_encoded_point(false);
    let key = derive_ecies_key(&ephemeral_secret, &recipient);

    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to initialize ECIES AES key: {e}"))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&iv), plaintext)
        .map_err(|e| format!("Failed ECIES encrypt: {e}"))?;

    Ok(EciesEnvelope {
        ephemeral_pub: ephemeral_pub.as_bytes().to_vec(),
        iv: iv.to_vec(),
        ciphertext,
    })
}

pub(crate) fn ecies_decrypt(
    recipient_private_key: &[u8],
    envelope: &EciesEnvelope,
) -> Result<Vec<u8>, String> {
    let secret = SecretKey::from_slice(recipient_private_key)
        .map_err(|e| format!("Invalid content private key bytes: {e}"))?;
    let ephemeral = PublicKey::from_sec1_bytes(&envelope.ephemeral_pub)
        .map_err(|e| format!("Invalid ECIES ephemeral key bytes: {e}"))?;
    let key = derive_ecies_key(&secret, &ephemeral);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Failed to initialize ECIES decrypt AES key: {e}"))?;
    cipher
        .decrypt(
            Nonce::from_slice(&envelope.iv),
            envelope.ciphertext.as_slice(),
        )
        .map_err(|e| format!("Failed ECIES decrypt: {e}"))
}

pub(crate) fn save_wrapped_key_for_content(
    content_id_hex: &str,
    envelope: &EciesEnvelope,
) -> Result<(), String> {
    let key = normalize_content_key(content_id_hex);
    let mut store = read_wrapped_keys();
    store.insert(
        key,
        StoredEnvelope {
            ephemeral_pub: hex::encode(&envelope.ephemeral_pub),
            iv: hex::encode(&envelope.iv),
            ciphertext: hex::encode(&envelope.ciphertext),
        },
    );
    write_wrapped_keys(&store)
}

pub(crate) fn load_wrapped_key_for_content(content_id_hex: &str) -> Option<EciesEnvelope> {
    let key = normalize_content_key(content_id_hex);
    let store = read_wrapped_keys();
    let entry = store.get(&key)?;
    let ephemeral_pub = decode_hex_bytes(&entry.ephemeral_pub, "wrapped key ephemeral pub").ok()?;
    let iv = decode_hex_bytes(&entry.iv, "wrapped key iv").ok()?;
    let ciphertext = decode_hex_bytes(&entry.ciphertext, "wrapped key ciphertext").ok()?;
    if ephemeral_pub.len() != 65 || iv.len() != 12 || ciphertext.is_empty() {
        return None;
    }
    Some(EciesEnvelope {
        ephemeral_pub,
        iv,
        ciphertext,
    })
}

pub(crate) fn ensure_wrapped_key_from_ls3(
    content_id_hex: &str,
    owner_address: &str,
    grantee_address: &str,
) -> Result<Option<EciesEnvelope>, String> {
    if let Some(existing) = load_wrapped_key_for_content(content_id_hex) {
        return Ok(Some(existing));
    }

    let normalized_content_id = normalize_content_id_hex(content_id_hex)?;
    let owner = normalize_address(owner_address)?;
    let grantee = normalize_address(grantee_address)?;
    let envelope_ids = query_envelope_ids(&normalized_content_id, &owner, &grantee)?;
    if envelope_ids.is_empty() {
        return Ok(None);
    }

    for envelope_id in envelope_ids {
        let payload = fetch_resolve_payload(&envelope_id)?;
        if let Some(envelope) =
            parse_envelope_payload(&payload, &normalized_content_id, &owner, &grantee)
        {
            save_wrapped_key_for_content(&normalized_content_id, &envelope)?;
            return Ok(Some(envelope));
        }
    }

    Ok(None)
}

fn query_envelope_ids(
    content_id_hex: &str,
    owner_address: &str,
    grantee_address: &str,
) -> Result<Vec<String>, String> {
    let payload = http_post_json(
        &format!("{}/tags/query", load_agent_url()),
        json!({
            "filters": [
                {"key": "App-Name", "value": "Heaven"},
                {"key": "Heaven-Type", "value": ENVELOPE_TAG_TYPE},
                {"key": "Content-Id", "value": content_id_hex},
                {"key": "Owner", "value": owner_address},
                {"key": "Grantee", "value": grantee_address},
            ],
            "first": 8,
            "include_tags": false,
        }),
    )?;
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::<String>::new();
    for item in items {
        let id = item
            .get("dataitem_id")
            .and_then(Value::as_str)
            .or_else(|| item.get("dataitemId").and_then(Value::as_str))
            .or_else(|| item.get("id").and_then(Value::as_str))
            .map(str::trim)
            .unwrap_or_default();
        if !id.is_empty() {
            out.push(id.to_string());
        }
    }
    Ok(out)
}

fn fetch_resolve_payload(dataitem_id: &str) -> Result<Vec<u8>, String> {
    let id = dataitem_id.trim();
    if id.is_empty() {
        return Err("Envelope dataitem id is empty".to_string());
    }
    http_get_bytes(&format!("{}/resolve/{id}", load_gateway_url()))
}

fn parse_envelope_payload(
    payload: &[u8],
    expected_content_id: &str,
    expected_owner: &str,
    expected_grantee: &str,
) -> Option<EciesEnvelope> {
    let json: Value = serde_json::from_slice(payload).ok()?;
    if json.get("version").and_then(Value::as_u64).unwrap_or(0) != 1 {
        return None;
    }

    let content_id = json
        .get("contentId")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if content_id != expected_content_id.to_lowercase() {
        return None;
    }
    let owner = json
        .get("owner")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if owner != expected_owner.to_lowercase() {
        return None;
    }
    let grantee = json
        .get("grantee")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_lowercase();
    if grantee != expected_grantee.to_lowercase() {
        return None;
    }

    let ephemeral_pub = decode_hex_bytes(
        json.get("ephemeralPub")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "envelope ephemeralPub",
    )
    .ok()?;
    let iv = decode_hex_bytes(
        json.get("iv").and_then(Value::as_str).unwrap_or_default(),
        "envelope iv",
    )
    .ok()?;
    let ciphertext = decode_hex_bytes(
        json.get("ciphertext")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "envelope ciphertext",
    )
    .ok()?;
    if ephemeral_pub.len() != 65 || iv.len() != 12 || ciphertext.is_empty() {
        return None;
    }

    Some(EciesEnvelope {
        ephemeral_pub,
        iv,
        ciphertext,
    })
}
