use super::*;

pub(in crate::library) fn fetch_artist_cloud_stats(
    artist: &str,
    tracks: &[TrackRow],
) -> Result<ArtistCloudStats, String> {
    let escaped_artist = escape_gql(artist);
    let query = format!(
        "{{ tracks(where: {{ artist_contains_nocase: \"{}\" }}, first: 300, orderBy: registeredAt, orderDirection: desc) {{ id artist scrobbles(first: 1000) {{ id user }} }} }}",
        escaped_artist
    );
    let payload = http_post_json(
        &subgraph_music_social_url(),
        serde_json::json!({ "query": query }),
    )?;
    let rows = payload
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let target_artist = normalize_artist_name(artist);
    let mut track_scrobbles = HashMap::<String, usize>::new();

    for row in rows {
        let row_artist = row
            .get("artist")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !artist_matches_target(row_artist, &target_artist) {
            continue;
        }

        let track_id = row
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let scrobbles = row
            .get("scrobbles")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let play_count = scrobbles.len();
        if !track_id.is_empty() {
            track_scrobbles.insert(track_id.to_string(), play_count);
        }
    }

    let image_path = resolve_artist_image_path(artist, tracks, None);

    Ok(ArtistCloudStats {
        title: artist.to_string(),
        image_path,
        track_scrobbles,
    })
}

pub(in crate::library) fn fetch_album_cloud_stats(
    artist: &str,
    album: &str,
    tracks: &[TrackRow],
) -> Result<AlbumCloudStats, String> {
    let where_clause = if album.trim().is_empty() {
        format!(
            "artist_contains_nocase: \"{}\"",
            escape_gql(&sanitize_detail_value(artist.to_string(), "Unknown Artist"))
        )
    } else {
        format!("album_contains_nocase: \"{}\"", escape_gql(album))
    };
    let query = format!(
        "{{ tracks(where: {{ {} }}, first: 300, orderBy: registeredAt, orderDirection: desc) {{ id artist album scrobbles(first: 1000) {{ id user }} }} }}",
        where_clause
    );
    let payload = http_post_json(
        &subgraph_music_social_url(),
        serde_json::json!({ "query": query }),
    )?;
    let rows = payload
        .get("data")
        .and_then(|v| v.get("tracks"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let target_artist = normalize_artist_name(artist);
    let target_album_variants = normalize_album_variants(album);
    let mut track_scrobbles = HashMap::<String, usize>::new();

    for row in rows {
        let row_artist = row
            .get("artist")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let row_album = row.get("album").and_then(Value::as_str).unwrap_or_default();
        if !artist_matches_target(row_artist, &target_artist) {
            continue;
        }
        if !album_matches_target(row_album, &target_album_variants) {
            continue;
        }

        let track_id = row
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let scrobbles = row
            .get("scrobbles")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let play_count = scrobbles.len();
        if !track_id.is_empty() {
            track_scrobbles.insert(track_id.to_string(), play_count);
        }
    }

    let image_path = resolve_album_image_path(artist, album, tracks, None);

    Ok(AlbumCloudStats {
        title: sanitize_detail_value(album.to_string(), "Unknown Album"),
        artist: sanitize_detail_value(artist.to_string(), "Unknown Artist"),
        image_path,
        track_scrobbles,
    })
}
