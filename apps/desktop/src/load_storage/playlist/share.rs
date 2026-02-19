use super::*;
use alloy_sol_types::{sol, SolCall};

const GAS_LIMIT_SHARE_MIN: u64 = 800_000;
const GAS_LIMIT_UNSHARE_MIN: u64 = 100_000;

sol! {
    function sharePlaylist(bytes32 playlistId, address grantee);
    function unsharePlaylist(bytes32 playlistId, address grantee);
}

impl LoadStorageService {
    pub fn playlist_share_with_wallet(
        &mut self,
        auth: &PersistedAuth,
        playlist_id_hex: &str,
        grantee_address: &str,
        operation: &str, // "share" | "unshare"
    ) -> Result<Value, String> {
        let playlist_id = B256::from(decode_bytes32_hex(playlist_id_hex, "playlistId")?);
        let grantee = grantee_address
            .trim()
            .parse::<Address>()
            .map_err(|e| format!("Invalid grantee address ({grantee_address}): {e}"))?;
        let share_contract = playlist_share_v1();

        match operation {
            "share" => {
                let call_data = sharePlaylistCall {
                    playlistId: playlist_id,
                    grantee,
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &share_contract,
                    call_data,
                    GAS_LIMIT_SHARE_MIN,
                    "playlist share",
                )?;

                Ok(json!({
                    "success": true,
                    "operation": "share",
                    "txHash": tx_hash,
                    "playlistId": to_hex_prefixed(playlist_id.as_slice()).to_lowercase(),
                    "grantee": to_hex_prefixed(grantee.as_slice()).to_lowercase(),
                }))
            }
            "unshare" => {
                let call_data = unsharePlaylistCall {
                    playlistId: playlist_id,
                    grantee,
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &share_contract,
                    call_data,
                    GAS_LIMIT_UNSHARE_MIN,
                    "playlist unshare",
                )?;

                Ok(json!({
                    "success": true,
                    "operation": "unshare",
                    "txHash": tx_hash,
                    "playlistId": to_hex_prefixed(playlist_id.as_slice()).to_lowercase(),
                    "grantee": to_hex_prefixed(grantee.as_slice()).to_lowercase(),
                }))
            }
            other => Err(format!("Unsupported playlist share operation: {other}")),
        }
    }
}
