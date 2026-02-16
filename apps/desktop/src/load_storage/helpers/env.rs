use super::*;

pub(crate) fn content_registry() -> String {
    std::env::var("HEAVEN_CONTENT_REGISTRY")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CONTENT_REGISTRY.to_string())
}

pub(crate) fn playlist_v1() -> String {
    std::env::var("HEAVEN_PLAYLIST_V1")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_PLAYLIST_V1.to_string())
}

pub(crate) fn scrobble_v4() -> String {
    std::env::var("HEAVEN_AA_SCROBBLE_V4")
        .ok()
        .or_else(|| std::env::var("AA_SCROBBLE_V4").ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SCROBBLE_V4.to_string())
}

pub(crate) fn megaeth_rpc_url() -> String {
    std::env::var("HEAVEN_MEGAETH_RPC_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_MEGAETH_RPC_URL.to_string())
}

pub(crate) fn subgraph_activity_url() -> String {
    std::env::var("HEAVEN_SUBGRAPH_ACTIVITY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_ACTIVITY.to_string())
}

pub(crate) fn subgraph_playlists_url() -> String {
    std::env::var("HEAVEN_SUBGRAPH_PLAYLISTS_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SUBGRAPH_PLAYLISTS.to_string())
}

pub(crate) fn require_sponsor_private_key() -> Result<String, String> {
    if let Ok(v) = std::env::var("HEAVEN_SPONSOR_PRIVATE_KEY") {
        let t = v.trim();
        if !t.is_empty() {
            return Ok(ensure_0x_prefixed(t));
        }
    }
    if let Ok(v) = std::env::var("PRIVATE_KEY") {
        let t = v.trim();
        if !t.is_empty() {
            return Ok(ensure_0x_prefixed(t));
        }
    }

    for path in ["../../lit-actions/.env", "../.env", ".env"] {
        if let Ok(contents) = fs::read_to_string(path) {
            for line in contents.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || !trimmed.starts_with("PRIVATE_KEY=") {
                    continue;
                }
                let raw = trimmed.trim_start_matches("PRIVATE_KEY=").trim();
                if !raw.is_empty() {
                    return Ok(ensure_0x_prefixed(raw));
                }
            }
        }
    }

    Err("Missing sponsor private key: set HEAVEN_SPONSOR_PRIVATE_KEY or PRIVATE_KEY".to_string())
}

pub(crate) fn sponsor_pkp_public_key_hex() -> String {
    let raw = std::env::var("HEAVEN_SPONSOR_PKP_PUBLIC_KEY")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SPONSOR_PKP_PUBLIC_KEY.to_string());
    ensure_0x_prefixed(&raw)
}

pub(crate) fn ensure_0x_prefixed(value: &str) -> String {
    if value.starts_with("0x") {
        value.to_string()
    } else {
        format!("0x{value}")
    }
}

pub(crate) fn content_access_mirror() -> String {
    std::env::var("HEAVEN_CONTENT_ACCESS_MIRROR")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CONTENT_ACCESS_MIRROR.to_string())
}

pub(crate) fn lit_chain() -> String {
    std::env::var("HEAVEN_LIT_CHAIN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LIT_CHAIN.to_string())
}

pub(crate) fn load_turbo_upload_url() -> String {
    std::env::var("HEAVEN_LOAD_TURBO_UPLOAD_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_TURBO_UPLOAD_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub(crate) fn load_turbo_upload_token() -> String {
    std::env::var("HEAVEN_LOAD_TURBO_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_TURBO_TOKEN.to_string())
        .to_lowercase()
}

pub(crate) fn load_gateway_url() -> String {
    std::env::var("HEAVEN_LOAD_GATEWAY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_LOAD_GATEWAY_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub(crate) fn load_user_pays_enabled() -> bool {
    std::env::var("HEAVEN_LOAD_USER_PAYS_ENABLED")
        .ok()
        .map(|v| {
            let v = v.trim().to_ascii_lowercase();
            v == "1" || v == "true" || v == "yes"
        })
        .unwrap_or(false)
}

pub(crate) fn load_upload_mode_label() -> &'static str {
    if load_user_pays_enabled() {
        "turbo-user-pays"
    } else {
        "offchain"
    }
}

pub(crate) fn turbo_funding_proxy_url() -> String {
    std::env::var("HEAVEN_TURBO_FUNDING_PROXY_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TURBO_FUNDING_PROXY_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

pub(crate) fn turbo_funding_token() -> String {
    std::env::var("HEAVEN_TURBO_FUNDING_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_TURBO_FUNDING_TOKEN.to_string())
        .to_ascii_lowercase()
}

pub(crate) fn base_sepolia_rpc_url() -> String {
    std::env::var("HEAVEN_BASE_SEPOLIA_RPC_URL")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE_SEPOLIA_RPC_URL.to_string())
}

pub(crate) fn min_upload_credit() -> f64 {
    std::env::var("HEAVEN_LOAD_MIN_UPLOAD_CREDIT")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|v| v.is_finite() && *v >= 0.0)
        .unwrap_or(DEFAULT_MIN_UPLOAD_CREDIT)
}

pub(crate) fn lit_network_name() -> String {
    std::env::var("HEAVEN_LIT_NETWORK")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| std::env::var("LIT_NETWORK").ok())
        .unwrap_or_else(|| "naga-dev".to_string())
}
