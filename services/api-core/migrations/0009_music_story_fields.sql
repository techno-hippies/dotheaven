-- Persist Story registration details on music publish jobs

ALTER TABLE music_publish_jobs ADD COLUMN story_ip_id TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN story_token_id TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN story_license_terms_ids_json TEXT;
ALTER TABLE music_publish_jobs ADD COLUMN story_block_number TEXT;
