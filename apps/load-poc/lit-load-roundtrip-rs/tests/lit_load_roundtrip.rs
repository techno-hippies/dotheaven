use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use ethers::signers::Signer;
use lit_rust_sdk::accs::hash_unified_access_control_conditions;
use lit_rust_sdk::{
    auth_method_id_for_eth_wallet, create_lit_client, naga_dev, naga_local, naga_mainnet,
    naga_proto, naga_staging, naga_test, AuthConfig, AuthContext, AuthData, AuthSig, DecryptParams,
    EncryptParams, LitAbility, LitClient, NetworkConfig, PkpSigner, ResourceAbilityRequest,
    SessionKeyPair,
};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const DEFAULT_CONTENT_ACCESS_MIRROR: &str = "0x4dD375b09160d09d4C33312406dFFAFb3f8A5035";
const DEFAULT_LOAD_TURBO_UPLOAD_URL: &str = "https://loaded-turbo-api.load.network";
const DEFAULT_LOAD_TURBO_TOKEN: &str = "ethereum";
const DEFAULT_LOAD_GATEWAY_URL: &str = "https://gateway.s3-node-1.load.network";
const ALGO_AES_GCM_256: u8 = 1;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAuth {
    pkp_address: Option<String>,
    pkp_public_key: Option<String>,
    auth_method_type: Option<u32>,
    auth_method_id: Option<String>,
    access_token: Option<String>,
    eoa_address: Option<String>,
    lit_session_key_pair: Option<SessionKeyPair>,
    lit_delegation_auth_sig: Option<AuthSig>,
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AccMode {
    EvmBasic,
    EvmContract,
}

#[derive(Debug, Clone)]
struct TestConfig {
    auth_file: PathBuf,
    lit_network: String,
    lit_rpc_url: String,
    lit_chain: String,
    acc_mode: AccMode,
    content_access_mirror: String,
    content_id_override: Option<String>,
    load_upload_url: String,
    load_upload_token: String,
    load_gateway_url: String,
    sample_audio_path: Option<PathBuf>,
}

impl TestConfig {
    fn from_env() -> Result<Self> {
        let acc_mode = match std::env::var("HEAVEN_TEST_ACC_MODE")
            .unwrap_or_else(|_| "evm_basic".to_string())
            .trim()
            .to_ascii_lowercase()
            .as_str()
        {
            "evm_contract" => AccMode::EvmContract,
            "evm_basic" => AccMode::EvmBasic,
            other => bail!(
                "Unsupported HEAVEN_TEST_ACC_MODE={other}; expected evm_basic or evm_contract"
            ),
        };

        let lit_chain =
            env_nonempty(&["HEAVEN_TEST_CHAIN", "HEAVEN_LIT_CHAIN"]).unwrap_or_else(|| {
                if acc_mode == AccMode::EvmContract {
                    "baseSepolia".to_string()
                } else {
                    "ethereum".to_string()
                }
            });

        let auth_file = std::env::var("HEAVEN_TEST_AUTH_FILE")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(default_auth_file);

        let lit_rpc_url = resolve_lit_rpc_url().ok_or_else(|| {
            anyhow!(
                "Missing Lit RPC URL. Set HEAVEN_LIT_RPC_URL or LIT_RPC_URL (or LIT_TXSENDER_RPC_URL / LIT_YELLOWSTONE_PRIVATE_RPC_URL / LOCAL_RPC_URL)."
            )
        })?;

        Ok(Self {
            auth_file,
            lit_network: env_nonempty(&["HEAVEN_LIT_NETWORK", "LIT_NETWORK"])
                .unwrap_or_else(|| "naga-dev".to_string()),
            lit_rpc_url,
            lit_chain,
            acc_mode,
            content_access_mirror: env_nonempty(&["HEAVEN_CONTENT_ACCESS_MIRROR"])
                .unwrap_or_else(|| DEFAULT_CONTENT_ACCESS_MIRROR.to_string()),
            content_id_override: env_nonempty(&["HEAVEN_TEST_CONTENT_ID"]),
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
#[ignore = "requires live Lit + Load services and valid persisted auth"]
async fn lit_load_encrypt_upload_fetch_decrypt_roundtrip() -> Result<()> {
    let _ = dotenvy::dotenv();

    let cfg = TestConfig::from_env()?;
    println!("[config] authFile={}", cfg.auth_file.display());
    println!(
        "[config] litNetwork={} litChain={} accMode={:?}",
        cfg.lit_network, cfg.lit_chain, cfg.acc_mode
    );
    println!(
        "[config] uploadUrl={} uploadToken={} gateway={}",
        cfg.load_upload_url, cfg.load_upload_token, cfg.load_gateway_url
    );

    let auth = load_persisted_auth(&cfg.auth_file)?;
    let (client, auth_context) = initialize_client_and_auth_context(&cfg, &auth).await?;

    let signer = auth_context.delegation_auth_sig.address.clone();
    println!(
        "[auth] pkpAddress={} delegationSigner={}",
        auth.pkp_address.as_deref().unwrap_or("n/a"),
        signer
    );

    let source_bytes = load_source_bytes(cfg.sample_audio_path.as_deref())?;
    let content_id = match cfg.content_id_override.as_deref() {
        Some(value) => normalize_content_id_hex(value)?,
        None => random_content_id_hex(),
    };
    println!(
        "[roundtrip] sourceBytes={} contentId={}",
        source_bytes.len(),
        content_id
    );

    let unified_acc = build_unified_access_control_conditions(
        cfg.acc_mode,
        &cfg.lit_chain,
        &cfg.content_access_mirror,
        &content_id,
    );
    let acc_hash = hash_unified_access_control_conditions(&unified_acc)?;
    println!(
        "[acc] chain={} hash=0x{} conditions={}",
        cfg.lit_chain,
        hex::encode(acc_hash),
        serde_json::to_string(&unified_acc)?
    );

    let (blob, expected_hash_hex) =
        encrypt_and_pack_blob(&client, &unified_acc, &content_id, &source_bytes).await?;
    println!(
        "[encrypt] blobBytes={} dataToEncryptHash={}",
        blob.len(),
        expected_hash_hex
    );

    let upload = upload_blob_to_load(&client, &auth_context, &auth, &cfg, &blob).await?;
    println!(
        "[upload] id={} gateway={}",
        upload.id,
        upload.gateway_url.as_str()
    );

    let fetched_blob = http_get_bytes(&upload.gateway_url)?;
    println!("[fetch] fetchedBytes={}", fetched_blob.len());

    let parsed_blob = parse_content_blob(&fetched_blob)?;
    println!(
        "[parse] ctLen={} hashLen={} ivLen={} audioLen={}",
        parsed_blob.lit_ciphertext_base64.len(),
        parsed_blob.data_to_encrypt_hash_hex.len(),
        parsed_blob.iv.len(),
        parsed_blob.encrypted_audio.len()
    );
    if parsed_blob.data_to_encrypt_hash_hex != expected_hash_hex {
        bail!(
            "Blob hash mismatch: expected {}, got {}",
            expected_hash_hex,
            parsed_blob.data_to_encrypt_hash_hex
        );
    }

    let decrypt_response = client
        .decrypt(
            DecryptParams {
                ciphertext_base64: parsed_blob.lit_ciphertext_base64.clone(),
                data_to_encrypt_hash_hex: parsed_blob.data_to_encrypt_hash_hex.clone(),
                unified_access_control_conditions: Some(unified_acc),
                hashed_access_control_conditions_hex: None,
            },
            &auth_context,
            &cfg.lit_chain,
        )
        .await
        .context("Lit decrypt failed")?;

    let decrypted_payload: Value = serde_json::from_slice(&decrypt_response.decrypted_data)
        .context("Failed to parse decrypted key payload JSON")?;
    let payload_content_id = decrypted_payload
        .get("contentId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !payload_content_id.eq_ignore_ascii_case(&content_id) {
        bail!("Payload contentId mismatch: expected {content_id}, got {payload_content_id}");
    }

    let decrypted_audio = decrypt_audio_payload(&parsed_blob, &decrypted_payload)?;
    if decrypted_audio != source_bytes {
        bail!(
            "Audio bytes mismatch after decrypt: expected {} bytes, got {} bytes",
            source_bytes.len(),
            decrypted_audio.len()
        );
    }

    println!(
        "[ok] roundtrip completed: uploadId={} decryptedBytes={}",
        upload.id,
        decrypted_audio.len()
    );
    Ok(())
}

#[test]
fn unified_acc_hash_is_stable_for_key_order() -> Result<()> {
    let content_id = "0x1111111111111111111111111111111111111111111111111111111111111111";

    let acc_a = json!([
        {
            "conditionType": "evmContract",
            "contractAddress": DEFAULT_CONTENT_ACCESS_MIRROR,
            "chain": "baseSepolia",
            "functionName": "canAccess",
            "functionParams": [":userAddress", content_id],
            "functionAbi": {
                "type": "function",
                "name": "canAccess",
                "stateMutability": "view",
                "inputs": [
                    { "type": "address", "name": "user", "internalType": "address" },
                    { "type": "bytes32", "name": "contentId", "internalType": "bytes32" }
                ],
                "outputs": [{ "type": "bool", "name": "", "internalType": "bool" }]
            },
            "returnValueTest": { "key": "", "comparator": "=", "value": "true" }
        }
    ]);

    let acc_b = json!([
        {
            "returnValueTest": { "value": "true", "comparator": "=", "key": "" },
            "functionAbi": {
                "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
                "inputs": [
                    { "internalType": "address", "name": "user", "type": "address" },
                    { "internalType": "bytes32", "name": "contentId", "type": "bytes32" }
                ],
                "stateMutability": "view",
                "name": "canAccess",
                "type": "function"
            },
            "functionParams": [":userAddress", content_id],
            "functionName": "canAccess",
            "chain": "baseSepolia",
            "contractAddress": DEFAULT_CONTENT_ACCESS_MIRROR,
            "conditionType": "evmContract"
        }
    ]);

    let hash_a = hash_unified_access_control_conditions(&acc_a)?;
    let hash_b = hash_unified_access_control_conditions(&acc_b)?;
    assert_eq!(hash_a, hash_b, "ACC hash drifted for equivalent JSON");
    Ok(())
}

#[test]
fn unified_acc_hash_changes_when_chain_changes() -> Result<()> {
    let content_id = "0x1111111111111111111111111111111111111111111111111111111111111111";
    let acc_base = build_unified_access_control_conditions(
        AccMode::EvmContract,
        "baseSepolia",
        DEFAULT_CONTENT_ACCESS_MIRROR,
        content_id,
    );
    let acc_yellowstone = build_unified_access_control_conditions(
        AccMode::EvmContract,
        "yellowstone",
        DEFAULT_CONTENT_ACCESS_MIRROR,
        content_id,
    );

    let hash_base = hash_unified_access_control_conditions(&acc_base)?;
    let hash_yellowstone = hash_unified_access_control_conditions(&acc_yellowstone)?;
    assert_ne!(
        hash_base, hash_yellowstone,
        "ACC hash should change when chain changes"
    );
    Ok(())
}

async fn initialize_client_and_auth_context(
    cfg: &TestConfig,
    auth: &PersistedAuth,
) -> Result<(LitClient, AuthContext)> {
    let network = config_for_network(&cfg.lit_network)?.with_rpc_url(cfg.lit_rpc_url.clone());
    let client = create_lit_client(network).await?;

    let pkp_address = auth
        .pkp_address
        .clone()
        .ok_or_else(|| anyhow!("Missing pkpAddress in auth file"))?;
    let pkp_public_key = auth
        .pkp_public_key
        .clone()
        .ok_or_else(|| anyhow!("Missing pkpPublicKey in auth file"))?;

    if let (Some(session_key_pair), Some(delegation_auth_sig)) = (
        auth.lit_session_key_pair.clone(),
        auth.lit_delegation_auth_sig.clone(),
    ) {
        match client
            .create_pkp_auth_context_from_pre_generated(session_key_pair, delegation_auth_sig)
        {
            Ok(auth_context) => {
                if auth_context_matches_expected_pkp(&auth_context, &pkp_address) {
                    println!("[auth] using pre-generated delegation auth material");
                    return Ok((client, auth_context));
                }
                println!(
                    "[auth] pre-generated delegation signer mismatch: expected={}, got={}",
                    pkp_address, auth_context.delegation_auth_sig.address
                );
            }
            Err(err) => println!("[auth] pre-generated delegation auth invalid: {err}"),
        }
    }

    let auth_method_type = auth
        .auth_method_type
        .ok_or_else(|| anyhow!("Missing authMethodType in auth file"))?;
    let auth_method_id = auth
        .auth_method_id
        .clone()
        .ok_or_else(|| anyhow!("Missing authMethodId in auth file"))?;
    let access_token = auth
        .access_token
        .clone()
        .ok_or_else(|| anyhow!("Missing accessToken in auth file"))?;

    let auth_config = default_auth_config();
    let candidates =
        auth_method_id_candidates(auth, auth_method_type, &auth_method_id, &access_token);
    let mut last_err = "no authData candidates attempted".to_string();

    for candidate_id in candidates {
        let auth_data = AuthData {
            auth_method_id: candidate_id.clone(),
            auth_method_type,
            access_token: access_token.clone(),
            public_key: None,
            metadata: None,
        };
        match client
            .create_pkp_auth_context(
                &pkp_public_key,
                auth_data,
                auth_config.clone(),
                None,
                None,
                None,
            )
            .await
        {
            Ok(auth_context) => {
                if !auth_context_matches_expected_pkp(&auth_context, &pkp_address) {
                    println!(
                        "[auth] authData candidate signer mismatch (candidate={} expected={} got={})",
                        candidate_id, pkp_address, auth_context.delegation_auth_sig.address
                    );
                    continue;
                }
                println!("[auth] using authData candidate {}", candidate_id);
                return Ok((client, auth_context));
            }
            Err(err) => {
                last_err = format!("{candidate_id}: {err}");
            }
        }
    }

    bail!("Failed to initialize Lit auth context from authData ({last_err})");
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

async fn upload_blob_to_load(
    client: &LitClient,
    auth_context: &AuthContext,
    auth: &PersistedAuth,
    cfg: &TestConfig,
    blob: &[u8],
) -> Result<UploadReceipt> {
    let owner = parse_pkp_public_key(auth)?;
    let pkp_public_key = auth
        .pkp_public_key
        .as_deref()
        .ok_or_else(|| anyhow!("Missing pkpPublicKey in auth file"))?
        .to_string();

    let tags = vec![
        Tag::new("Content-Type", "application/octet-stream"),
        Tag::new("App-Name", "heaven-lit-load-roundtrip-rs"),
    ];

    let mut item = DataItem::new(None, None, tags, blob.to_vec())
        .map_err(|e| anyhow!("Failed to build dataitem: {e}"))?;
    item.signature_type = SignatureType::Ethereum;
    item.owner = owner;

    let signer = PkpSigner::new(client.clone(), pkp_public_key, auth_context.clone(), 1)
        .map_err(|e| anyhow!("Failed to initialize PkpSigner: {e}"))?;
    let signing_message = item.signing_message();
    let signature = signer
        .sign_message(&signing_message)
        .await
        .map_err(|e| anyhow!("Failed to PKP-sign dataitem: {e}"))?;
    item.signature = ethers_signature_to_65_bytes(signature);

    let signed_dataitem = item
        .to_bytes()
        .map_err(|e| anyhow!("Failed to encode signed dataitem: {e}"))?;
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

fn build_unified_access_control_conditions(
    mode: AccMode,
    chain: &str,
    content_access_mirror: &str,
    content_id_hex: &str,
) -> Value {
    match mode {
        AccMode::EvmBasic => json!([
            {
                "conditionType": "evmBasic",
                "contractAddress": "",
                "standardContractType": "",
                "chain": chain,
                "method": "eth_getBalance",
                "parameters": [":userAddress", "latest"],
                "returnValueTest": { "comparator": ">=", "value": "0" }
            }
        ]),
        AccMode::EvmContract => json!([
            {
                "conditionType": "evmContract",
                "contractAddress": content_access_mirror,
                "chain": chain,
                "functionName": "canAccess",
                "functionParams": [":userAddress", content_id_hex],
                "functionAbi": {
                    "type": "function",
                    "name": "canAccess",
                    "stateMutability": "view",
                    "inputs": [
                        { "type": "address", "name": "user", "internalType": "address" },
                        { "type": "bytes32", "name": "contentId", "internalType": "bytes32" }
                    ],
                    "outputs": [{ "type": "bool", "name": "", "internalType": "bool" }]
                },
                "returnValueTest": { "key": "", "comparator": "=", "value": "true" }
            }
        ]),
    }
}

fn load_persisted_auth(path: &Path) -> Result<PersistedAuth> {
    let contents = fs::read_to_string(path)
        .with_context(|| format!("Failed reading auth file {}", path.display()))?;
    serde_json::from_str(&contents)
        .with_context(|| format!("Failed parsing auth file JSON {}", path.display()))
}

fn parse_pkp_public_key(auth: &PersistedAuth) -> Result<Vec<u8>> {
    let raw = auth
        .pkp_public_key
        .as_deref()
        .ok_or_else(|| anyhow!("Missing pkpPublicKey in auth file"))?
        .trim();
    let raw = raw.strip_prefix("0x").unwrap_or(raw);

    let mut decoded = hex::decode(raw).context("Invalid pkpPublicKey hex")?;
    if decoded.len() == 64 {
        decoded.insert(0, 0x04);
    }
    if decoded.len() != 65 {
        bail!(
            "Invalid pkpPublicKey length: expected 64 or 65 bytes, got {}",
            decoded.len()
        );
    }
    if decoded[0] != 0x04 {
        bail!("pkpPublicKey must be uncompressed secp256k1 (0x04 prefix)");
    }
    Ok(decoded)
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

    let mut bytes = vec![0u8; 128 * 1024];
    rand::thread_rng().fill_bytes(&mut bytes);
    Ok(bytes)
}

fn random_content_id_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("0x{}", hex::encode(bytes))
}

fn normalize_content_id_hex(content_id_hex: &str) -> Result<String> {
    let raw = content_id_hex.trim();
    if raw.is_empty() {
        bail!("contentId is empty");
    }
    let raw = raw.strip_prefix("0x").unwrap_or(raw);
    if raw.len() > 64 {
        bail!(
            "contentId too long: expected <= 32 bytes, got {} bytes",
            raw.len() / 2
        );
    }

    let decoded = hex::decode(raw).context("Invalid contentId hex")?;
    if decoded.is_empty() || decoded.len() > 32 {
        bail!(
            "Invalid contentId byte length: expected 1..=32, got {}",
            decoded.len()
        );
    }

    let mut out = [0u8; 32];
    let start = 32 - decoded.len();
    out[start..].copy_from_slice(&decoded);
    Ok(format!("0x{}", hex::encode(out)))
}

fn auth_context_matches_expected_pkp(
    auth_context: &AuthContext,
    expected_pkp_address: &str,
) -> bool {
    let expected = expected_pkp_address.trim().to_ascii_lowercase();
    let delegated = auth_context
        .delegation_auth_sig
        .address
        .trim()
        .to_ascii_lowercase();
    !expected.is_empty() && expected == delegated
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

fn default_auth_config() -> AuthConfig {
    AuthConfig {
        capability_auth_sigs: vec![],
        expiration: (chrono::Utc::now() + chrono::Duration::days(30)).to_rfc3339(),
        statement: "Heaven isolated Lit+Load roundtrip test".into(),
        domain: "localhost".into(),
        resources: vec![
            ResourceAbilityRequest {
                ability: LitAbility::PKPSigning,
                resource_id: "*".into(),
                data: None,
            },
            ResourceAbilityRequest {
                ability: LitAbility::AccessControlConditionDecryption,
                resource_id: "*".into(),
                data: None,
            },
            ResourceAbilityRequest {
                ability: LitAbility::LitActionExecution,
                resource_id: "*".into(),
                data: None,
            },
        ],
    }
}

fn auth_method_id_candidates(
    persisted: &PersistedAuth,
    auth_method_type: u32,
    auth_method_id: &str,
    access_token: &str,
) -> Vec<String> {
    let mut candidates = Vec::new();
    if auth_method_type == 1 {
        let eoa_source = persisted
            .eoa_address
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .map(str::to_string)
            .or_else(|| extract_eoa_address_from_access_token(access_token));
        if let Some(eoa) = eoa_source {
            if let Some(canonical_id) = derive_canonical_eoa_auth_method_id(&eoa) {
                if !canonical_id.eq_ignore_ascii_case(auth_method_id) {
                    candidates.push(canonical_id);
                }
            }
        }
    }
    candidates.push(auth_method_id.to_string());
    dedupe_case_insensitive(candidates)
}

fn derive_canonical_eoa_auth_method_id(address: &str) -> Option<String> {
    let parsed = address.parse().ok()?;
    let bytes = auth_method_id_for_eth_wallet(parsed);
    Some(format!("0x{}", hex::encode(bytes.as_ref())))
}

fn extract_eoa_address_from_access_token(access_token: &str) -> Option<String> {
    let parsed = serde_json::from_str::<Value>(access_token).ok()?;
    match parsed {
        Value::Object(_) => extract_address_field(&parsed),
        Value::String(inner) => {
            if is_evm_address(&inner) {
                return Some(inner);
            }
            serde_json::from_str::<Value>(&inner)
                .ok()
                .and_then(|v| extract_address_field(&v))
        }
        _ => None,
    }
}

fn extract_address_field(value: &Value) -> Option<String> {
    value
        .get("address")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| is_evm_address(v))
        .map(str::to_string)
}

fn is_evm_address(value: &str) -> bool {
    let value = value.trim();
    if value.len() != 42 || !value.starts_with("0x") {
        return false;
    }
    value.as_bytes()[2..]
        .iter()
        .all(|b| char::from(*b).is_ascii_hexdigit())
}

fn dedupe_case_insensitive(values: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for value in values {
        if out
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(&value))
        {
            continue;
        }
        out.push(value);
    }
    out
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

fn default_auth_file() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("heaven-gpui")
        .join("heaven-auth.json")
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
