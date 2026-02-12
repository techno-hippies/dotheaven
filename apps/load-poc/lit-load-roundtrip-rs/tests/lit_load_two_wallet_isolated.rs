use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use ethers::signers::{LocalWallet, Signer};
use ethers::utils::to_checksum;
use lit_rust_sdk::accs::hash_unified_access_control_conditions;
use lit_rust_sdk::{
    create_lit_client, create_siwe_message_with_resources, generate_session_key_pair, naga_dev,
    naga_local, naga_mainnet, naga_proto, naga_staging, naga_test, sign_siwe_with_eoa, AuthConfig,
    AuthContext, DecryptParams, EncryptParams, LitAbility, LitClient, NetworkConfig,
    ResourceAbilityRequest,
};
use rand::RngCore;
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const DEFAULT_LOAD_TURBO_UPLOAD_URL: &str = "https://loaded-turbo-api.load.network";
const DEFAULT_LOAD_TURBO_TOKEN: &str = "ethereum";
const DEFAULT_LOAD_GATEWAY_URL: &str = "https://gateway.s3-node-1.load.network";
const ALGO_AES_GCM_256: u8 = 1;

#[derive(Debug, Clone)]
struct ParsedContentBlob {
    lit_ciphertext_base64: String,
    data_to_encrypt_hash_hex: String,
    algo: u8,
    iv: Vec<u8>,
    encrypted_audio: Vec<u8>,
}

#[derive(Debug, Clone)]
struct UploadReceipt {
    id: String,
    gateway_url: String,
}

#[derive(Debug, Clone)]
struct TestConfig {
    lit_network: String,
    lit_rpc_url: String,
    lit_chain: String,
    load_upload_url: String,
    load_upload_token: String,
    load_gateway_url: String,
    sample_audio_path: Option<PathBuf>,
}

impl TestConfig {
    fn from_env() -> Result<Self> {
        let lit_rpc_url = resolve_lit_rpc_url().ok_or_else(|| {
            anyhow!(
                "Missing Lit RPC URL. Set HEAVEN_LIT_RPC_URL or LIT_RPC_URL (or LIT_TXSENDER_RPC_URL / LIT_YELLOWSTONE_PRIVATE_RPC_URL / LOCAL_RPC_URL)."
            )
        })?;

        Ok(Self {
            lit_network: env_nonempty(&["HEAVEN_LIT_NETWORK", "LIT_NETWORK"])
                .unwrap_or_else(|| "naga-dev".to_string()),
            lit_rpc_url,
            lit_chain: env_nonempty(&["HEAVEN_TEST_CHAIN", "HEAVEN_LIT_CHAIN"])
                .unwrap_or_else(|| "baseSepolia".to_string()),
            load_upload_url: env_nonempty(&["HEAVEN_LOAD_TURBO_UPLOAD_URL"])
                .unwrap_or_else(|| DEFAULT_LOAD_TURBO_UPLOAD_URL.to_string())
                .trim_end_matches('/')
                .to_string(),
            load_upload_token: env_nonempty(&["HEAVEN_LOAD_TURBO_TOKEN"])
                .unwrap_or_else(|| DEFAULT_LOAD_TURBO_TOKEN.to_string())
                .to_ascii_lowercase(),
            load_gateway_url: env_nonempty(&["HEAVEN_LOAD_GATEWAY_URL"])
                .unwrap_or_else(|| DEFAULT_LOAD_GATEWAY_URL.to_string())
                .trim_end_matches('/')
                .to_string(),
            sample_audio_path: std::env::var("HEAVEN_TEST_AUDIO_PATH")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .map(PathBuf::from),
        })
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires live Lit + Load endpoints"]
async fn isolated_two_wallet_encrypt_upload_decrypt_roundtrip() -> Result<()> {
    let _ = dotenvy::dotenv();

    let cfg = TestConfig::from_env()?;
    println!(
        "[config] litNetwork={} litChain={} uploadUrl={} uploadToken={}",
        cfg.lit_network, cfg.lit_chain, cfg.load_upload_url, cfg.load_upload_token
    );

    let client = create_lit_client(
        config_for_network(&cfg.lit_network)?.with_rpc_url(cfg.lit_rpc_url.clone()),
    )
    .await?;

    let uploader_wallet = wallet_from_env_or_random("HEAVEN_TEST_UPLOADER_PRIVATE_KEY")?;
    let mut recipient_wallet = wallet_from_env_or_random("HEAVEN_TEST_RECIPIENT_PRIVATE_KEY")?;
    if uploader_wallet.address() == recipient_wallet.address() {
        recipient_wallet = LocalWallet::new(&mut rand::thread_rng());
    }

    let uploader_address = to_checksum(&uploader_wallet.address(), None);
    let recipient_address = to_checksum(&recipient_wallet.address(), None);
    println!(
        "[wallets] uploader={} recipient={}",
        uploader_address, recipient_address
    );

    let recipient_auth_context = create_wallet_auth_context(
        &client,
        &recipient_wallet,
        "Heaven isolated recipient decrypt test",
    )
    .await?;
    let uploader_auth_context = create_wallet_auth_context(
        &client,
        &uploader_wallet,
        "Heaven isolated uploader negative decrypt test",
    )
    .await?;

    let source_bytes = load_source_bytes(cfg.sample_audio_path.as_deref())?;
    let content_id = random_content_id_hex();
    let unified_acc = wallet_ownership_acc(&cfg.lit_chain, &recipient_address);
    let acc_hash = hash_unified_access_control_conditions(&unified_acc)?;
    println!(
        "[acc] hash=0x{} conditions={}",
        hex::encode(acc_hash),
        serde_json::to_string(&unified_acc)?
    );

    let (blob, data_to_encrypt_hash_hex) =
        encrypt_and_pack_blob(&client, &unified_acc, &content_id, &source_bytes).await?;
    println!(
        "[encrypt] contentId={} sourceBytes={} blobBytes={} dataToEncryptHash={}",
        content_id,
        source_bytes.len(),
        blob.len(),
        data_to_encrypt_hash_hex
    );

    // Control check: decrypt freshly-encrypted payload before any upload/fetch.
    let pre_upload_parsed = parse_content_blob(&blob)?;
    let pre_upload_decrypt = client
        .decrypt(
            DecryptParams {
                ciphertext_base64: pre_upload_parsed.lit_ciphertext_base64.clone(),
                data_to_encrypt_hash_hex: pre_upload_parsed.data_to_encrypt_hash_hex.clone(),
                unified_access_control_conditions: Some(unified_acc.clone()),
                hashed_access_control_conditions_hex: None,
            },
            &recipient_auth_context,
            &cfg.lit_chain,
        )
        .await
        .context("Pre-upload recipient decrypt failed")?;
    let pre_payload: Value = serde_json::from_slice(&pre_upload_decrypt.decrypted_data)
        .context("Failed parsing pre-upload decrypted payload JSON")?;
    let pre_content_id = pre_payload
        .get("contentId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !pre_content_id.eq_ignore_ascii_case(&content_id) {
        bail!("Pre-upload payload contentId mismatch: expected {content_id}, got {pre_content_id}");
    }
    println!("[pre-upload] recipient decrypt succeeded");

    let upload = upload_blob_as_wallet(&cfg, &uploader_wallet, &blob).await?;
    println!("[upload] id={} gateway={}", upload.id, upload.gateway_url);

    let fetched_blob = http_get_bytes(&upload.gateway_url)?;
    let parsed_blob = parse_content_blob(&fetched_blob)?;
    println!(
        "[fetch] blobBytes={} ctLen={} hashLen={} ivLen={} audioLen={}",
        fetched_blob.len(),
        parsed_blob.lit_ciphertext_base64.len(),
        parsed_blob.data_to_encrypt_hash_hex.len(),
        parsed_blob.iv.len(),
        parsed_blob.encrypted_audio.len()
    );

    if parsed_blob.data_to_encrypt_hash_hex != data_to_encrypt_hash_hex {
        bail!(
            "dataToEncryptHash mismatch: expected {}, got {}",
            data_to_encrypt_hash_hex,
            parsed_blob.data_to_encrypt_hash_hex
        );
    }

    let uploader_decrypt = client
        .decrypt(
            DecryptParams {
                ciphertext_base64: parsed_blob.lit_ciphertext_base64.clone(),
                data_to_encrypt_hash_hex: parsed_blob.data_to_encrypt_hash_hex.clone(),
                unified_access_control_conditions: Some(unified_acc.clone()),
                hashed_access_control_conditions_hex: None,
            },
            &uploader_auth_context,
            &cfg.lit_chain,
        )
        .await;
    if let Ok(resp) = uploader_decrypt {
        bail!(
            "Uploader unexpectedly decrypted recipient-only payload ({} bytes)",
            resp.decrypted_data.len()
        );
    } else {
        println!("[negative] uploader decrypt blocked as expected");
    }

    let recipient_decrypt = client
        .decrypt(
            DecryptParams {
                ciphertext_base64: parsed_blob.lit_ciphertext_base64.clone(),
                data_to_encrypt_hash_hex: parsed_blob.data_to_encrypt_hash_hex.clone(),
                unified_access_control_conditions: Some(unified_acc),
                hashed_access_control_conditions_hex: None,
            },
            &recipient_auth_context,
            &cfg.lit_chain,
        )
        .await
        .context("Recipient decrypt failed")?;

    let payload: Value = serde_json::from_slice(&recipient_decrypt.decrypted_data)
        .context("Failed parsing recipient decrypted payload JSON")?;
    let payload_content_id = payload
        .get("contentId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !payload_content_id.eq_ignore_ascii_case(&content_id) {
        bail!(
            "Recipient payload contentId mismatch: expected {content_id}, got {payload_content_id}"
        );
    }

    let decrypted_audio = decrypt_audio_payload(&parsed_blob, &payload)?;
    if decrypted_audio != source_bytes {
        bail!(
            "Decrypted audio mismatch: expected {} bytes, got {}",
            source_bytes.len(),
            decrypted_audio.len()
        );
    }

    println!(
        "[ok] isolated two-wallet roundtrip succeeded: uploader={} recipient={} uploadId={} bytes={}",
        uploader_address,
        recipient_address,
        upload.id,
        decrypted_audio.len()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires live Lit endpoints"]
async fn isolated_lit_control_encrypt_decrypt_single_wallet() -> Result<()> {
    let _ = dotenvy::dotenv();
    let cfg = TestConfig::from_env()?;
    let client =
        create_lit_client(config_for_network(&cfg.lit_network)?.with_rpc_url(cfg.lit_rpc_url))
            .await?;

    let wallet = wallet_from_env_or_random("HEAVEN_TEST_RECIPIENT_PRIVATE_KEY")?;
    let auth_context =
        create_wallet_auth_context(&client, &wallet, "Heaven isolated control decrypt test")
            .await?;
    let wallet_address = to_checksum(&wallet.address(), None);

    let acc = json!([
        {
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "chain": "ethereum",
            "method": "eth_getBalance",
            "parameters": [":userAddress", "latest"],
            "returnValueTest": {
                "comparator": ">=",
                "value": "0"
            }
        }
    ]);

    let plaintext = format!("control:{}", wallet_address);
    let encrypted = client
        .encrypt(EncryptParams {
            data_to_encrypt: plaintext.as_bytes().to_vec(),
            unified_access_control_conditions: Some(acc.clone()),
            hashed_access_control_conditions_hex: None,
            metadata: None,
        })
        .await
        .context("control encrypt failed")?;

    let decrypted = client
        .decrypt(
            DecryptParams {
                ciphertext_base64: encrypted.ciphertext_base64,
                data_to_encrypt_hash_hex: encrypted.data_to_encrypt_hash_hex,
                unified_access_control_conditions: Some(acc),
                hashed_access_control_conditions_hex: None,
            },
            &auth_context,
            "ethereum",
        )
        .await
        .context("control decrypt failed")?;
    let recovered = String::from_utf8(decrypted.decrypted_data).context("utf8 decode failed")?;
    if recovered != plaintext {
        bail!("control decrypt mismatch");
    }
    println!(
        "[control] lit encrypt/decrypt succeeded for {}",
        wallet_address
    );
    Ok(())
}

async fn create_wallet_auth_context(
    client: &LitClient,
    wallet: &LocalWallet,
    statement: &str,
) -> Result<AuthContext> {
    let session_key_pair = generate_session_key_pair();
    let auth_config = AuthConfig {
        capability_auth_sigs: vec![],
        expiration: (chrono::Utc::now() + chrono::Duration::minutes(30)).to_rfc3339(),
        statement: statement.to_string(),
        domain: "localhost".into(),
        resources: vec![ResourceAbilityRequest {
            ability: LitAbility::AccessControlConditionDecryption,
            resource_id: "*".into(),
            data: None,
        }],
    };

    let nonce = client
        .handshake_result()
        .core_node_config
        .latest_blockhash
        .clone();
    let wallet_address = to_checksum(&wallet.address(), None);
    let siwe_message = create_siwe_message_with_resources(
        &wallet_address,
        &session_key_pair.public_key,
        &auth_config,
        &nonce,
    )?;

    let private_key_hex = wallet_private_key_hex(wallet);
    let auth_sig = sign_siwe_with_eoa(&private_key_hex, &siwe_message).await?;

    Ok(AuthContext {
        session_key_pair,
        auth_config,
        delegation_auth_sig: auth_sig,
    })
}

fn wallet_private_key_hex(wallet: &LocalWallet) -> String {
    let bytes = wallet.signer().to_bytes();
    format!("0x{}", hex::encode(bytes))
}

fn wallet_from_env_or_random(var: &str) -> Result<LocalWallet> {
    if let Some(v) = env_nonempty(&[var]) {
        let normalized = if v.starts_with("0x") {
            v
        } else {
            format!("0x{v}")
        };
        return normalized
            .parse::<LocalWallet>()
            .map_err(|e| anyhow!("Invalid {var}: {e}"));
    }
    Ok(LocalWallet::new(&mut rand::thread_rng()))
}

fn wallet_ownership_acc(chain: &str, recipient_address: &str) -> Value {
    json!([
        {
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "method": "",
            "parameters": [":userAddress"],
            "returnValueTest": {
                "comparator": "=",
                "value": recipient_address
            },
            "chain": chain
        }
    ])
}

async fn encrypt_and_pack_blob(
    client: &LitClient,
    unified_acc: &Value,
    content_id: &str,
    source_bytes: &[u8],
) -> Result<(Vec<u8>, String)> {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);

    let cipher = Aes256Gcm::new_from_slice(&key).context("Invalid AES key length")?;
    let encrypted_audio = cipher
        .encrypt(Nonce::from_slice(&iv), source_bytes)
        .map_err(|e| anyhow!("Failed to AES-encrypt source payload: {e:?}"))?;

    let key_base64 = base64::engine::general_purpose::STANDARD.encode(key);
    key.fill(0);
    let key_payload = json!({
        "contentId": content_id.to_ascii_lowercase(),
        "key": key_base64,
    });

    let encrypt_response = client
        .encrypt(EncryptParams {
            data_to_encrypt: serde_json::to_vec(&key_payload)?,
            unified_access_control_conditions: Some(unified_acc.clone()),
            hashed_access_control_conditions_hex: None,
            metadata: None,
        })
        .await
        .context("Lit encrypt failed")?;

    let blob = build_blob(
        encrypt_response.ciphertext_base64.as_bytes(),
        encrypt_response.data_to_encrypt_hash_hex.as_bytes(),
        &iv,
        &encrypted_audio,
    );
    Ok((blob, encrypt_response.data_to_encrypt_hash_hex))
}

async fn upload_blob_as_wallet(
    cfg: &TestConfig,
    wallet: &LocalWallet,
    blob: &[u8],
) -> Result<UploadReceipt> {
    let owner = wallet
        .signer()
        .verifying_key()
        .to_encoded_point(false)
        .as_bytes()
        .to_vec();

    let tags = vec![
        Tag::new("Content-Type", "application/octet-stream"),
        Tag::new("App-Name", "heaven-lit-load-isolated-two-wallet-test"),
    ];
    let mut item = DataItem::new(None, None, tags, blob.to_vec())
        .map_err(|e| anyhow!("Failed to build dataitem: {e}"))?;
    item.signature_type = SignatureType::Ethereum;
    item.owner = owner;

    let signing_message = item.signing_message();
    let signature = wallet
        .sign_message(&signing_message)
        .await
        .map_err(|e| anyhow!("Failed to sign dataitem with uploader wallet: {e}"))?;
    item.signature = ethers_signature_to_65_bytes(signature);

    let signed_dataitem = item
        .to_bytes()
        .map_err(|e| anyhow!("Failed to encode signed dataitem bytes: {e}"))?;
    upload_signed_dataitem(cfg, &signed_dataitem)
}

fn upload_signed_dataitem(cfg: &TestConfig, signed_dataitem: &[u8]) -> Result<UploadReceipt> {
    let endpoint = format!("{}/v1/tx/{}", cfg.load_upload_url, cfg.load_upload_token);
    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .http_status_as_error(false)
        .build();
    let mut resp = request
        .send(signed_dataitem)
        .map_err(|e| anyhow!("Load upload request failed: {e}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        bail!("Load upload failed ({status}): {body}");
    }

    let id =
        extract_upload_id(&body).ok_or_else(|| anyhow!("Upload succeeded but no id returned"))?;
    let gateway_base = extract_gateway_base(&body).unwrap_or_else(|| cfg.load_gateway_url.clone());
    Ok(UploadReceipt {
        id: id.clone(),
        gateway_url: format!("{}/resolve/{id}", gateway_base.trim_end_matches('/')),
    })
}

fn extract_upload_id(v: &Value) -> Option<String> {
    let candidates = [
        v.get("id"),
        v.get("dataitemId"),
        v.get("dataitem_id"),
        v.get("receipt").and_then(|r| r.get("id")),
        v.get("result").and_then(|r| r.get("id")),
        v.get("result")
            .and_then(|r| r.get("receipt"))
            .and_then(|r| r.get("id")),
    ];
    for candidate in candidates {
        if let Some(Value::String(s)) = candidate {
            if !s.trim().is_empty() {
                return Some(s.clone());
            }
        }
    }
    None
}

fn extract_gateway_base(payload: &Value) -> Option<String> {
    payload
        .get("dataCaches")
        .or_else(|| payload.get("data_caches"))
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("gateway")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        })
}

fn ethers_signature_to_65_bytes(sig: ethers::types::Signature) -> Vec<u8> {
    let mut out = Vec::with_capacity(65);
    let mut r = [0u8; 32];
    let mut s = [0u8; 32];
    sig.r.to_big_endian(&mut r);
    sig.s.to_big_endian(&mut s);
    out.extend_from_slice(&r);
    out.extend_from_slice(&s);
    let v = if sig.v >= 27 {
        sig.v as u8
    } else {
        (sig.v as u8) + 27
    };
    out.push(v);
    out
}

fn build_blob(
    lit_ciphertext_bytes: &[u8],
    data_to_encrypt_hash_bytes: &[u8],
    iv: &[u8; 12],
    encrypted_audio: &[u8],
) -> Vec<u8> {
    let header_size = 4
        + lit_ciphertext_bytes.len()
        + 4
        + data_to_encrypt_hash_bytes.len()
        + 1
        + 1
        + iv.len()
        + 4;

    let mut out = Vec::with_capacity(header_size + encrypted_audio.len());
    out.extend_from_slice(&(lit_ciphertext_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(lit_ciphertext_bytes);
    out.extend_from_slice(&(data_to_encrypt_hash_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(data_to_encrypt_hash_bytes);
    out.push(ALGO_AES_GCM_256);
    out.push(iv.len() as u8);
    out.extend_from_slice(iv);
    out.extend_from_slice(&(encrypted_audio.len() as u32).to_be_bytes());
    out.extend_from_slice(encrypted_audio);
    out
}

fn parse_content_blob(blob: &[u8]) -> Result<ParsedContentBlob> {
    match parse_content_blob_raw(blob) {
        Ok(parsed) => Ok(parsed),
        Err(raw_err) => {
            let item = DataItem::from_bytes(blob)
                .map_err(|_| anyhow!("Failed parsing content blob: {raw_err}"))?;
            parse_content_blob_raw(&item.data)
                .map_err(|inner| anyhow!("Failed parsing content blob dataitem payload: {inner}"))
        }
    }
}

fn parse_content_blob_raw(blob: &[u8]) -> Result<ParsedContentBlob> {
    fn take<'a>(blob: &'a [u8], offset: &mut usize, len: usize, label: &str) -> Result<&'a [u8]> {
        if *offset + len > blob.len() {
            bail!(
                "Malformed content blob: truncated {label} (need {len}, have {})",
                blob.len().saturating_sub(*offset)
            );
        }
        let out = &blob[*offset..*offset + len];
        *offset += len;
        Ok(out)
    }

    fn take_u32(blob: &[u8], offset: &mut usize, label: &str) -> Result<usize> {
        let bytes = take(blob, offset, 4, label)?;
        let mut arr = [0u8; 4];
        arr.copy_from_slice(bytes);
        Ok(u32::from_be_bytes(arr) as usize)
    }

    let mut offset = 0usize;
    let ct_len = take_u32(blob, &mut offset, "ciphertext length")?;
    let ct = take(blob, &mut offset, ct_len, "ciphertext")?;
    let hash_len = take_u32(blob, &mut offset, "hash length")?;
    let hash = take(blob, &mut offset, hash_len, "hash")?;

    let algo = *take(blob, &mut offset, 1, "algorithm byte")?
        .first()
        .ok_or_else(|| anyhow!("Missing algorithm byte"))?;
    let iv_len = *take(blob, &mut offset, 1, "iv length byte")?
        .first()
        .ok_or_else(|| anyhow!("Missing iv length byte"))? as usize;
    let iv = take(blob, &mut offset, iv_len, "iv")?.to_vec();
    let audio_len = take_u32(blob, &mut offset, "audio length")?;
    let encrypted_audio = take(blob, &mut offset, audio_len, "encrypted audio")?.to_vec();

    if offset != blob.len() {
        bail!(
            "Malformed content blob: trailing bytes detected ({})",
            blob.len() - offset
        );
    }

    Ok(ParsedContentBlob {
        lit_ciphertext_base64: String::from_utf8(ct.to_vec())
            .context("Invalid UTF-8 ciphertext in content blob")?,
        data_to_encrypt_hash_hex: String::from_utf8(hash.to_vec())
            .context("Invalid UTF-8 hash in content blob")?,
        algo,
        iv,
        encrypted_audio,
    })
}

fn decrypt_audio_payload(
    parsed_blob: &ParsedContentBlob,
    decrypted_payload: &Value,
) -> Result<Vec<u8>> {
    if parsed_blob.algo != ALGO_AES_GCM_256 {
        bail!("Unsupported algo in blob: {}", parsed_blob.algo);
    }
    let key_base64 = decrypted_payload
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("Decrypted payload missing key"))?;
    let mut key = base64::engine::general_purpose::STANDARD
        .decode(key_base64.as_bytes())
        .context("Invalid base64 key in decrypted payload")?;
    if key.len() != 32 {
        bail!(
            "Invalid AES key length in decrypted payload: expected 32, got {}",
            key.len()
        );
    }
    if parsed_blob.iv.len() != 12 {
        bail!(
            "Invalid IV length in blob: expected 12, got {}",
            parsed_blob.iv.len()
        );
    }
    let cipher = Aes256Gcm::new_from_slice(&key).context("Failed to init AES key for decrypt")?;
    let decrypted_audio = cipher
        .decrypt(
            Nonce::from_slice(&parsed_blob.iv),
            parsed_blob.encrypted_audio.as_slice(),
        )
        .map_err(|e| anyhow!("AES decrypt failed for uploaded audio payload: {e:?}"))?;
    key.fill(0);
    Ok(decrypted_audio)
}

fn load_source_bytes(path: Option<&Path>) -> Result<Vec<u8>> {
    if let Some(path) = path {
        let bytes = fs::read(path)
            .with_context(|| format!("Failed reading HEAVEN_TEST_AUDIO_PATH {}", path.display()))?;
        if bytes.is_empty() {
            bail!("HEAVEN_TEST_AUDIO_PATH is empty: {}", path.display());
        }
        return Ok(bytes);
    }

    let mut bytes = vec![0u8; 96 * 1024];
    rand::thread_rng().fill_bytes(&mut bytes);
    Ok(bytes)
}

fn random_content_id_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("0x{}", hex::encode(bytes))
}

fn config_for_network(network: &str) -> Result<NetworkConfig> {
    Ok(match network {
        "naga-dev" => naga_dev(),
        "naga-test" => naga_test(),
        "naga-staging" => naga_staging(),
        "naga-proto" => naga_proto(),
        "naga" => naga_mainnet(),
        "naga-local" => naga_local(),
        _ => bail!("Unsupported Lit network: {network}"),
    })
}

fn env_nonempty(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn resolve_lit_rpc_url() -> Option<String> {
    env_nonempty(&[
        "HEAVEN_LIT_RPC_URL",
        "LIT_RPC_URL",
        "LIT_TXSENDER_RPC_URL",
        "LIT_YELLOWSTONE_PRIVATE_RPC_URL",
        "LOCAL_RPC_URL",
    ])
}

fn http_get_bytes(url: &str) -> Result<Vec<u8>> {
    let request = ureq::get(url).config().http_status_as_error(false).build();
    let mut resp = request
        .call()
        .map_err(|e| anyhow!("HTTP GET failed ({url}): {e}"))?;
    let status = resp.status().as_u16();
    if status >= 400 {
        let body = read_json_or_text(&mut resp);
        bail!("HTTP GET {url} failed ({status}): {body}");
    }
    let mut bytes = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| anyhow!("Failed reading HTTP body ({url}): {e}"))?;
    Ok(bytes)
}

fn read_json_or_text(resp: &mut ureq::http::Response<ureq::Body>) -> Value {
    let mut body = String::new();
    if resp
        .body_mut()
        .as_reader()
        .read_to_string(&mut body)
        .is_err()
    {
        return Value::Null;
    }
    if body.trim().is_empty() {
        return Value::Null;
    }
    serde_json::from_str(&body).unwrap_or_else(|_| json!({ "raw": body }))
}
