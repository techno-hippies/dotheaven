use super::*;

#[derive(Debug, Clone, Default)]
pub struct TrackMetaInput {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PlaylistCoverImageInput {
    pub base64: String,
    pub content_type: String,
}

#[derive(Debug, Clone)]
pub struct PlaylistTrackInput {
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
    pub cover_cid: Option<String>,
    pub cover_image: Option<PlaylistCoverImageInput>,
}

#[derive(Debug, Clone)]
pub(super) struct LoadHealthResult {
    pub(super) ok: bool,
    pub(super) endpoint: String,
    pub(super) status: Option<u16>,
    pub(super) reason: Option<String>,
    pub(super) info: Option<Value>,
}

#[derive(Debug, Clone)]
pub(super) struct UploadResult {
    pub(super) id: String,
    pub(super) gateway_url: String,
    pub(super) winc: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct ContentRegistryEntry {
    pub(super) owner: String,
    pub(super) piece_cid: String,
    pub(super) active: bool,
}

#[derive(Debug, Clone)]
pub(super) struct ParsedContentBlob {
    pub(super) lit_ciphertext_base64: String,
    pub(super) data_to_encrypt_hash_hex: String,
    pub(super) algo: u8,
    pub(super) iv: Vec<u8>,
    pub(super) encrypted_audio: Vec<u8>,
}
