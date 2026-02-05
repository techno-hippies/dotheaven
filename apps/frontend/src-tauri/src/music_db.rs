use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
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
    pub artist_mbid: Option<String>,
    pub album_artist_mbid: Option<String>,
    pub album_cover: Option<String>,
    pub cover_path: Option<String>,
    pub cover_cid: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanProgress {
    pub done: usize,
    pub total: usize,
}

// =============================================================================
// Audio extensions
// =============================================================================

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "flac", "wav", "ogg", "aac", "opus", "wma",
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// =============================================================================
// Filename fallback (mirrors JS fallbackFromFilename)
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

    // Strip leading track number like "01. " or "01) " or "01- "
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
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open music.db: {e}"))?;

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
                folder_path TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_path);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to create tables: {e}"))?;

        // Migrate: add cover_path column if missing
        let has_cover_path: bool = conn
            .prepare("SELECT cover_path FROM tracks LIMIT 0")
            .is_ok();
        if !has_cover_path {
            conn.execute_batch("ALTER TABLE tracks ADD COLUMN cover_path TEXT")
                .map_err(|e| format!("Failed to add cover_path column: {e}"))?;
            log::info!("MusicDb: migrated — added cover_path column");
        }

        // Migrate: add cover_cid column if missing
        let has_cover_cid: bool = conn
            .prepare("SELECT cover_cid FROM tracks LIMIT 0")
            .is_ok();
        if !has_cover_cid {
            conn.execute_batch("ALTER TABLE tracks ADD COLUMN cover_cid TEXT DEFAULT ''")
                .map_err(|e| format!("Failed to add cover_cid column: {e}"))?;
            log::info!("MusicDb: migrated — added cover_cid column");
        }

        // Migrate: add artist_mbid column if missing
        let has_artist_mbid: bool = conn
            .prepare("SELECT artist_mbid FROM tracks LIMIT 0")
            .is_ok();
        if !has_artist_mbid {
            conn.execute_batch("ALTER TABLE tracks ADD COLUMN artist_mbid TEXT")
                .map_err(|e| format!("Failed to add artist_mbid column: {e}"))?;
            log::info!("MusicDb: migrated — added artist_mbid column");
        }

        // Migrate: add album_artist_mbid column if missing
        let has_album_artist_mbid: bool = conn
            .prepare("SELECT album_artist_mbid FROM tracks LIMIT 0")
            .is_ok();
        if !has_album_artist_mbid {
            conn.execute_batch("ALTER TABLE tracks ADD COLUMN album_artist_mbid TEXT")
                .map_err(|e| format!("Failed to add album_artist_mbid column: {e}"))?;
            log::info!("MusicDb: migrated — added album_artist_mbid column");
        }

        // Ensure covers cache directory exists
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

    pub fn get_tracks(&self, folder: &str, limit: i64, offset: i64) -> Result<Vec<TrackRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT file_path, title, artist, album, duration, mbid, rowid, cover_path, cover_cid, artist_mbid, album_artist_mbid
                 FROM tracks WHERE folder_path = ?1 ORDER BY title COLLATE NOCASE
                 LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| format!("Failed to prepare: {e}"))?;

        let rows = stmt
            .query_map(params![folder, limit, offset], |row| {
                let rowid: i64 = row.get(6)?;
                let cover_cid: Option<String> = row.get(8)?;
                Ok(TrackRow {
                    id: format!("local-{}", rowid),
                    file_path: row.get(0)?,
                    title: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    duration: row.get(4)?,
                    mbid: row.get(5)?,
                    artist_mbid: row.get(9)?,
                    album_artist_mbid: row.get(10)?,
                    album_cover: row.get(7)?,
                    cover_path: row.get(7)?,
                    cover_cid: cover_cid.filter(|s| !s.is_empty()),
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

    pub fn scan_folder(&self, folder: &str, app: Option<&AppHandle>) -> Result<i64, String> {
        // 1. Collect all audio file paths, emitting discovery progress as we go
        let mut audio_files: Vec<std::path::PathBuf> = Vec::new();
        for entry in WalkDir::new(folder).follow_links(true).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() && is_audio_file(path) {
                audio_files.push(path.to_path_buf());
                // Emit discovery count every 200 files so UI shows immediate feedback
                if audio_files.len() % 200 == 0 {
                    if let Some(app) = app {
                        let _ = app.emit("music://scan-progress", ScanProgress { done: 0, total: audio_files.len() });
                    }
                }
            }
        }

        let total = audio_files.len();
        // Emit with final discovery total before processing starts
        if let Some(app) = app {
            let _ = app.emit("music://scan-progress", ScanProgress { done: 0, total });
        }
        log::info!("music_db: scanning {} — found {} audio files", folder, total);
        let mut seen_paths: HashSet<String> = HashSet::with_capacity(total);
        let mut cache_hits: usize = 0;
        let mut extracted: usize = 0;

        // 2. Process each file
        let needs_mbid_backfill = self
            .get_setting("mbid_columns_v1")
            .as_deref()
            != Some("1");
        let needs_cover_backfill = self
            .get_setting("cover_path_backfill_v1")
            .as_deref()
            != Some("1");
        for (i, path) in audio_files.iter().enumerate() {
            let path_str = path.to_string_lossy().to_string();
            seen_paths.insert(path_str.clone());

            // Get file metadata for cache check
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

            // Check if cached with same size+mtime
            let cached: Option<(i64, i64, Option<String>, Option<String>, Option<String>, Option<String>)> = self
                .conn
                .query_row(
                    "SELECT file_size, file_mtime, cover_path, cover_cid, artist_mbid, album_artist_mbid FROM tracks WHERE file_path = ?1",
                    params![&path_str],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
                )
                .ok();

            let mut existing_cover_path: Option<String> = None;
            let mut existing_cover_cid: Option<String> = None;
            if let Some((sz, mt, cover_path_cached, cover_cid_cached, artist_mbid_cached, album_artist_mbid_cached)) = cached {
                existing_cover_path = cover_path_cached;
                existing_cover_cid = cover_cid_cached;
                if sz == file_size && mt == file_mtime {
                    let cover_file_missing = existing_cover_path
                        .as_deref()
                        .filter(|p| !p.is_empty())
                        .map(|p| !Path::new(p).exists())
                        .unwrap_or(false);
                    let cover_path_missing = existing_cover_path
                        .as_deref()
                        .map(|p| p.is_empty())
                        .unwrap_or(true);
                    let mbid_missing = artist_mbid_cached
                        .as_deref()
                        .map(|s| s.is_empty())
                        .unwrap_or(true)
                        && album_artist_mbid_cached
                            .as_deref()
                            .map(|s| s.is_empty())
                            .unwrap_or(true);
                    let force_backfill =
                        (needs_mbid_backfill && mbid_missing) ||
                        (needs_cover_backfill && cover_path_missing);
                    if !cover_file_missing && !force_backfill {
                        cache_hits += 1;
                        if i % 100 == 0 {
                            if let Some(app) = app {
                                let _ = app.emit("music://scan-progress", ScanProgress { done: i + 1, total });
                            }
                        }
                        continue;
                    }
                }
            }

            // Extract metadata with lofty
            extracted += 1;
            let (title, artist, album, duration, mbid, artist_mbid, album_artist_mbid, cover_path) = extract_metadata(path, &path_str, &self.covers_dir);

            // Preserve cover_cid only if cover_path is unchanged
            let cover_cid = match (
                existing_cover_cid.as_deref(),
                existing_cover_path.as_deref(),
                cover_path.as_deref(),
            ) {
                (Some(cid), Some(old_path), Some(new_path)) if !cid.is_empty() && old_path == new_path => cid,
                _ => "",
            };

            self.conn
                .execute(
                    "INSERT OR REPLACE INTO tracks (file_path, title, artist, album, duration_ms, duration, mbid, file_size, file_mtime, folder_path, cover_path, cover_cid, artist_mbid, album_artist_mbid)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                        cover_cid,
                        &artist_mbid,
                        &album_artist_mbid,
                    ],
                )
                .ok();

            // Emit progress every 50 files
            if i % 50 == 0 {
                if let Some(app) = app {
                    let _ = app.emit("music://scan-progress", ScanProgress { done: i + 1, total });
                }
            }
        }

        log::info!("music_db: scan done — {} cached, {} extracted, {} total", cache_hits, extracted, total);

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

        // Emit final progress
        if let Some(app) = app {
            let _ = app.emit("music://scan-progress", ScanProgress { done: total, total });
        }

        if needs_mbid_backfill {
            let _ = self.set_setting("mbid_columns_v1", "1");
        }
        if needs_cover_backfill {
            let _ = self.set_setting("cover_path_backfill_v1", "1");
        }

        // 4. Return count
        self.get_track_count(folder)
    }

    pub fn set_cover_cid_for_file(&self, file_path: &str, cover_cid: &str) -> Result<(), String> {
        if cover_cid.is_empty() {
            return Ok(());
        }

        let cover_path: Option<String> = self
            .conn
            .query_row(
                "SELECT cover_path FROM tracks WHERE file_path = ?1",
                params![file_path],
                |row| row.get(0),
            )
            .ok();

        if let Some(cover_path) = cover_path {
            self.conn
                .execute(
                    "UPDATE tracks SET cover_cid = ?1 WHERE cover_path = ?2",
                    params![cover_cid, cover_path],
                )
                .map_err(|e| format!("Failed to update cover_cid by cover_path: {e}"))?;
        } else {
            self.conn
                .execute(
                    "UPDATE tracks SET cover_cid = ?1 WHERE file_path = ?2",
                    params![cover_cid, file_path],
                )
                .map_err(|e| format!("Failed to update cover_cid by file_path: {e}"))?;
        }

        Ok(())
    }
}

// =============================================================================
// Metadata extraction via lofty
// =============================================================================

/// Returned metadata tuple: (title, artist, album, duration_ms, mbid, artist_mbid, album_artist_mbid, cover_path)
fn extract_metadata(path: &Path, path_str: &str, covers_dir: &Path) -> (String, String, String, Option<u64>, Option<String>, Option<String>, Option<String>, Option<String>) {
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
            let artist_mbid = tag
                .and_then(|t| t.get_string(&lofty::prelude::ItemKey::MusicBrainzArtistId))
                .map(|s| {
                    // For collaborations, tags may contain multiple MBIDs separated by
                    // '/' or ';'. We store only the first (primary) artist.
                    s.split(&['/', ';'][..]).next().unwrap_or(s).trim().to_string()
                })
                .filter(|s| !s.is_empty());
            let album_artist_mbid = tag
                .and_then(|t| t.get_string(&lofty::prelude::ItemKey::MusicBrainzReleaseArtistId))
                .map(|s| s.split(&['/', ';'][..]).next().unwrap_or(s).trim().to_string())
                .filter(|s| !s.is_empty());

            // Extract cover art — prefer CoverFront, then largest by byte size, then first
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
                    _ => "jpg", // default to jpg for Jpeg and unknown
                };
                // Use content hash as filename for dedup across tracks sharing album art
                let content_hash = content_sha256(pic.data());
                let cover_filename = format!("{}.{}", content_hash, ext);
                let cover_file = covers_dir.join(&cover_filename);

                // Only write if not already cached
                if !cover_file.exists() {
                    if let Err(e) = std::fs::write(&cover_file, pic.data()) {
                        log::warn!("Failed to write cover art for {}: {}", path_str, e);
                        return None;
                    }
                }
                Some(cover_file.to_string_lossy().to_string())
            });

            (title, artist, album, duration_ms, mbid, artist_mbid, album_artist_mbid, cover_path)
        }
        Err(e) => {
            log::warn!("lofty failed for {}: {}", path_str, e);
            (fb_title, fb_artist, String::new(), None, None, None, None, None)
        }
    }
}

fn content_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

// =============================================================================
// Tauri state + commands
// =============================================================================

#[derive(Clone)]
pub struct MusicDbState(pub Arc<std::sync::OnceLock<Mutex<MusicDb>>>);

impl MusicDbState {
    pub fn empty() -> Self {
        Self(Arc::new(std::sync::OnceLock::new()))
    }

    pub fn init(&self, db: MusicDb) {
        let _ = self.0.set(Mutex::new(db));
    }

    fn get(&self) -> Result<&Mutex<MusicDb>, String> {
        self.0.get().ok_or_else(|| "MusicDb not yet initialized".to_string())
    }
}

/// Scan folder, return total track count. Frontend should then page via music_get_tracks.
#[tauri::command]
pub async fn music_scan_folder(
    app: AppHandle,
    state: State<'_, MusicDbState>,
    folder: String,
) -> Result<i64, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        db.scan_folder(&folder, Some(&app))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn music_get_tracks(
    state: State<'_, MusicDbState>,
    folder: String,
    limit: i64,
    offset: i64,
) -> Result<Vec<TrackRow>, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        db.get_tracks(&folder, limit, offset)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn music_get_track_count(
    state: State<'_, MusicDbState>,
    folder: String,
) -> Result<i64, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        db.get_track_count(&folder)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn music_get_folder(
    state: State<'_, MusicDbState>,
) -> Result<Option<String>, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        Ok(db.get_setting("folder_path"))
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn music_set_folder(
    state: State<'_, MusicDbState>,
    folder: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        db.set_setting("folder_path", &folder)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[tauri::command]
pub async fn music_set_cover_cid(
    state: State<'_, MusicDbState>,
    file_path: String,
    cover_cid: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let db = state.get()?.lock().map_err(|e| format!("lock: {e}"))?;
        db.set_cover_cid_for_file(&file_path, &cover_cid)
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}
