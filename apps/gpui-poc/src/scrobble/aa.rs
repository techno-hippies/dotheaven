use super::*;

mod codec;
mod gateway;
mod rpc;
mod signature;
mod submit;
mod track;
mod util;

pub(super) fn submit_scrobble_aa(
    lit: &mut LitWalletService,
    user_address: Address,
    track: &SubmitScrobbleInput,
) -> Result<SubmitScrobbleResult, String> {
    submit::submit_scrobble_aa(lit, user_address, track)
}

pub(super) fn derive_track_kind_and_payload(
    track: &SubmitScrobbleInput,
) -> Result<(u8, B256), String> {
    track::derive_track_kind_and_payload(track)
}

pub(super) fn compute_track_id(kind: u8, payload: B256) -> B256 {
    track::compute_track_id(kind, payload)
}

pub(super) fn to_hex_h256(value: B256) -> String {
    codec::to_hex_h256(value)
}

pub(super) fn eth_call(rpc_url: &str, to: Address, data: &[u8]) -> Result<Vec<u8>, String> {
    rpc::eth_call(rpc_url, to, data)
}

pub(super) fn env_or(primary: &str, fallback: &str) -> Option<String> {
    util::env_or(primary, fallback)
}

pub(super) fn parse_duration_to_sec(value: &str) -> Option<u32> {
    util::parse_duration_to_sec(value)
}

pub(super) fn now_epoch_millis() -> u128 {
    util::now_epoch_millis()
}

pub(super) fn is_stale_session_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("can't decrypt")
        || lower.contains("encrypted payload decryption failed")
        || lower.contains("e2ee decryption failed")
        || lower.contains("invalid blockhash")
        || lower.contains("session expired")
        || lower.contains("invalidauthsig")
        || lower.contains("auth_sig passed is invalid")
        || lower.contains("insufficient successful encrypted responses")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_track_kind_uses_ip_id_when_present() {
        let input = SubmitScrobbleInput {
            file_path: "/tmp/test.mp3".to_string(),
            cover_path: None,
            user_pkp_public_key: None,
            artist: "Artist".to_string(),
            title: "Title".to_string(),
            album: Some("Album".to_string()),
            mbid: None,
            ip_id: Some("0x1234567890abcdef1234567890abcdef12345678".to_string()),
            duration_sec: 180,
            played_at_sec: 1_700_000_000,
        };

        let (kind, payload) = derive_track_kind_and_payload(&input).expect("derive kind/payload");
        assert_eq!(kind, 2, "ipId should map to kind 2");

        let mut expected = [0u8; 32];
        expected[12..].copy_from_slice(
            &hex::decode("1234567890abcdef1234567890abcdef12345678").expect("decode address"),
        );
        assert_eq!(
            payload,
            B256::from(expected),
            "ipId payload must be right-aligned address"
        );
    }
}
