use super::*;

impl MusicDb {
    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )
            .map_err(|e| format!("Failed to set setting: {e}"))?;
        Ok(())
    }

    pub fn get_tracks(
        &self,
        folder: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<TrackRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT file_path, title, artist, album, duration, mbid, ip_id, rowid, cover_path
                 FROM tracks WHERE folder_path = ?1 ORDER BY title COLLATE NOCASE
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| format!("Failed to prepare: {e}"))?;

        let rows = stmt
            .query_map(params![folder, limit, offset], |row| {
                let rowid: i64 = row.get(7)?;
                Ok(TrackRow {
                    id: format!("local-{}", rowid),
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    duration: row.get(4)?,
                    mbid: row.get(5)?,
                    ip_id: row.get(6)?,
                    cover_path: row.get(8)?,
                    storage_status: StorageStatus::default(),
                })
            })
            .map_err(|e| format!("Failed to query: {e}"))?;

        let mut tracks = Vec::new();
        for row in rows {
            tracks.push(row.map_err(|e| format!("Row error: {e}"))?);
        }
        Ok(tracks)
    }

    pub fn get_track_count(&self, folder: &str) -> Result<i64, String> {
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM tracks WHERE folder_path = ?1",
                params![folder],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count: {e}"))
    }

    pub fn get_lyrics_cache(&self, cache_key: &str) -> Result<Option<LyricsCacheRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT cache_key, track_name, artist_name, album_name, duration_sec, plain_lyrics,
                        synced_lyrics, lrclib_id, source, fetched_at_epoch_sec
                 FROM lyrics_cache
                 WHERE cache_key = ?1",
            )
            .map_err(|e| format!("Failed preparing lyrics cache query: {e}"))?;

        let mut rows = stmt
            .query(params![cache_key])
            .map_err(|e| format!("Failed querying lyrics cache: {e}"))?;
        let Some(row) = rows
            .next()
            .map_err(|e| format!("Failed reading lyrics cache row: {e}"))?
        else {
            return Ok(None);
        };

        Ok(Some(LyricsCacheRow {
            cache_key: row
                .get(0)
                .map_err(|e| format!("Failed reading cache_key: {e}"))?,
            track_name: row
                .get(1)
                .map_err(|e| format!("Failed reading track_name: {e}"))?,
            artist_name: row
                .get(2)
                .map_err(|e| format!("Failed reading artist_name: {e}"))?,
            album_name: row
                .get(3)
                .map_err(|e| format!("Failed reading album_name: {e}"))?,
            duration_sec: row
                .get(4)
                .map_err(|e| format!("Failed reading duration_sec: {e}"))?,
            plain_lyrics: row
                .get(5)
                .map_err(|e| format!("Failed reading plain_lyrics: {e}"))?,
            synced_lyrics: row
                .get(6)
                .map_err(|e| format!("Failed reading synced_lyrics: {e}"))?,
            lrclib_id: row
                .get(7)
                .map_err(|e| format!("Failed reading lrclib_id: {e}"))?,
            source: row
                .get(8)
                .map_err(|e| format!("Failed reading source: {e}"))?,
            fetched_at_epoch_sec: row
                .get(9)
                .map_err(|e| format!("Failed reading fetched_at_epoch_sec: {e}"))?,
        }))
    }

    pub fn upsert_lyrics_cache(&self, row: &LyricsCacheRow) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO lyrics_cache (
                    cache_key, track_name, artist_name, album_name, duration_sec,
                    plain_lyrics, synced_lyrics, lrclib_id, source, fetched_at_epoch_sec
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    &row.cache_key,
                    &row.track_name,
                    &row.artist_name,
                    &row.album_name,
                    row.duration_sec,
                    &row.plain_lyrics,
                    &row.synced_lyrics,
                    row.lrclib_id,
                    &row.source,
                    row.fetched_at_epoch_sec,
                ],
            )
            .map_err(|e| format!("Failed upserting lyrics cache row: {e}"))?;
        Ok(())
    }
}
