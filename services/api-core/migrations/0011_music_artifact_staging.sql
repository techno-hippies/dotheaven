-- Persist staged supporting artifacts for music publish jobs.
-- Cover image + lyrics are staged to Load first (not anchored) so moderation
-- can review them before any permanent Arweave write.

ALTER TABLE music_publish_jobs ADD COLUMN cover_staged_dataitem_id TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN cover_staged_gateway_url TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN cover_content_type TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN cover_file_size INTEGER;
ALTER TABLE music_publish_jobs ADD COLUMN cover_staged_payload_json TEXT;

ALTER TABLE music_publish_jobs ADD COLUMN lyrics_staged_dataitem_id TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN lyrics_staged_gateway_url TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN lyrics_sha256 TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN lyrics_bytes INTEGER;
ALTER TABLE music_publish_jobs ADD COLUMN lyrics_staged_payload_json TEXT;

CREATE INDEX IF NOT EXISTS idx_music_publish_jobs_cover_staged
  ON music_publish_jobs(cover_staged_dataitem_id)
  WHERE cover_staged_dataitem_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_music_publish_jobs_lyrics_staged
  ON music_publish_jobs(lyrics_staged_dataitem_id)
  WHERE lyrics_staged_dataitem_id IS NOT NULL;
