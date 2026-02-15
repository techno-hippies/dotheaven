-- Session Voice v3: Song Registry (Story IP mapping + Base payout attestations)
-- D1 schema migration

CREATE TABLE IF NOT EXISTS song_registry (
  song_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  title_norm TEXT NOT NULL,
  artist_norm TEXT NOT NULL,
  story_ip_id TEXT NOT NULL,
  controller_wallet TEXT NOT NULL,
  payout_chain_id INTEGER NOT NULL,
  payout_address TEXT NOT NULL,
  default_upstream_bps INTEGER NOT NULL DEFAULT 0,
  payout_attestation_sig TEXT NOT NULL,
  license_preset_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_song_registry_story_ip_id
  ON song_registry(story_ip_id);

CREATE INDEX IF NOT EXISTS idx_song_registry_title_norm
  ON song_registry(title_norm);

CREATE INDEX IF NOT EXISTS idx_song_registry_artist_norm
  ON song_registry(artist_norm);

CREATE INDEX IF NOT EXISTS idx_song_registry_updated_at
  ON song_registry(updated_at DESC);

