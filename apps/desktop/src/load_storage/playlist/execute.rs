use super::*;
use alloy_sol_types::{sol, SolCall};

const GAS_LIMIT_CREATE_MIN: u64 = 800_000;
const GAS_LIMIT_SET_TRACKS_MIN: u64 = 100_000;
const GAS_LIMIT_UPDATE_META_MIN: u64 = 100_000;
const GAS_LIMIT_DELETE_MIN: u64 = 100_000;

sol! {
    function createPlaylist(
        string name,
        string coverCid,
        uint8 visibility,
        bytes32[] trackIds
    ) returns (bytes32 playlistId);

    function setTracks(bytes32 playlistId, bytes32[] trackIds);

    function updateMeta(
        bytes32 playlistId,
        string name,
        string coverCid,
        uint8 visibility
    );

    function deletePlaylist(bytes32 playlistId);
}

impl LoadStorageService {
    pub(super) fn execute_playlist_action(
        &mut self,
        auth: &PersistedAuth,
        operation: &str,
        params: serde_json::Map<String, Value>,
        _has_inline_cover_upload: bool,
    ) -> Result<Value, String> {
        let playlist_contract = playlist_v1();

        match operation {
            "create" => {
                let name = required_param_string(&params, "name")?;
                let mut cover_cid = optional_param_string(&params, "coverCid");
                let visibility = required_param_u8(&params, "visibility")?;

                if let Some(uploaded) = maybe_upload_cover_from_params(self, auth, &params)? {
                    cover_cid = uploaded;
                }

                let track_ids = collect_new_track_ids(&params)?;
                let call_data = createPlaylistCall {
                    name,
                    coverCid: cover_cid.clone(),
                    visibility,
                    trackIds: track_ids,
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &playlist_contract,
                    call_data,
                    GAS_LIMIT_CREATE_MIN,
                    "playlist create",
                )?;

                let playlist_id = fetch_created_playlist_id_from_receipt(&tx_hash)?;

                Ok(json!({
                    "success": true,
                    "operation": "create",
                    "txHash": tx_hash,
                    "playlistId": playlist_id,
                    "coverCid": cover_cid,
                }))
            }
            "setTracks" => {
                let playlist_id = required_param_bytes32(&params, "playlistId")?;
                let track_ids = collect_set_tracks_ids(&params)?;

                let call_data = setTracksCall {
                    playlistId: playlist_id,
                    trackIds: track_ids.clone(),
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &playlist_contract,
                    call_data,
                    GAS_LIMIT_SET_TRACKS_MIN,
                    "playlist setTracks",
                )?;

                Ok(json!({
                    "success": true,
                    "operation": "setTracks",
                    "txHash": tx_hash,
                    "playlistId": to_hex_prefixed(playlist_id.as_slice()).to_lowercase(),
                    "trackCount": track_ids.len(),
                }))
            }
            "updateMeta" => {
                let playlist_id = required_param_bytes32(&params, "playlistId")?;
                let name = required_param_string(&params, "name")?;
                let visibility = required_param_u8(&params, "visibility")?;
                let mut cover_cid = optional_param_string(&params, "coverCid");

                if let Some(uploaded) = maybe_upload_cover_from_params(self, auth, &params)? {
                    cover_cid = uploaded;
                }

                let call_data = updateMetaCall {
                    playlistId: playlist_id,
                    name,
                    coverCid: cover_cid.clone(),
                    visibility,
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &playlist_contract,
                    call_data,
                    GAS_LIMIT_UPDATE_META_MIN,
                    "playlist updateMeta",
                )?;

                Ok(json!({
                    "success": true,
                    "operation": "updateMeta",
                    "txHash": tx_hash,
                    "playlistId": to_hex_prefixed(playlist_id.as_slice()).to_lowercase(),
                    "coverCid": cover_cid,
                    "visibility": visibility,
                }))
            }
            "delete" => {
                let playlist_id = required_param_bytes32(&params, "playlistId")?;
                let call_data = deletePlaylistCall {
                    playlistId: playlist_id,
                }
                .abi_encode();

                let tx_hash = crate::scrobble::submit_tempo_contract_call(
                    auth,
                    &playlist_contract,
                    call_data,
                    GAS_LIMIT_DELETE_MIN,
                    "playlist delete",
                )?;

                Ok(json!({
                    "success": true,
                    "operation": "delete",
                    "txHash": tx_hash,
                    "playlistId": to_hex_prefixed(playlist_id.as_slice()).to_lowercase(),
                }))
            }
            other => Err(format!("Unsupported playlist operation: {other}")),
        }
    }
}

fn required_param_string(
    params: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<String, String> {
    let value = params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("Missing or empty `{key}`"))?;
    Ok(value.to_string())
}

fn optional_param_string(params: &serde_json::Map<String, Value>, key: &str) -> String {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn required_param_u8(params: &serde_json::Map<String, Value>, key: &str) -> Result<u8, String> {
    let raw = params
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("Missing numeric `{key}`"))?;
    u8::try_from(raw).map_err(|_| format!("`{key}` out of range for uint8: {raw}"))
}

fn required_param_bytes32(
    params: &serde_json::Map<String, Value>,
    key: &str,
) -> Result<B256, String> {
    let raw = params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing `{key}`"))?;
    let bytes = decode_bytes32_hex(raw, key)?;
    Ok(B256::from(bytes))
}

fn collect_new_track_ids(params: &serde_json::Map<String, Value>) -> Result<Vec<B256>, String> {
    let tracks = params
        .get("tracks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::<B256>::with_capacity(tracks.len());
    for track in tracks {
        out.push(track_value_to_track_id(&track)?);
    }
    Ok(out)
}

fn collect_set_tracks_ids(params: &serde_json::Map<String, Value>) -> Result<Vec<B256>, String> {
    let existing = params
        .get("existingTrackIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let fresh_tracks = params
        .get("tracks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut seen = HashSet::<String>::new();
    let mut out = Vec::<B256>::new();

    for value in existing {
        let Some(track_id_raw) = value.as_str() else {
            continue;
        };
        let normalized = normalize_bytes32_hex(track_id_raw, "trackId")?;
        if !seen.insert(normalized.clone()) {
            continue;
        }
        out.push(B256::from(decode_bytes32_hex(
            normalized.as_str(),
            "trackId",
        )?));
    }

    for track in fresh_tracks {
        let track_id = track_value_to_track_id(&track)?;
        let normalized = to_hex_prefixed(track_id.as_slice()).to_lowercase();
        if !seen.insert(normalized) {
            continue;
        }
        out.push(track_id);
    }

    Ok(out)
}

fn track_value_to_track_id(value: &Value) -> Result<B256, String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "Playlist track entry must be an object".to_string())?;

    if let Some(track_id) = obj
        .get("trackId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let normalized = normalize_bytes32_hex(track_id, "trackId")?;
        return Ok(B256::from(decode_bytes32_hex(&normalized, "trackId")?));
    }

    let title = obj
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Playlist track title is required".to_string())?;
    let artist = obj
        .get("artist")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Playlist track artist is required".to_string())?;

    let album = obj
        .get("album")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let mbid = obj
        .get("mbid")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let ip_id = obj
        .get("ipId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty());

    build_track_id(title, artist, album, mbid, ip_id)
}

fn maybe_upload_cover_from_params(
    service: &mut LoadStorageService,
    auth: &PersistedAuth,
    params: &serde_json::Map<String, Value>,
) -> Result<Option<String>, String> {
    let Some(cover_obj) = params.get("coverImage").and_then(Value::as_object) else {
        return Ok(None);
    };

    let base64 = cover_obj
        .get("base64")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    let content_type = cover_obj
        .get("contentType")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();

    if base64.is_empty() || content_type.is_empty() {
        return Ok(None);
    }

    let uploaded = service.playlist_upload_cover_to_arweave_turbo(
        auth,
        &PlaylistCoverImageInput {
            base64: base64.to_string(),
            content_type: content_type.to_string(),
        },
        None,
    )?;
    Ok(Some(uploaded))
}

fn fetch_created_playlist_id_from_receipt(tx_hash: &str) -> Result<Option<String>, String> {
    let tx_hash = normalize_bytes32_hex(tx_hash, "txHash")?;
    let payload = http_post_json(
        &tempo_rpc_url(),
        json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "eth_getTransactionReceipt",
            "params": [tx_hash],
        }),
    )?;

    if let Some(err) = payload.get("error") {
        return Err(format!("RPC eth_getTransactionReceipt error: {err}"));
    }

    let Some(receipt) = payload.get("result") else {
        return Ok(None);
    };

    let logs = receipt
        .get("logs")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let playlist_addr = playlist_v1().to_lowercase();
    let created_topic = to_hex_prefixed(
        keccak256(
            b"PlaylistCreated(bytes32,address,uint32,uint8,uint32,bytes32,uint64,string,string)",
        )
        .as_slice(),
    )
    .to_lowercase();

    for log in logs {
        let Some(log_obj) = log.as_object() else {
            continue;
        };
        let addr = log_obj
            .get("address")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_lowercase();
        if addr != playlist_addr {
            continue;
        }

        let Some(topics) = log_obj.get("topics").and_then(Value::as_array) else {
            continue;
        };
        let topic0 = topics
            .first()
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default()
            .to_lowercase();
        if topic0 != created_topic {
            continue;
        }

        let Some(playlist_id_raw) = topics.get(1).and_then(Value::as_str) else {
            continue;
        };
        let playlist_id = normalize_bytes32_hex(playlist_id_raw, "playlistId")?;
        return Ok(Some(playlist_id));
    }

    Ok(None)
}
