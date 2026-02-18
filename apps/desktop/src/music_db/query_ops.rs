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

    pub fn get_track_media_state(
        &self,
        track_id: &str,
    ) -> Result<Option<TrackMediaStateRow>, String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Ok(None);
        }

        let mut stmt = self
            .conn
            .prepare(
                "SELECT track_id, cover_local, cover_ref, cover_status, cover_checked, created_at, updated_at
                 FROM track_media_state
                 WHERE track_id = ?1",
            )
            .map_err(|e| format!("Failed preparing track_media_state query: {e}"))?;

        let mut rows = stmt
            .query(params![track_id])
            .map_err(|e| format!("Failed querying track_media_state: {e}"))?;
        let Some(row) = rows
            .next()
            .map_err(|e| format!("Failed reading track_media_state row: {e}"))?
        else {
            return Ok(None);
        };

        Ok(Some(TrackMediaStateRow {
            track_id: row
                .get(0)
                .map_err(|e| format!("Failed reading track_id: {e}"))?,
            cover_local: row
                .get(1)
                .map_err(|e| format!("Failed reading cover_local: {e}"))?,
            cover_ref: row
                .get(2)
                .map_err(|e| format!("Failed reading cover_ref: {e}"))?,
            cover_status: row
                .get(3)
                .map_err(|e| format!("Failed reading cover_status: {e}"))?,
            cover_checked: row
                .get(4)
                .map_err(|e| format!("Failed reading cover_checked: {e}"))?,
            created_at: row
                .get(5)
                .map_err(|e| format!("Failed reading created_at: {e}"))?,
            updated_at: row
                .get(6)
                .map_err(|e| format!("Failed reading updated_at: {e}"))?,
        }))
    }

    pub fn upsert_track_media_state_pending(
        &self,
        track_id: &str,
        cover_local: Option<&str>,
    ) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_media_state".to_string());
        }

        let cover_local = cover_local
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string);
        let next_status = if cover_local.is_some() {
            "pending"
        } else {
            "skipped"
        };
        let now = now_epoch_sec_i64();

        self.conn
            .execute(
                "INSERT INTO track_media_state (
                    track_id, cover_local, cover_ref, cover_status, cover_checked, created_at, updated_at
                 ) VALUES (?1, ?2, NULL, ?3, NULL, ?4, ?4)
                 ON CONFLICT(track_id) DO UPDATE SET
                    cover_local = COALESCE(excluded.cover_local, track_media_state.cover_local),
                    cover_status = CASE
                        WHEN track_media_state.cover_status IN ('uploaded', 'synced') THEN track_media_state.cover_status
                        WHEN track_media_state.cover_status = 'skipped' AND excluded.cover_status = 'pending' THEN 'pending'
                        ELSE excluded.cover_status
                    END,
                    updated_at = excluded.updated_at",
                params![track_id, cover_local, next_status, now],
            )
            .map_err(|e| format!("Failed upserting track_media_state row: {e}"))?;
        Ok(())
    }

    pub fn set_track_media_state_uploaded(
        &self,
        track_id: &str,
        cover_ref: &str,
    ) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_media_state".to_string());
        }
        let cover_ref = cover_ref.trim();
        if cover_ref.is_empty() {
            return Err("cover_ref is required for uploaded track_media_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_media_state
                 SET cover_ref = ?2, cover_status = 'uploaded', updated_at = ?3
                 WHERE track_id = ?1",
                params![track_id, cover_ref, now],
            )
            .map_err(|e| format!("Failed updating track_media_state uploaded row: {e}"))?;
        Ok(())
    }

    pub fn set_track_media_state_synced(
        &self,
        track_id: &str,
        cover_ref: &str,
    ) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_media_state".to_string());
        }
        let cover_ref = cover_ref.trim();
        if cover_ref.is_empty() {
            return Err("cover_ref is required for synced track_media_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_media_state
                 SET cover_ref = ?2, cover_status = 'synced', cover_checked = ?3, updated_at = ?3
                 WHERE track_id = ?1",
                params![track_id, cover_ref, now],
            )
            .map_err(|e| format!("Failed updating track_media_state synced row: {e}"))?;
        Ok(())
    }

    pub fn set_track_media_state_skipped(&self, track_id: &str) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_media_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_media_state
                 SET cover_status = 'skipped', updated_at = ?2
                 WHERE track_id = ?1",
                params![track_id, now],
            )
            .map_err(|e| format!("Failed updating track_media_state skipped row: {e}"))?;
        Ok(())
    }

    pub fn get_track_lyrics_state(
        &self,
        track_id: &str,
    ) -> Result<Option<TrackLyricsStateRow>, String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Ok(None);
        }

        let mut stmt = self
            .conn
            .prepare(
                "SELECT track_id, lyrics_ref, lyrics_status, lyrics_checked, created_at, updated_at
                 FROM track_lyrics_state
                 WHERE track_id = ?1",
            )
            .map_err(|e| format!("Failed preparing track_lyrics_state query: {e}"))?;

        let mut rows = stmt
            .query(params![track_id])
            .map_err(|e| format!("Failed querying track_lyrics_state: {e}"))?;
        let Some(row) = rows
            .next()
            .map_err(|e| format!("Failed reading track_lyrics_state row: {e}"))?
        else {
            return Ok(None);
        };

        Ok(Some(TrackLyricsStateRow {
            track_id: row
                .get(0)
                .map_err(|e| format!("Failed reading track_id: {e}"))?,
            lyrics_ref: row
                .get(1)
                .map_err(|e| format!("Failed reading lyrics_ref: {e}"))?,
            lyrics_status: row
                .get(2)
                .map_err(|e| format!("Failed reading lyrics_status: {e}"))?,
            lyrics_checked: row
                .get(3)
                .map_err(|e| format!("Failed reading lyrics_checked: {e}"))?,
            created_at: row
                .get(4)
                .map_err(|e| format!("Failed reading created_at: {e}"))?,
            updated_at: row
                .get(5)
                .map_err(|e| format!("Failed reading updated_at: {e}"))?,
        }))
    }

    pub fn upsert_track_lyrics_state_pending(&self, track_id: &str) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_lyrics_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "INSERT INTO track_lyrics_state (
                    track_id, lyrics_ref, lyrics_status, lyrics_checked, created_at, updated_at
                 ) VALUES (?1, NULL, 'pending', NULL, ?2, ?2)
                 ON CONFLICT(track_id) DO UPDATE SET
                    lyrics_status = CASE
                        WHEN track_lyrics_state.lyrics_status IN ('uploaded', 'synced') THEN track_lyrics_state.lyrics_status
                        ELSE 'pending'
                    END,
                    updated_at = excluded.updated_at",
                params![track_id, now],
            )
            .map_err(|e| format!("Failed upserting track_lyrics_state row: {e}"))?;
        Ok(())
    }

    pub fn set_track_lyrics_state_uploaded(
        &self,
        track_id: &str,
        lyrics_ref: &str,
    ) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_lyrics_state".to_string());
        }
        let lyrics_ref = lyrics_ref.trim();
        if lyrics_ref.is_empty() {
            return Err("lyrics_ref is required for uploaded track_lyrics_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_lyrics_state
                 SET lyrics_ref = ?2, lyrics_status = 'uploaded', updated_at = ?3
                 WHERE track_id = ?1",
                params![track_id, lyrics_ref, now],
            )
            .map_err(|e| format!("Failed updating track_lyrics_state uploaded row: {e}"))?;
        Ok(())
    }

    pub fn set_track_lyrics_state_synced(
        &self,
        track_id: &str,
        lyrics_ref: &str,
    ) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_lyrics_state".to_string());
        }
        let lyrics_ref = lyrics_ref.trim();
        if lyrics_ref.is_empty() {
            return Err("lyrics_ref is required for synced track_lyrics_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_lyrics_state
                 SET lyrics_ref = ?2, lyrics_status = 'synced', lyrics_checked = ?3, updated_at = ?3
                 WHERE track_id = ?1",
                params![track_id, lyrics_ref, now],
            )
            .map_err(|e| format!("Failed updating track_lyrics_state synced row: {e}"))?;
        Ok(())
    }

    pub fn set_track_lyrics_state_skipped(&self, track_id: &str) -> Result<(), String> {
        let track_id = track_id.trim().to_ascii_lowercase();
        if track_id.is_empty() {
            return Err("track_id is required for track_lyrics_state".to_string());
        }

        let now = now_epoch_sec_i64();
        self.conn
            .execute(
                "UPDATE track_lyrics_state
                 SET lyrics_status = 'skipped', updated_at = ?2
                 WHERE track_id = ?1",
                params![track_id, now],
            )
            .map_err(|e| format!("Failed updating track_lyrics_state skipped row: {e}"))?;
        Ok(())
    }
}

fn now_epoch_sec_i64() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
