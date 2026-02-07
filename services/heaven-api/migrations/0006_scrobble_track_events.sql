-- Per-track scrobble events for cross-user aggregation
-- Enables "top tracks this week", "who else listened to X", charts, etc.
-- without re-parsing IPFS blobs

CREATE TABLE IF NOT EXISTS scrobble_track_events (
  id TEXT PRIMARY KEY,

  user_pkp TEXT NOT NULL,
  played_at INTEGER NOT NULL,
  source TEXT,

  -- Deterministic key: SHA-256(title_norm|artist_norm|duration_bucket)
  track_key TEXT NOT NULL,

  -- Resolution results (populated when Android sends ISRC/MBID/fingerprint)
  mbid TEXT,
  isrc TEXT,
  acoustid TEXT,
  confidence REAL NOT NULL DEFAULT 0.0,

  -- Normalized metadata
  title_norm TEXT NOT NULL,
  artist_norm TEXT NOT NULL,
  album_norm TEXT NOT NULL,
  duration_s INTEGER,

  -- Back-reference to the IPFS batch
  batch_cid TEXT NOT NULL
);

-- Fast charts: GROUP BY track_key ORDER BY count
CREATE INDEX IF NOT EXISTS idx_ste_track_key_time
  ON scrobble_track_events(track_key, played_at);

-- Per-user history
CREATE INDEX IF NOT EXISTS idx_ste_user_time
  ON scrobble_track_events(user_pkp, played_at);

-- Cross-user by canonical recording (when MBIDs are available)
CREATE INDEX IF NOT EXISTS idx_ste_mbid_time
  ON scrobble_track_events(mbid, played_at);

-- Batch lookup (find all tracks in a batch)
CREATE INDEX IF NOT EXISTS idx_ste_batch_cid
  ON scrobble_track_events(batch_cid);
