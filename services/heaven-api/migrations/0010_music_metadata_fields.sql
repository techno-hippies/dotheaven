-- Persist anchored metadata refs/hashes for music publish jobs.
-- Enables idempotent metadata anchoring and recovery if client retries/crashes.

ALTER TABLE music_publish_jobs ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'none'
  CHECK(metadata_status IN ('none', 'anchoring', 'anchored', 'failed'));
ALTER TABLE music_publish_jobs ADD COLUMN metadata_error TEXT;

ALTER TABLE music_publish_jobs ADD COLUMN ip_metadata_uri TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN ip_metadata_hash TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN ip_metadata_dataitem_id TEXT;

ALTER TABLE music_publish_jobs ADD COLUMN nft_metadata_uri TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN nft_metadata_hash TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN nft_metadata_dataitem_id TEXT;
