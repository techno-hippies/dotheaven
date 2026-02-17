//! Canonical Lit Action CID registry for GPUI.
//!
//! CIDs are loaded at compile time from `lit-actions/cids/dev.json` and
//! `lit-actions/cids/test.json` via `include_str!`.  This eliminates CID drift
//! between the canonical JSON files and the GPUI binary — a deploy that updates
//! the JSON automatically updates GPUI on the next build.
//!
//! Resolution precedence:
//!   1. Explicit env CID override  (`HEAVEN_{ACTION}_CID`)
//!   2. Explicit code-path env var (`HEAVEN_{ACTION}_CODE_PATH`)
//!   3. Canonical CID map          (from JSON files)
//!   4. Local JS file              (only when `HEAVEN_ALLOW_LOCAL_ACTION_FALLBACK=1`)

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Canonical CID maps — embedded at compile time from the repo JSON files.
// ---------------------------------------------------------------------------

const DEV_JSON: &str = include_str!("../../../lit-actions/cids/dev.json");
const TEST_JSON: &str = include_str!("../../../lit-actions/cids/test.json");

type CidMap = HashMap<String, HashMap<String, String>>;

fn cid_maps() -> &'static CidMap {
    static MAPS: OnceLock<CidMap> = OnceLock::new();
    MAPS.get_or_init(|| {
        let mut m = HashMap::new();
        if let Ok(dev) = serde_json::from_str::<HashMap<String, String>>(DEV_JSON) {
            m.insert("naga-dev".to_string(), dev);
        }
        if let Ok(test) = serde_json::from_str::<HashMap<String, String>>(TEST_JSON) {
            m.insert("naga-test".to_string(), test);
        }
        m
    })
}

/// Look up a CID from the canonical JSON files.
/// Returns `None` if the network/action pair is not found or the CID is empty.
pub fn action_cid(network: &str, action: &str) -> Option<String> {
    let maps = cid_maps();
    let network_map = maps.get(network)?;
    let cid = network_map.get(action)?;
    if cid.trim().is_empty() {
        None
    } else {
        Some(cid.clone())
    }
}

/// List all action names available for a given network.
#[allow(dead_code)]
pub fn action_names(network: &str) -> Vec<String> {
    let maps = cid_maps();
    match maps.get(network) {
        Some(m) => m
            .iter()
            .filter(|(_, cid)| !cid.trim().is_empty())
            .map(|(k, _)| k.clone())
            .collect(),
        None => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Resolved action — single enum replacing the 3 duplicates.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub enum ResolvedAction {
    /// Execute via IPFS CID (default, required for sponsor PKP actions).
    Ipfs { cid: String, source: String },
    /// Execute inline code (dev only, or utility actions).
    Code { code: String, source: String },
}

impl ResolvedAction {
    pub fn source(&self) -> &str {
        match self {
            ResolvedAction::Ipfs { source, .. } => source,
            ResolvedAction::Code { source, .. } => source,
        }
    }

    pub fn is_ipfs(&self) -> bool {
        matches!(self, ResolvedAction::Ipfs { .. })
    }
}

// ---------------------------------------------------------------------------
// Local JS paths for dev iteration (only used with fallback flag).
// ---------------------------------------------------------------------------

fn local_code_path_for_action(action: &str) -> Option<&'static [&'static str]> {
    const PLAYLIST_V1: [&str; 2] = [
        "../../lit-actions/features/music/playlist-v1.js",
        "lit-actions/features/music/playlist-v1.js",
    ];
    const CONTENT_REGISTER_MEGAETH_V1: [&str; 2] = [
        "../../lit-actions/features/music/content-register-megaeth-v1.js",
        "lit-actions/features/music/content-register-megaeth-v1.js",
    ];
    const CONTENT_REGISTER_V2: [&str; 2] = [
        "../../lit-actions/features/music/content-register-v2.js",
        "lit-actions/features/music/content-register-v2.js",
    ];
    const CONTENT_ACCESS_V1: [&str; 2] = [
        "../../lit-actions/features/music/content-access-v1.js",
        "lit-actions/features/music/content-access-v1.js",
    ];
    match action {
        "playlistV1" => Some(&PLAYLIST_V1),
        "contentRegisterMegaethV1" => Some(&CONTENT_REGISTER_MEGAETH_V1),
        "contentRegisterV2" => Some(&CONTENT_REGISTER_V2),
        "contentAccessV1" => Some(&CONTENT_ACCESS_V1),
        _ => None,
    }
}

fn load_local_action_code(action: &str) -> Option<ResolvedAction> {
    let paths = local_code_path_for_action(action)?;
    for rel in paths {
        let path = PathBuf::from(rel);
        if let Ok(code) = fs::read_to_string(&path) {
            if !code.trim().is_empty() {
                return Some(ResolvedAction::Code {
                    code,
                    source: format!("local:{rel}"),
                });
            }
        }
    }
    None
}

/// Resolve an action directly from the local repository JS file paths.
///
/// This bypasses CID maps and is intended for explicit emergency recovery paths
/// when a deployed CID is known-bad.
pub fn resolve_local_action(action: &str) -> Result<ResolvedAction, String> {
    load_local_action_code(action)
        .ok_or_else(|| format!("No local JS file available for action '{action}'"))
}

fn allow_local_fallback() -> bool {
    env::var("HEAVEN_ALLOW_LOCAL_ACTION_FALLBACK")
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Unified resolver.
// ---------------------------------------------------------------------------

/// Resolve a Lit Action to either an IPFS CID or inline code.
///
/// `env_cid_keys`     — env var names checked for explicit CID override.
/// `env_code_path_key` — optional env var for explicit local JS path (always honoured).
pub fn resolve_action(
    network: &str,
    action: &str,
    env_cid_keys: &[&str],
    env_code_path_key: Option<&str>,
) -> Result<ResolvedAction, String> {
    // 1. Explicit env CID override
    for key in env_cid_keys {
        if let Ok(v) = env::var(key) {
            let cid = v.trim().to_string();
            if !cid.is_empty() {
                return Ok(ResolvedAction::Ipfs {
                    cid,
                    source: format!("env:{key}"),
                });
            }
        }
    }

    // 2. Explicit code path env var
    if let Some(key) = env_code_path_key {
        if let Ok(v) = env::var(key) {
            let code_path = v.trim().to_string();
            if !code_path.is_empty() {
                let code = fs::read_to_string(&code_path)
                    .map_err(|e| format!("Failed reading {key} ({code_path}): {e}"))?;
                if !code.trim().is_empty() {
                    return Ok(ResolvedAction::Code {
                        code,
                        source: format!("env:{key}:{code_path}"),
                    });
                }
            }
        }
    }

    // 3. Canonical CID map (from JSON)
    if let Some(cid) = action_cid(network, action) {
        return Ok(ResolvedAction::Ipfs {
            cid,
            source: format!("cid-map:{network}:{action}"),
        });
    }

    // 4. Local JS file fallback (only when allowed)
    if allow_local_fallback() {
        if let Some(action) = load_local_action_code(action) {
            return Ok(action);
        }
    }

    Err(format!(
        "No CID available for action '{action}' on network '{network}'. \
         Deploy it or set an env override."
    ))
}

/// Resolve the content-register action.
///
/// We require `contentRegisterMegaethV1` so content registration always includes
/// track metadata registration (title/artist/album) for cross-device share UX.
/// Legacy `contentRegisterV2` / `contentRegisterV1` fallback is intentionally disabled.
pub fn resolve_content_register(network: &str) -> Result<ResolvedAction, String> {
    let megaeth_v1_result = resolve_action(
        network,
        "contentRegisterMegaethV1",
        &["HEAVEN_CONTENT_REGISTER_MEGAETH_V1_CID"],
        Some("HEAVEN_CONTENT_REGISTER_MEGAETH_V1_CODE_PATH"),
    );
    match megaeth_v1_result {
        Ok(action) => Ok(action),
        Err(ref e) if e.contains("No CID available") => Err(
            "contentRegisterMegaethV1 is required for desktop content registration; \
                 legacy contentRegisterV2/contentRegisterV1 fallback is disabled. \
                 Configure HEAVEN_CONTENT_REGISTER_MEGAETH_V1_CID or \
                 HEAVEN_CONTENT_REGISTER_MEGAETH_V1_CODE_PATH."
                .to_string(),
        ),
        Err(e) => Err(e),
    }
}

/// Read the current Lit network name from env.
pub fn lit_network_name() -> String {
    env::var("HEAVEN_LIT_NETWORK")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| env::var("LIT_NETWORK").ok())
        .unwrap_or_else(|| "naga-dev".to_string())
}

// ---------------------------------------------------------------------------
// Shared filebase encrypted key builder.
//
// load_storage playlist covers and track-cover uploads use different encrypted
// key payloads in the web/desktop implementation, so GPUI mirrors that split.
// ---------------------------------------------------------------------------

pub const PLAYLIST_FILEBASE_COVERS_ENCRYPTED_CIPHERTEXT: &str = "kmcO4LYNJN2N7qNXh3hlNeKJJRsyan3GH35TRzbkGAMZ6ohbujG+QenMouzYam4ByOsrPW0R+FLG/tBQ2jEv0gvsuIgbJA0NJgGkeK5TAD6GAcbBWuR9DndB61X8QyNdhrRvwiLE2jAmgmqRHSu0P4ozXj4hRUjmDMsr7RS/yvtT0/CaJG9rODkDPA2UJpCFNLfx47k7ghqPNztx8rE0xY7kOTTYPF4A3dO5zZfmLkd+horBfentydzBIGI+qHlx8O+OwZzR40SvWUD7XoV8VCo3Ckf28pWQAg==";
pub const TRACK_COVER_FILEBASE_ENCRYPTED_CIPHERTEXT: &str = "kCk8ZIejg8Mp0qMXwij/E6ihMX0K60htflNpoRnSNki9062UwY69dhuwQws8O5WOHOmS5A7gOrwsHJyaqc4jixnwbSEDLNlimBLt+ZbDeaVlxWVxVaVZgA9IUpHdjmHQIdANSjRWNEDc39WfpgbztQm7lVGW+B2u3wz+/QGVvaeqZgzwVB1dJfNzm4ExgQAABlpPUDtIVdDo+MHmyeokdMH3CNB9/YSMP7L9S02ryDHJNQGafgsC";

pub const PLAYLIST_FILEBASE_COVERS_ENCRYPTED_HASH: &str =
    "1fb52374f1a4ec4d9f1a263b1355cedecbe3ef9d52425f76c222f2f5d9993d4f";
pub const TRACK_COVER_FILEBASE_COVERS_ENCRYPTED_HASH: &str =
    "23ab539bda3900163da16db23be0e6e6c6003d35bd1ac54aeaada176f8f1e0d4";

pub fn build_filebase_encrypted_key(action_cid: &str) -> serde_json::Value {
    serde_json::json!({
        "ciphertext": PLAYLIST_FILEBASE_COVERS_ENCRYPTED_CIPHERTEXT,
        "dataToEncryptHash": PLAYLIST_FILEBASE_COVERS_ENCRYPTED_HASH,
        "accessControlConditions": [{
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "chain": "ethereum",
            "method": "",
            "parameters": [":currentActionIpfsId"],
            "returnValueTest": { "comparator": "=", "value": action_cid },
        }],
    })
}

pub fn build_track_cover_filebase_encrypted_key(action_cid: &str) -> serde_json::Value {
    serde_json::json!({
        "ciphertext": TRACK_COVER_FILEBASE_ENCRYPTED_CIPHERTEXT,
        "dataToEncryptHash": TRACK_COVER_FILEBASE_COVERS_ENCRYPTED_HASH,
        "accessControlConditions": [{
            "conditionType": "evmBasic",
            "contractAddress": "",
            "standardContractType": "",
            "chain": "ethereum",
            "method": "",
            "parameters": [":currentActionIpfsId"],
            "returnValueTest": { "comparator": "=", "value": action_cid },
        }],
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests;
