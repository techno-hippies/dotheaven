//! Local music library database — ported from Tauri music_db.rs.
//! Uses rusqlite for storage, lofty for metadata extraction, walkdir for scanning.
//! No Tauri IPC needed since we're already in Rust.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection};
use serde::Serialize;
use walkdir::WalkDir;

use lofty::prelude::*;

// =============================================================================
// Types
// =============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackRow {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub file_path: String,
    pub mbid: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub done: usize,
    pub total: usize,
}

// =============================================================================
// Audio extensions
// =============================================================================

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma"];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// =============================================================================
// Filename fallback
// =============================================================================

fn fallback_from_filename(name: &str) -> (String, String) {
    let base = match name.rfind('.') {
        Some(i) => &name[..i],
        None => name,
    };
    let clean = base.replace('_', " ");

    if let Some(idx) = clean.find(" - ") {
        let artist = clean[..idx].trim().to_string();
        let title = clean[idx + 3..].trim().to_string();
        if !artist.is_empty() && !title.is_empty() {
            return (title, artist);
        }
    }

    let trimmed = clean
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start_matches(|c: char| c == '.' || c == ')' || c == '-')
        .trim_start();
    let title = if trimmed.is_empty() { &clean } else { trimmed };
    (title.to_string(), "Unknown Artist".to_string())
}

fn format_duration_ms(ms: u64) -> String {
    let secs = ms / 1000;
    let m = secs / 60;
    let s = secs % 60;
    format!("{}:{:02}", m, s)
}

/// Simple content hash using std — no sha2 crate needed.
fn content_hash(data: &[u8]) -> String {
    // Use a basic FNV-1a 64-bit hash for cover art dedup.
    // Not cryptographic, but fine for local file dedup.
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

// =============================================================================
// MusicDb
// =============================================================================

pub struct MusicDb {
    conn: Connection,
    covers_dir: PathBuf,
}

impl MusicDb {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        let db_path = app_data_dir.join("music.db");
        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open music.db: {e}"))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tracks (
                file_path   TEXT PRIMARY KEY,
                title       TEXT NOT NULL,
                artist      TEXT NOT NULL DEFAULT 'Unknown Artist',
                album       TEXT NOT NULL DEFAULT '',
                duration_ms INTEGER,
                duration    TEXT NOT NULL DEFAULT '',
                mbid        TEXT,
                file_size   INTEGER NOT NULL,
                file_mtime  INTEGER NOT NULL,
                folder_path TEXT NOT NULL,
                cover_path  TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_path);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to create tables: {e}"))?;

        let covers_dir = app_data_dir.join("covers");
        std::fs::create_dir_all(&covers_dir).ok();

        log::info!("MusicDb opened at {}", db_path.display());
        Ok(Self { conn, covers_dir })
    }

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
                "SELECT file_path, title, artist, album, duration, mbid, rowid, cover_path
                 FROM tracks WHERE folder_path = ?1 ORDER BY title COLLATE NOCASE
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| format!("Failed to prepare: {e}"))?;

        let rows = stmt
            .query_map(params![folder, limit, offset], |row| {
                let rowid: i64 = row.get(6)?;
                Ok(TrackRow {
                    id: format!("local-{}", rowid),
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    duration: row.get(4)?,
                    mbid: row.get(5)?,
                    cover_path: row.get(7)?,
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
            let cached: Option<(i64, i64, Option<String>)> = self
                .conn
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
            let (title, artist, album, duration, mbid, cover_path) =
                extract_metadata(path, &path_str, &self.covers_dir);

            self.conn
                .execute(
                    "INSERT OR REPLACE INTO tracks (file_path, title, artist, album, duration_ms, duration, mbid, file_size, file_mtime, folder_path, cover_path)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        &path_str,
                        &title,
                        &artist,
                        &album,
                        duration.map(|d| d as i64),
                        duration.map(format_duration_ms).unwrap_or_default(),
                        &mbid,
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
        let mut stmt = self
            .conn
            .prepare("SELECT file_path FROM tracks WHERE folder_path = ?1")
            .map_err(|e| format!("Prune prepare: {e}"))?;
        let db_paths: Vec<String> = stmt
            .query_map(params![folder], |row| row.get(0))
            .map_err(|e| format!("Prune query: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut pruned: usize = 0;
        for db_path in &db_paths {
            if !seen_paths.contains(db_path) {
                self.conn
                    .execute("DELETE FROM tracks WHERE file_path = ?1", params![db_path])
                    .ok();
                pruned += 1;
            }
        }
        if pruned > 0 {
            log::info!("music_db: pruned {} deleted files", pruned);
        }

        // Final progress
        progress_cb(ScanProgress { done: total, total });

        // 4. Return count
        self.get_track_count(folder)
    }
}

// =============================================================================
// Metadata extraction via lofty
// =============================================================================

fn extract_metadata(
    path: &Path,
    path_str: &str,
    covers_dir: &Path,
) -> (
    String,
    String,
    String,
    Option<u64>,
    Option<String>,
    Option<String>,
) {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");
    let (fb_title, fb_artist) = fallback_from_filename(file_name);

    match lofty::read_from_path(path) {
        Ok(tagged) => {
            let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
            let title = tag
                .and_then(|t| t.title().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .unwrap_or(fb_title);
            let artist = tag
                .and_then(|t| t.artist().map(|s| s.to_string()))
                .filter(|s| !s.is_empty())
                .unwrap_or(fb_artist);
            let album = tag
                .and_then(|t| t.album().map(|s| s.to_string()))
                .unwrap_or_default();
            let duration_ms = {
                let props = tagged.properties();
                let dur = props.duration();
                if dur.as_millis() > 0 {
                    Some(dur.as_millis() as u64)
                } else {
                    None
                }
            };
            let mbid = tag.and_then(|t| {
                t.get_string(&lofty::prelude::ItemKey::MusicBrainzRecordingId)
                    .map(|s| s.to_string())
            });

            // Extract cover art
            let cover_path = tag.and_then(|t| {
                let pictures = t.pictures();
                if pictures.is_empty() {
                    return None;
                }
                let pic = pictures
                    .iter()
                    .find(|p| p.pic_type() == lofty::picture::PictureType::CoverFront)
                    .or_else(|| pictures.iter().max_by_key(|p| p.data().len()))
                    .or(pictures.first())?;
                let ext = match pic.mime_type() {
                    Some(lofty::picture::MimeType::Png) => "png",
                    Some(lofty::picture::MimeType::Bmp) => "bmp",
                    _ => "jpg",
                };
                let hash = content_hash(pic.data());
                let cover_filename = format!("{}.{}", hash, ext);
                let cover_file = covers_dir.join(&cover_filename);

                if !cover_file.exists() {
                    if let Err(e) = std::fs::write(&cover_file, pic.data()) {
                        log::warn!("Failed to write cover art for {}: {}", path_str, e);
                        return None;
                    }
                }
                Some(cover_file.to_string_lossy().to_string())
            });

            (title, artist, album, duration_ms, mbid, cover_path)
        }
        Err(e) => {
            log::warn!("lofty failed for {}: {}", path_str, e);
            (fb_title, fb_artist, String::new(), None, None, None)
        }
    }
}
