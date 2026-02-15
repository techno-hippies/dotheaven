use super::*;

use std::env;
use std::path::Path;
use std::time::Duration;

use bundles_rs::ans104::{data_item::DataItem, tags::Tag};
use bundles_rs::crypto::signer::SignatureType;
use image::imageops::FilterType;

use crate::shared::rpc::read_json_or_text;

const DEFAULT_ARWEAVE_TURBO_UPLOAD_URL: &str = "https://upload.ardrive.io";
const DEFAULT_ARWEAVE_TURBO_TOKEN: &str = "ethereum";

// Turbo free tier is <= 100KB per data item (client-side enforced here).
const MAX_ARWEAVE_COVER_BYTES: usize = 100 * 1024;

const JPEG_QUALITIES: &[u8] = &[88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32];
const MAX_DIMS: &[u32] = &[512, 448, 384, 320, 256, 224, 192, 160, 128];

pub(super) fn submit_track_cover_via_lit(
    lit: &mut LitWalletService,
    track: &SubmitScrobbleInput,
) -> Result<(), String> {
    let network = registry::lit_network_name();
    // Prefer v5, which supports storing `ar://<dataitem_id>` (or other URI-safe refs).
    // Fall back to v4 (Filebase/IPFS-only) if v5 isn't configured.
    let (action_name, action) = match registry::resolve_action(
        &network,
        "trackCoverV5",
        &["HEAVEN_TRACK_COVER_V5_CID", "TRACK_COVER_V5_CID"],
        None,
    ) {
        Ok(a) => ("trackCoverV5", a),
        Err(_) => match registry::resolve_action(
            &network,
            "trackCoverV4",
            &["HEAVEN_TRACK_COVER_V4_CID", "TRACK_COVER_V4_CID"],
            None,
        ) {
            Ok(a) => ("trackCoverV4", a),
            Err(_) => return Ok(()), // No CID configured — skip cover upload
        },
    };

    let action_cid = match &action {
        registry::ResolvedAction::Ipfs { cid, .. } => cid.clone(),
        registry::ResolvedAction::Code { .. } => {
            log::warn!(
                "[Cover] trackCover action resolved to inline code, skipping (IPFS CID required)"
            );
            return Ok(());
        }
    };

    log::info!(
        "[Cover] resolved {}: source={}",
        action_name,
        action.source()
    );

    let Some(user_pkp_public_key) = track
        .user_pkp_public_key
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Err("missing user PKP public key for cover action".to_string());
    };

    let (kind, payload) = aa::derive_track_kind_and_payload(track)?;
    let track_id = aa::compute_track_id(kind, payload);
    let track_id_hex = aa::to_hex_h256(track_id).to_lowercase();

    let rpc_url = aa::env_or("HEAVEN_AA_RPC_URL", "AA_RPC_URL")
        .unwrap_or_else(|| DEFAULT_AA_RPC_URL.to_string());
    let scrobble_v4 = aa::env_or("HEAVEN_AA_SCROBBLE_V4", "AA_SCROBBLE_V4")
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
        .parse::<Address>()
        .map_err(|e| format!("Invalid ScrobbleV4 address: {e}"))?;

    if let Ok(Some(existing_cover)) = call_get_track_cover_value(&rpc_url, scrobble_v4, track_id) {
        log::info!(
            "[Cover] already set on-chain for trackId={}: {}",
            track_id_hex,
            existing_cover
        );
        return Ok(());
    }

    let Some(cover_path) = track
        .cover_path
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    else {
        return Ok(());
    };

    let cover_file = Path::new(cover_path);
    if !cover_file.exists() {
        return Ok(());
    }

    let cover_bytes =
        std::fs::read(cover_file).map_err(|e| format!("failed to read cover image file: {e}"))?;
    if cover_bytes.is_empty() {
        return Ok(());
    }
    if cover_bytes.len() > MAX_COVER_BYTES {
        log::warn!(
            "[Cover] image too large to process ({} bytes > {}), skipping {}",
            cover_bytes.len(),
            MAX_COVER_BYTES,
            cover_path
        );
        return Ok(());
    }

    // If using v4, keep legacy Filebase upload flow (IPFS CID only).
    if action_name == "trackCoverV4" {
        return submit_track_cover_v4_filebase(
            lit,
            &action_cid,
            user_pkp_public_key,
            &track_id_hex,
            track,
            &cover_bytes,
            cover_path,
        );
    }

    // v5 path: upload cover bytes to Arweave Turbo (<=100KB), then store `ar://<id>` on-chain.
    let (prepared_bytes, prepared_content_type) = prepare_cover_for_arweave(&cover_bytes)
        .map_err(|e| format!("cover resize/compress failed: {e}"))?;

    if prepared_bytes.len() > MAX_ARWEAVE_COVER_BYTES {
        return Err(format!(
            "prepared cover still exceeds Turbo free tier ({} bytes > {} bytes)",
            prepared_bytes.len(),
            MAX_ARWEAVE_COVER_BYTES
        ));
    }

    let upload_id = upload_cover_to_arweave_turbo(
        lit,
        user_pkp_public_key,
        &prepared_bytes,
        &prepared_content_type,
        Some(cover_path),
    )?;

    let cover_ref = format!("ar://{}", upload_id);

    let timestamp = aa::now_epoch_millis().to_string();
    let nonce = format!(
        "{}-{}-{}",
        now_epoch_sec(),
        std::process::id(),
        track_id_hex.trim_start_matches("0x")
    );

    let js_params = serde_json::json!({
        "userPkpPublicKey": user_pkp_public_key,
        "tracks": [{
            "trackId": track_id_hex,
            "coverRef": cover_ref,
        }],
        "timestamp": timestamp,
        "nonce": nonce,
    });

    let response = lit.execute_js_ipfs(action_cid, Some(js_params))?;
    let payload = parse_lit_action_response_payload(&response.response)?;
    let success = payload
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !success {
        return Err(payload
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("cover action failed")
            .to_string());
    }

    let returned = payload
        .get("coverCids")
        .and_then(|v| v.get(&track_id_hex))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("coverCid")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        });

    if let Some(value) = returned {
        if !is_valid_cover_ref(&value) {
            return Err(format!(
                "v5 cover action returned invalid cover ref: {}",
                value
            ));
        }
        log::info!(
            "[Cover] submitted (v5) for trackId={} file='{}' ref={}",
            track_id_hex,
            track.file_path,
            value
        );
        return Ok(());
    }

    log::info!(
        "[Cover] submitted (v5) for trackId={} file='{}' uploadId={}",
        track_id_hex,
        track.file_path,
        upload_id
    );

    Ok(())
}

fn submit_track_cover_v4_filebase(
    lit: &mut LitWalletService,
    action_cid: &str,
    user_pkp_public_key: &str,
    track_id_hex: &str,
    track: &SubmitScrobbleInput,
    cover_bytes: &[u8],
    cover_path: &str,
) -> Result<(), String> {
    let cover_base64 =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, cover_bytes);
    let content_type = cover_content_type(cover_path);

    let timestamp = aa::now_epoch_millis().to_string();
    let nonce = format!(
        "{}-{}-{}",
        now_epoch_sec(),
        std::process::id(),
        track_id_hex.trim_start_matches("0x")
    );

    let mut js_params = serde_json::json!({
        "userPkpPublicKey": user_pkp_public_key,
        "tracks": [{
            "trackId": track_id_hex,
            "coverImage": {
                "base64": cover_base64,
                "contentType": content_type,
            }
        }],
        "timestamp": timestamp,
        "nonce": nonce,
    });

    if let Some(filebase_plaintext_key) =
        aa::env_or("HEAVEN_FILEBASE_COVERS_KEY", "FILEBASE_COVERS_API_KEY")
    {
        js_params["filebasePlaintextKey"] = serde_json::Value::String(filebase_plaintext_key);
    } else {
        js_params["filebaseEncryptedKey"] =
            registry::build_track_cover_filebase_encrypted_key(action_cid);
    }

    let response = lit.execute_js_ipfs(action_cid.to_string(), Some(js_params))?;
    let payload = parse_lit_action_response_payload(&response.response)?;
    let success = payload
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !success {
        return Err(payload
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("cover action failed")
            .to_string());
    }

    let returned_cover_cid = payload
        .get("coverCid")
        .and_then(|v| v.as_str())
        .filter(|v| is_valid_ipfs_cid(v))
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("coverCids")
                .and_then(|v| v.get(track_id_hex))
                .and_then(|v| v.as_str())
                .filter(|v| is_valid_ipfs_cid(v))
                .map(str::to_string)
        });

    if let Some(cid) = returned_cover_cid {
        log::info!(
            "[Cover] submitted (v4) for trackId={} file='{}' cid={}",
            track_id_hex,
            track.file_path,
            cid
        );
        return Ok(());
    }

    Err("cover action succeeded but returned no CID".to_string())
}

fn prepare_cover_for_arweave(cover_bytes: &[u8]) -> Result<(Vec<u8>, String), String> {
    // Happy path: decode and re-encode as JPEG to hit <=100KB.
    let decoded =
        image::load_from_memory(cover_bytes).map_err(|e| format!("image decode failed: {e}"))?;

    let max_side = decoded.width().max(decoded.height()).max(1);

    // Always avoid upscaling; start at min(512, original max side).
    let mut bounds = Vec::<u32>::new();
    bounds.push(max_side.min(MAX_DIMS[0]));
    for &d in MAX_DIMS {
        if d < bounds[0] {
            bounds.push(d);
        }
    }

    for &bound in &bounds {
        let resized = if decoded.width().max(decoded.height()) > bound {
            decoded.resize(bound, bound, FilterType::Lanczos3)
        } else {
            decoded.clone()
        };

        for &quality in JPEG_QUALITIES {
            let jpeg = encode_jpeg_rgb8(&resized, quality)?;
            if jpeg.len() <= MAX_ARWEAVE_COVER_BYTES {
                return Ok((jpeg, "image/jpeg".to_string()));
            }
        }
    }

    Err(format!(
        "unable to compress cover to <= {} bytes",
        MAX_ARWEAVE_COVER_BYTES
    ))
}

fn encode_jpeg_rgb8(img: &image::DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();

    let mut out = Vec::<u8>::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode(rgb.as_raw(), w, h, image::ColorType::Rgb8.into())
        .map_err(|e| format!("jpeg encode failed: {e}"))?;
    Ok(out)
}

fn upload_cover_to_arweave_turbo(
    lit: &mut LitWalletService,
    user_pkp_public_key: &str,
    payload: &[u8],
    content_type: &str,
    file_path: Option<&str>,
) -> Result<String, String> {
    if payload.is_empty() {
        return Err("empty cover payload".to_string());
    }
    if payload.len() > MAX_ARWEAVE_COVER_BYTES {
        return Err(format!(
            "cover exceeds Turbo free tier limit ({} bytes > {} bytes)",
            payload.len(),
            MAX_ARWEAVE_COVER_BYTES
        ));
    }

    // Build a signed ANS-104 data item (Ethereum signature via user PKP).
    let owner = parse_uncompressed_secp256k1_pubkey(user_pkp_public_key)?;

    let mut tags = vec![Tag::new("Content-Type", content_type)];
    tags.push(Tag::new("App-Name", "heaven"));
    tags.push(Tag::new("Heaven-Type", "cover"));
    if let Some(path) = file_path {
        if let Some(name) = Path::new(path).file_name().and_then(|v| v.to_str()) {
            if !name.trim().is_empty() {
                tags.push(Tag::new("File-Name", name.trim()));
            }
        }
    }

    let mut item = DataItem::new(None, None, tags, payload.to_vec())
        .map_err(|e| format!("Failed to build dataitem payload: {e}"))?;
    item.signature_type = SignatureType::Ethereum;
    item.owner = owner;

    let signing_message = item.signing_message();
    let signature = lit
        .pkp_sign_ethereum_message(&signing_message)
        .map_err(|e| format!("Failed to PKP-sign dataitem: {e}"))?;
    if signature.len() != 65 {
        return Err(format!(
            "PKP returned invalid signature length for dataitem: {}",
            signature.len()
        ));
    }

    item.signature = signature;
    let signed = item
        .to_bytes()
        .map_err(|e| format!("Failed to encode signed dataitem bytes: {e}"))?;

    let upload_url = arweave_turbo_upload_url();
    let token = arweave_turbo_token();
    let endpoint = format!(
        "{}/v1/tx/{}",
        upload_url.trim_end_matches('/'),
        token.trim()
    );

    let request = ureq::post(&endpoint)
        .header("Content-Type", "application/octet-stream")
        .config()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build();

    let mut resp = request
        .send(&signed)
        .map_err(|e| format!("Turbo upload request failed: {e}; endpoint={endpoint}"))?;
    let status = resp.status().as_u16();
    let body = read_json_or_text(&mut resp);

    if status >= 400 {
        let message = body
            .get("error")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("Turbo upload failed with status {status}"));
        return Err(format!("{message}; endpoint={endpoint} body={body}"));
    }

    let id = extract_upload_id(&body)
        .ok_or_else(|| format!("Turbo upload succeeded but no dataitem id was returned: {body}"))?;
    Ok(id)
}

fn arweave_turbo_upload_url() -> String {
    env::var("HEAVEN_ARWEAVE_TURBO_UPLOAD_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_UPLOAD_URL.to_string())
}

fn arweave_turbo_token() -> String {
    env::var("HEAVEN_ARWEAVE_TURBO_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ARWEAVE_TURBO_TOKEN.to_string())
}

fn parse_uncompressed_secp256k1_pubkey(public_key_hex: &str) -> Result<Vec<u8>, String> {
    let raw = public_key_hex.trim();
    let raw = raw.strip_prefix("0x").unwrap_or(raw);

    let mut decoded = hex::decode(raw).map_err(|e| format!("Invalid PKP public key hex: {e}"))?;
    if decoded.len() == 64 {
        decoded.insert(0, 0x04);
    }
    if decoded.len() != 65 {
        return Err(format!(
            "Invalid PKP public key length: expected 64 or 65 bytes, got {}",
            decoded.len()
        ));
    }
    if decoded[0] != 0x04 {
        return Err("PKP public key must be uncompressed secp256k1 (0x04 prefix)".to_string());
    }
    Ok(decoded)
}

fn extract_upload_id(payload: &serde_json::Value) -> Option<String> {
    let direct_keys = ["id", "dataitem_id", "dataitemId"];
    for key in direct_keys {
        if let Some(id) = payload.get(key).and_then(|v| v.as_str()) {
            if !id.trim().is_empty() {
                return Some(id.trim().to_string());
            }
        }
    }
    if let Some(result) = payload.get("result") {
        for key in direct_keys {
            if let Some(id) = result.get(key).and_then(|v| v.as_str()) {
                if !id.trim().is_empty() {
                    return Some(id.trim().to_string());
                }
            }
        }
    }
    None
}

fn parse_lit_action_response_payload(raw: &serde_json::Value) -> Result<serde_json::Value, String> {
    match raw {
        serde_json::Value::Object(_) => Ok(raw.clone()),
        serde_json::Value::String(s) => serde_json::from_str::<serde_json::Value>(s)
            .map_err(|e| format!("cover action response parse failed: {e}; raw={}", s)),
        other => Err(format!("unexpected cover action response shape: {other}")),
    }
}

fn call_get_track_cover_value(
    rpc_url: &str,
    scrobble_v4: Address,
    track_id: B256,
) -> Result<Option<String>, String> {
    let data = getTrackCall { trackId: track_id }.abi_encode();
    let out = aa::eth_call(rpc_url, scrobble_v4, &data)?;
    let decoded = getTrackCall::abi_decode_returns(&out)
        .map_err(|e| format!("getTrack decode failed: {e}"))?;
    let cover = decoded.coverCid.trim().to_string();
    if is_valid_cover_ref(&cover) {
        Ok(Some(cover))
    } else {
        Ok(None)
    }
}

fn is_valid_ipfs_cid(cid: &str) -> bool {
    let v = cid.trim();
    v.starts_with("Qm") || v.starts_with("bafy")
}

fn is_valid_cover_ref(value: &str) -> bool {
    let v = value.trim();
    if v.is_empty() {
        return false;
    }
    is_valid_ipfs_cid(v)
        || v.starts_with("ar://")
        || v.starts_with("ls3://")
        || v.starts_with("load-s3://")
}

fn cover_content_type(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}
