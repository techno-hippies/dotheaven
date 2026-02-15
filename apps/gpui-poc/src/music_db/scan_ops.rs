use super::*;

impl MusicDb {
    /// Scan a folder for audio files. Returns total track count.
    /// `progress_cb` is called periodically with (done, total).
    pub fn scan_folder(
        &self,
        folder: &str,
        mut progress_cb: impl FnMut(ScanProgress),
    ) -> Result<i64, String> {
        // 1. Collect audio files
        let mut audio_files: Vec<PathBuf> = Vec::new();
        for entry in WalkDir::new(folder)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() && is_audio_file(path) {
                audio_files.push(path.to_path_buf());
                if audio_files.len() % 200 == 0 {
                    progress_cb(ScanProgress {
                        done: 0,
                        total: audio_files.len(),
                    });
                }
            }
        }

        let total = audio_files.len();
        progress_cb(ScanProgress { done: 0, total });
        log::info!(
            "music_db: scanning {} — found {} audio files",
            folder,
            total
        );

        let mut seen_paths: HashSet<String> = HashSet::with_capacity(total);
        let mut cache_hits: usize = 0;
        let mut extracted: usize = 0;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|e| format!("scan transaction begin failed: {e}"))?;

        // 2. Process each file
        for (i, path) in audio_files.iter().enumerate() {
            let path_str = path.to_string_lossy().to_string();
            seen_paths.insert(path_str.clone());

            let fs_meta = match std::fs::metadata(path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let file_size = fs_meta.len() as i64;
            let file_mtime = fs_meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            // Check cache
            let cached: Option<(i64, i64, Option<String>)> = tx
                .query_row(
                    "SELECT file_size, file_mtime, cover_path FROM tracks WHERE file_path = ?1",
                    params![&path_str],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .ok();

            if let Some((sz, mt, cover_path_cached)) = cached {
                if sz == file_size && mt == file_mtime {
                    let cover_file_missing = cover_path_cached
                        .as_deref()
                        .filter(|p| !p.is_empty())
                        .map(|p| !Path::new(p).exists())
                        .unwrap_or(false);
                    if !cover_file_missing {
                        cache_hits += 1;
                        if i % 100 == 0 {
                            progress_cb(ScanProgress { done: i + 1, total });
                        }
                        continue;
                    }
                }
            }

            // Extract metadata
            extracted += 1;
            let (title, artist, album, duration, mbid, ip_id, cover_path) =
                extract_metadata(path, &path_str, &self.covers_dir);

            tx.execute(
                "INSERT OR REPLACE INTO tracks (file_path, title, artist, album, duration_ms, duration, mbid, ip_id, file_size, file_mtime, folder_path, cover_path)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    &path_str,
                    &title,
                    &artist,
                    &album,
                    duration.map(|d| d as i64),
                    duration.map(format_duration_ms).unwrap_or_default(),
                    &mbid,
                    &ip_id,
                    file_size,
                    file_mtime,
                    folder,
                    &cover_path,
                ],
            )
            .ok();

            if i % 50 == 0 {
                progress_cb(ScanProgress { done: i + 1, total });
            }
        }

        log::info!(
            "music_db: scan done — {} cached, {} extracted, {} total",
            cache_hits,
            extracted,
            total
        );

        // 3. Prune deleted files
        let db_paths: Vec<String> = {
            let mut stmt = tx
                .prepare("SELECT file_path FROM tracks WHERE folder_path = ?1")
                .map_err(|e| format!("Prune prepare: {e}"))?;
            let rows = stmt
                .query_map(params![folder], |row| row.get(0))
                .map_err(|e| format!("Prune query: {e}"))?;
            let mut out = Vec::new();
            for row in rows {
                if let Ok(path) = row {
                    out.push(path);
                }
            }
            out
        };

        let mut pruned: usize = 0;
        for db_path in &db_paths {
            if !seen_paths.contains(db_path) {
                tx.execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
                pruned += 1;
            }
        }
        if pruned > 0 {
            log::info!("music_db: pruned {} deleted files", pruned);
        }

        tx.commit()
            .map_err(|e| format!("scan transaction commit failed: {e}"))?;

        // Final progress
        progress_cb(ScanProgress { done: total, total });

        // 4. Return count
        self.get_track_count(folder)
    }

    /// Insert or refresh a single audio file without rescanning the whole folder.
    /// `folder` is the root library folder used for filtering in `get_tracks`.
    pub fn insert_single_track(&self, folder: &str, path: &Path) -> Result<(), String> {
        if folder.trim().is_empty() {
            return Err("Missing library folder for incremental insert.".to_string());
        }
        if !path.exists() || !path.is_file() {
            return Err(format!(
                "Track file does not exist or is not a file: {}",
                path.display()
            ));
        }
        if !is_audio_file(path) {
            return Err(format!(
                "Unsupported audio file extension: {}",
                path.display()
            ));
        }

        let path_str = path.to_string_lossy().to_string();
        let fs_meta = std::fs::metadata(path)
            .map_err(|e| format!("Failed to read file metadata ({}): {e}", path.display()))?;
        let file_size = fs_meta.len() as i64;
        let file_mtime = fs_meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let (title, artist, album, duration, mbid, ip_id, cover_path) =
            extract_metadata(path, &path_str, &self.covers_dir);

        self.conn
            .execute(
                "INSERT OR REPLACE INTO tracks (file_path, title, artist, album, duration_ms, duration, mbid, ip_id, file_size, file_mtime, folder_path, cover_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    &path_str,
                    &title,
                    &artist,
                    &album,
                    duration.map(|d| d as i64),
                    duration.map(format_duration_ms).unwrap_or_default(),
                    &mbid,
                    &ip_id,
                    file_size,
                    file_mtime,
                    folder,
                    &cover_path,
                ],
            )
            .map_err(|e| format!("Failed to insert track into library DB: {e}"))?;

        Ok(())
    }
}
