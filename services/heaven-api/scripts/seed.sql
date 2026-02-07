-- Auto-generated seed data
-- Run with: wrangler d1 execute heaven-api --local --file=./scripts/seed.sql

-- Clear existing seed data (keeps any real data)
-- Delete in correct order due to foreign keys
DELETE FROM likes WHERE target_type = 'shadow' AND target_id LIKE 'shadow-%';
DELETE FROM claim_tokens WHERE shadow_profile_id LIKE 'shadow-%';
DELETE FROM shadow_profiles WHERE id LIKE 'shadow-%';

-- Insert seed profiles
INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('shadow-alex-sf', 'dateme', 'https://dateme.directory/alex', 'Alex', 'Software engineer who loves hiking and craft coffee. Looking for someone to explore the city with.', 2, 1, 'San Francisco', 1, 1768888100505, 1768888100505);
INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('shadow-jordan-bk', 'dateme', 'https://dateme.directory/jordan', 'Jordan', 'Artist and yoga instructor. I believe in good vibes and great conversations.', 3, 5, 'Brooklyn', 2, 1768888100505, 1768888100505);
INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('shadow-sam-atx', 'dateme', 'https://dateme.directory/sam', 'Sam', 'Product designer by day, amateur chef by night. Always down for a food adventure.', 2, 2, 'Austin', 3, 1768888100505, 1768888100505);
INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('shadow-riley-la', 'dateme', 'https://dateme.directory/riley', 'Riley', NULL, 4, 1, 'Los Angeles', 4, 1768888100505, 1768888100505);
INSERT INTO shadow_profiles (id, source, source_url, display_name, bio, age_bucket, gender_identity, location, featured_rank, created_at, updated_at)
VALUES ('shadow-morgan-sea', 'dateme', 'https://dateme.directory/morgan', 'Morgan', 'Musician and dog parent. Looking for my duet partner.', 1, 4, 'Seattle', 5, 1768888100505, 1768888100505);

-- Insert test claim tokens
INSERT INTO claim_tokens (id, shadow_profile_id, token_hash, human_code_hash, method, issued_at, expires_at)
VALUES ('claim-shadow-alex-sf', 'shadow-alex-sf', 'e6ea36509c60a528f2971a0ae8fb2e41e3c9721821f1374acaff44d68e85259f', '6eabfaaaa17e2029ccc38a8bff0d5bc283c09ccd44e975f7f28d3a27261cefa4', 'bio_edit', 1768888100505, 1769492900505);
INSERT INTO claim_tokens (id, shadow_profile_id, token_hash, human_code_hash, method, issued_at, expires_at)
VALUES ('claim-shadow-jordan-bk', 'shadow-jordan-bk', 'a63be2f76c7e1689da7eeec88248aeac4a22dbb95c0ac2e08f896bf19defd250', 'df13d58462ab3e5007e46c7f7d3139289d912598c7a8c087063c2be9754534f1', 'bio_edit', 1768888100505, 1769492900505);
INSERT INTO claim_tokens (id, shadow_profile_id, token_hash, human_code_hash, method, issued_at, expires_at)
VALUES ('claim-shadow-sam-atx', 'shadow-sam-atx', 'c705de491dcb53c849e84aa5634de3748cc3f96f7126d125eef2aa054399d24d', 'a6ebb1e7d23b10d304b426c1870ad1e8b720e31257b68d970f4b479ec2cf062f', 'bio_edit', 1768888100505, 1769492900505);

-- Insert test likes (to show "Someone likes you!")
INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x1234567890123456789012345678901234567890', 'shadow', 'shadow-alex-sf', 1768888100505);
INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x2345678901234567890123456789012345678901', 'shadow', 'shadow-alex-sf', 1768888099505);
INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x3456789012345678901234567890123456789012', 'shadow', 'shadow-alex-sf', 1768888098505);
INSERT OR IGNORE INTO likes (liker_address, target_type, target_id, created_at)
VALUES ('0x1234567890123456789012345678901234567890', 'shadow', 'shadow-jordan-bk', 1768888100505);