//! Local music library database — ported from legacy desktop music_db.rs.
//! Uses rusqlite for storage, lofty for metadata extraction, walkdir for scanning.
//! No desktop IPC needed since we're already in Rust.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection};
use serde::Serialize;
use walkdir::WalkDir;

mod metadata;
use metadata::{extract_metadata, format_duration_ms, is_audio_file};
mod query_ops;
mod scan_ops;

// =============================================================================
// Types
// =============================================================================

/// Storage status of a track on the network.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageStatus {
    /// Not uploaded — only exists locally.
    #[default]
    Local,
    /// Uploaded to Load S3 (temporary cloud storage).
    Uploaded,
    /// Anchored to Arweave (permanent).
    Permanent,
}

#[derive(Debug, Clone)]
pub struct TrackRow {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: String,
    pub file_path: String,
    pub mbid: Option<String>,
    pub ip_id: Option<String>,
    pub cover_path: Option<String>,
    pub storage_status: StorageStatus,
}

#[derive(Debug, Clone)]
pub struct LyricsCacheRow {
    pub cache_key: String,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration_sec: Option<i64>,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    pub lrclib_id: Option<i64>,
    pub source: String,
    pub fetched_at_epoch_sec: i64,
}

#[derive(Debug, Clone)]
pub struct TrackMediaStateRow {
    pub track_id: String,
    pub cover_local: Option<String>,
    pub cover_ref: Option<String>,
    pub cover_status: String,
    pub cover_checked: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct TrackLyricsStateRow {
    pub track_id: String,
    pub lyrics_ref: Option<String>,
    pub lyrics_status: String,
    pub lyrics_checked: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub done: usize,
    pub total: usize,
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
                ip_id       TEXT,
                file_size   INTEGER NOT NULL,
                file_mtime  INTEGER NOT NULL,
                folder_path TEXT NOT NULL,
                cover_path  TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_folder ON tracks(folder_path);
            CREATE INDEX IF NOT EXISTS idx_tracks_folder_title
                ON tracks(folder_path, title COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_tracks_folder_artist
                ON tracks(folder_path, artist COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_tracks_folder_album
                ON tracks(folder_path, album COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lyrics_cache (
                cache_key            TEXT PRIMARY KEY,
                track_name           TEXT NOT NULL,
                artist_name          TEXT NOT NULL,
                album_name           TEXT NOT NULL DEFAULT '',
                duration_sec         INTEGER,
                plain_lyrics         TEXT,
                synced_lyrics        TEXT,
                lrclib_id            INTEGER,
                source               TEXT NOT NULL,
                fetched_at_epoch_sec INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS track_media_state (
                track_id      TEXT PRIMARY KEY,
                cover_local   TEXT,
                cover_ref     TEXT,
                cover_status  TEXT NOT NULL DEFAULT 'none',
                cover_checked INTEGER,
                created_at    INTEGER NOT NULL,
                updated_at    INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS track_lyrics_state (
                track_id      TEXT PRIMARY KEY,
                lyrics_ref    TEXT,
                lyrics_status TEXT NOT NULL DEFAULT 'none',
                lyrics_checked INTEGER,
                created_at    INTEGER NOT NULL,
                updated_at    INTEGER NOT NULL
            );",
        )
        .map_err(|e| format!("Failed to create tables: {e}"))?;

        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_lyrics_cache_signature
                ON lyrics_cache(track_name, artist_name, album_name, duration_sec);
             CREATE INDEX IF NOT EXISTS idx_track_media_state_status
                ON track_media_state(cover_status);
             CREATE INDEX IF NOT EXISTS idx_track_lyrics_state_status
                ON track_lyrics_state(lyrics_status);",
        )
        .map_err(|e| format!("Failed creating lyrics cache indexes: {e}"))?;

        // Backfill schema for existing local DBs created before ip_id support.
        if let Err(e) = conn.execute("ALTER TABLE tracks ADD COLUMN ip_id TEXT", []) {
            let msg = e.to_string();
            if !msg.contains("duplicate column name") {
                return Err(format!("Failed to migrate tracks.ip_id: {e}"));
            }
        }

        let covers_dir = app_data_dir.join("covers");
        std::fs::create_dir_all(&covers_dir).ok();

        log::info!("MusicDb opened at {}", db_path.display());
        Ok(Self { conn, covers_dir })
    }
}
