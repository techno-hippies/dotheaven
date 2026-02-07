-- Photo Pipeline Schema
-- Migration: 0001_photos
-- Description: Tables for photo upload, anime generation, and match reveal

-- ============================================================================
-- user_photos: Original photos (sanitized, EXIF-stripped)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_photos (
  photo_id TEXT PRIMARY KEY,             -- UUID
  user_id TEXT NOT NULL,                 -- PKP address or user identifier
  slot INTEGER NOT NULL,                 -- 1..4 (position in profile)
  orig_key TEXT NOT NULL,                -- R2_ORIG key (e.g., "orig/{user_id}/{photo_id}.jpg")
  created_at INTEGER NOT NULL            -- Unix timestamp
);

-- Each user can have only one photo per slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_photos_user_slot
  ON user_photos(user_id, slot);

-- Lookup all photos for a user
CREATE INDEX IF NOT EXISTS idx_user_photos_user
  ON user_photos(user_id);


-- ============================================================================
-- anime_assets: Generated anime grid + tiles per user
-- ============================================================================

CREATE TABLE IF NOT EXISTS anime_assets (
  user_id TEXT PRIMARY KEY,              -- One anime set per user
  grid_key TEXT NOT NULL,                -- R2_ANIME key for 2048x2048 grid
  tile1_key TEXT NOT NULL,               -- R2_ANIME key for slot 1 (500x500)
  tile2_key TEXT NOT NULL,               -- R2_ANIME key for slot 2 (500x500)
  tile3_key TEXT NOT NULL,               -- R2_ANIME key for slot 3 (500x500)
  tile4_key TEXT NOT NULL,               -- R2_ANIME key for slot 4 (500x500)
  fal_request_id TEXT,                   -- fal.ai request ID (for debugging)
  created_at INTEGER NOT NULL,           -- Unix timestamp
  updated_at INTEGER NOT NULL            -- Unix timestamp (for regeneration)
);


-- ============================================================================
-- photo_access: Per-viewer reveal permissions (created on match)
-- ============================================================================

CREATE TABLE IF NOT EXISTS photo_access (
  access_id TEXT PRIMARY KEY,            -- UUID
  match_id TEXT NOT NULL,                -- Reference to match (matches.id or external)
  photo_id TEXT NOT NULL,                -- Reference to user_photos.photo_id
  owner_user_id TEXT NOT NULL,           -- Owner of the photo
  viewer_user_id TEXT NOT NULL,          -- Who can view the revealed photo
  viewer_wallet_full TEXT NOT NULL,      -- Full wallet address for attribution
  viewer_wallet_short TEXT NOT NULL,     -- Short form (e.g., "0x1234...abcd")
  fingerprint_code TEXT NOT NULL,        -- HMAC(secret, match_id|photo_id|wallet) truncated
  wm_tile_key TEXT,                      -- R2_WM key for per-viewer watermark PNG
  variant_key TEXT,                      -- R2_REVEAL key for cached watermarked output
  created_at INTEGER NOT NULL            -- Unix timestamp
);

-- Fast lookup: "can this viewer see this photo?"
CREATE INDEX IF NOT EXISTS idx_photo_access_viewer_photo
  ON photo_access(viewer_user_id, photo_id);

-- Lookup all access records for a photo (for owner to see who viewed)
CREATE INDEX IF NOT EXISTS idx_photo_access_photo
  ON photo_access(photo_id);

-- Lookup by match (for batch operations)
CREATE INDEX IF NOT EXISTS idx_photo_access_match
  ON photo_access(match_id);


-- ============================================================================
-- photo_source_tokens: Ephemeral signed URLs for fal.ai access
-- ============================================================================

CREATE TABLE IF NOT EXISTS photo_source_tokens (
  token_hash TEXT PRIMARY KEY,           -- sha256(token)
  photo_id TEXT NOT NULL,                -- Which photo this grants access to
  expires_at INTEGER NOT NULL,           -- Unix timestamp (short-lived, e.g., 5 min)
  created_at INTEGER NOT NULL            -- Unix timestamp
);

-- Clean up expired tokens periodically
CREATE INDEX IF NOT EXISTS idx_source_tokens_expires
  ON photo_source_tokens(expires_at);


-- ============================================================================
-- photo_jobs: Async job tracking (if pipeline needs polling)
-- ============================================================================

CREATE TABLE IF NOT EXISTS photo_jobs (
  job_id TEXT PRIMARY KEY,               -- UUID
  user_id TEXT NOT NULL,                 -- Who initiated
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  step TEXT,                             -- Current step: 'upload', 'fal', 'split', 'done'
  error_message TEXT,                    -- If failed, why
  photo_ids_json TEXT,                   -- JSON array of photo_ids created
  anime_tiles_json TEXT,                 -- JSON array of tile URLs (when done)
  fal_request_id TEXT,                   -- fal.ai request ID for status check
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Lookup jobs by user
CREATE INDEX IF NOT EXISTS idx_photo_jobs_user
  ON photo_jobs(user_id);

-- Find pending/processing jobs
CREATE INDEX IF NOT EXISTS idx_photo_jobs_status
  ON photo_jobs(status) WHERE status IN ('pending', 'processing');
