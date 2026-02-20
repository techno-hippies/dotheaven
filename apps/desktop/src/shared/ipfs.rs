use std::env;

const DEFAULT_IPFS_GATEWAY: &str = "https://ipfs.io";
const DEFAULT_LS3_GATEWAY: &str = "https://gateway.s3-node-1.load.network";
const DEFAULT_ARWEAVE_GATEWAY: &str = "https://arweave.net";

fn normalized_env_url(key: &str, fallback: &str) -> String {
    let value = env::var(key).ok().filter(|v| !v.trim().is_empty());
    let mut url = value.unwrap_or_else(|| fallback.to_string());
    while url.ends_with('/') {
        url.pop();
    }
    url
}

fn ipfs_gateway() -> String {
    let base = normalized_env_url("HEAVEN_IPFS_GATEWAY_URL", DEFAULT_IPFS_GATEWAY);
    if base.ends_with("/ipfs") {
        format!("{base}/")
    } else {
        format!("{base}/ipfs/")
    }
}

fn ls3_gateway() -> String {
    normalized_env_url("HEAVEN_LOAD_GATEWAY_URL", DEFAULT_LS3_GATEWAY)
}

fn arweave_gateway() -> String {
    normalized_env_url("HEAVEN_ARWEAVE_GATEWAY_URL", DEFAULT_ARWEAVE_GATEWAY)
}

pub fn resolve_ipfs_url(url: &str) -> String {
    let gateway = ipfs_gateway();
    if url.starts_with("ipfs://") {
        format!("{gateway}{}", &url[7..])
    } else {
        url.to_string()
    }
}

pub fn heaven_ipfs_image_url(cid: &str, width: u32, height: u32, quality: u32) -> String {
    let gateway = ipfs_gateway();
    format!(
        "{gateway}{cid}?img-width={width}&img-height={height}&img-format=jpeg&img-quality={quality}"
    )
}

/// Resolve a cover ref into an image URL suitable for GPUI.
///
/// Supported:
/// - legacy IPFS CIDs (Qm..., bafy...) via our Filebase gateway with transforms
/// - ipfs://... via our Filebase gateway with transforms
/// - ar://<dataitem_id> via arweave.net (no transforms)
/// - ls3://<dataitem_id> via LS3 gateway (no transforms)
pub fn heaven_cover_image_url(ref_or_cid: &str, width: u32, height: u32, quality: u32) -> String {
    let ar_gateway = arweave_gateway();
    let ls3 = ls3_gateway();
    let raw = ref_or_cid.trim();
    if let Some(id) = raw.strip_prefix("ar://") {
        return format!("{ar_gateway}/{}", id.trim());
    }
    if let Some(id) = raw.strip_prefix("ls3://") {
        return format!("{ls3}/resolve/{}", id.trim());
    }
    if let Some(id) = raw.strip_prefix("load-s3://") {
        return format!("{ls3}/resolve/{}", id.trim());
    }
    if raw.starts_with("http://") || raw.starts_with("https://") {
        return raw.to_string();
    }
    if raw.starts_with("ipfs://") {
        return heaven_ipfs_image_url(&raw[7..], width, height, quality);
    }
    heaven_ipfs_image_url(raw, width, height, quality)
}
