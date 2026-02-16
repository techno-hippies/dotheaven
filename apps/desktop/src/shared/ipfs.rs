pub const HEAVEN_IPFS_GATEWAY: &str = "https://heaven.myfilebase.com/ipfs/";
pub const HEAVEN_LS3_GATEWAY: &str = "https://gateway.s3-node-1.load.network";
pub const HEAVEN_ARWEAVE_GATEWAY: &str = "https://arweave.net";

pub fn resolve_ipfs_url(url: &str) -> String {
    if url.starts_with("ipfs://") {
        format!("{HEAVEN_IPFS_GATEWAY}{}", &url[7..])
    } else {
        url.to_string()
    }
}

/// myfilebase currently returns WebP bytes with `content-type: image/jpeg` when requesting
/// `img-format=webp`, which breaks gpui decoding. Force JPEG.
pub fn heaven_ipfs_image_url(cid: &str, width: u32, height: u32, quality: u32) -> String {
    format!(
        "{HEAVEN_IPFS_GATEWAY}{cid}?img-width={width}&img-height={height}&img-format=jpeg&img-quality={quality}"
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
    let raw = ref_or_cid.trim();
    if let Some(id) = raw.strip_prefix("ar://") {
        return format!("{HEAVEN_ARWEAVE_GATEWAY}/{}", id.trim());
    }
    if let Some(id) = raw.strip_prefix("ls3://") {
        return format!("{HEAVEN_LS3_GATEWAY}/resolve/{}", id.trim());
    }
    if let Some(id) = raw.strip_prefix("load-s3://") {
        return format!("{HEAVEN_LS3_GATEWAY}/resolve/{}", id.trim());
    }
    if raw.starts_with("http://") || raw.starts_with("https://") {
        return raw.to_string();
    }
    if raw.starts_with("ipfs://") {
        return heaven_ipfs_image_url(&raw[7..], width, height, quality);
    }
    heaven_ipfs_image_url(raw, width, height, quality)
}
