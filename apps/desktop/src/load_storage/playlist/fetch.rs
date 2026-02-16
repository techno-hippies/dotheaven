use super::*;

impl LoadStorageService {
    pub fn playlist_fetch_user_playlists(
        &mut self,
        owner_address: &str,
        max_entries: usize,
    ) -> Result<Value, String> {
        let owner = owner_address
            .parse::<Address>()
            .map_err(|e| format!("Invalid owner address ({owner_address}): {e}"))?;
        let owner_hex = format!("{:#x}", owner).to_lowercase();
        let limit = max_entries.clamp(1, 500);

        let query = format!(
            "{{ playlists(where: {{ owner: \"{owner_hex}\", exists: true }}, orderBy: updatedAt, orderDirection: desc, first: {limit}) {{ id owner name coverCid visibility trackCount version exists tracksHash createdAt updatedAt }} }}"
        );
        let payload = http_post_json(
            &subgraph_playlists_url(),
            json!({
                "query": query,
            }),
        )?;

        Ok(payload
            .get("data")
            .and_then(|v| v.get("playlists"))
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())))
    }

    pub fn playlist_fetch_track_ids(
        &mut self,
        playlist_id: &str,
        max_entries: usize,
    ) -> Result<Vec<String>, String> {
        let playlist_id_norm = normalize_bytes32_hex(playlist_id, "playlistId")?;
        let limit = max_entries.clamp(1, 1000);

        let query = format!(
            "{{ playlistTracks(where: {{ playlist: \"{playlist_id_norm}\" }}, orderBy: position, orderDirection: asc, first: {limit}) {{ trackId position }} }}"
        );
        let payload = http_post_json(
            &subgraph_playlists_url(),
            json!({
                "query": query,
            }),
        )?;

        let mut out = Vec::<String>::new();
        let entries = payload
            .get("data")
            .and_then(|v| v.get("playlistTracks"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in entries {
            if let Some(track_id) = entry.get("trackId").and_then(Value::as_str) {
                if let Ok(norm) = normalize_bytes32_hex(track_id, "trackId") {
                    out.push(norm);
                }
            }
        }
        Ok(out)
    }

    pub fn playlist_fetch_tracks_with_metadata(
        &mut self,
        playlist_id: &str,
        max_entries: usize,
    ) -> Result<Vec<Value>, String> {
        let track_ids = self.playlist_fetch_track_ids(playlist_id, max_entries)?;
        let mut out = Vec::<Value>::with_capacity(track_ids.len());

        for (position, track_id) in track_ids.into_iter().enumerate() {
            let (title, artist, album, source) = if let Some((title, artist, album)) =
                fetch_track_metadata_subgraph(&track_id)?
            {
                (title, artist, album, "subgraph".to_string())
            } else if let Some((title, artist, album)) = fetch_track_metadata_onchain(&track_id)? {
                (title, artist, album, "onchain".to_string())
            } else {
                let short = track_id.strip_prefix("0x").unwrap_or(track_id.as_str());
                let short = &short[..short.len().min(10)];
                (
                    format!("Track {short}"),
                    "Unknown Artist".to_string(),
                    "Unknown Album".to_string(),
                    "track-id".to_string(),
                )
            };

            out.push(json!({
                "trackId": track_id,
                "position": position,
                "title": title,
                "artist": artist,
                "album": album,
                "source": source,
            }));
        }

        Ok(out)
    }
}
