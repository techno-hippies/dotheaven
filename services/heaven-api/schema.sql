-- Heaven V0 API Schema
-- D1 database for candidates, likes, and matches

-- Claimed users (wallet addresses)
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER,
  directory_tier TEXT DEFAULT 'claimed' CHECK(directory_tier IN ('handoff', 'claimed', 'verified'))
);

-- Seeded scraped profiles (shadow = no address yet)
CREATE TABLE IF NOT EXISTS shadow_profiles (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                  -- 'dateme', 'acx', 'cuties'
  source_url TEXT,
  display_name TEXT,
  bio TEXT,
  age_bucket INTEGER,                    -- 1=18-24, 2=25-29, 3=30-34, 4=35-39, 5=40-49, 6=50+
  gender_identity INTEGER,               -- 1=man, 2=woman, 3=trans_man, 4=trans_woman, 5=non_binary
  location TEXT,
  photos_json TEXT,                      -- JSON array of photo URLs/CIDs
  anime_cid TEXT,                        -- IPFS CID of generated anime avatar
  survey_cid TEXT,                       -- IPFS CID of survey responses
  featured_rank INTEGER DEFAULT 0,       -- lower = more featured (0 = not featured)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Claim linkage (null until claimed)
  claimed_address TEXT REFERENCES users(address),
  claimed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_shadow_featured ON shadow_profiles(featured_rank) WHERE featured_rank > 0 AND claimed_address IS NULL;
CREATE INDEX IF NOT EXISTS idx_shadow_claimed ON shadow_profiles(claimed_address) WHERE claimed_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shadow_source ON shadow_profiles(source);

-- Claim tokens for profile handoff
CREATE TABLE IF NOT EXISTS claim_tokens (
  id TEXT PRIMARY KEY,                   -- attemptId (cryptographically random, >= 128 bits)
  shadow_profile_id TEXT NOT NULL REFERENCES shadow_profiles(id),
  token_hash TEXT,                       -- sha256(token) for link redemption (/c/<token>)
  human_code_hash TEXT,                  -- hmac(secret, code) for manual entry (NEO-XXXXXX)
  method TEXT NOT NULL CHECK(method IN ('dm', 'bio_edit', 'reply_nonce')),
  pre_html_hash TEXT,                    -- for bio_edit: sha256 of profile HTML at creation
  pre_scraped_at INTEGER,                -- for bio_edit: when we pre-scraped
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,           -- 7 days from issued_at
  verify_window_started_at INTEGER,      -- for bio_edit: 15 min window
  used INTEGER DEFAULT 0,
  used_at INTEGER,
  used_by_address TEXT REFERENCES users(address)
);

CREATE INDEX IF NOT EXISTS idx_claim_shadow ON claim_tokens(shadow_profile_id);
CREATE INDEX IF NOT EXISTS idx_claim_token_hash ON claim_tokens(token_hash) WHERE used = 0;
CREATE INDEX IF NOT EXISTS idx_claim_code_hash ON claim_tokens(human_code_hash) WHERE used = 0;

-- Likes (can target user address or shadow profile)
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liker_address TEXT NOT NULL,           -- address of person who liked
  target_type TEXT NOT NULL CHECK(target_type IN ('user', 'shadow')),
  target_id TEXT NOT NULL,               -- address if 'user', shadow_profiles.id if 'shadow'
  created_at INTEGER NOT NULL,
  UNIQUE(liker_address, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_liker ON likes(liker_address);
CREATE INDEX IF NOT EXISTS idx_likes_target ON likes(target_type, target_id);

-- Matches (only between claimed users with wallet addresses)
-- user1 < user2 (lexicographically sorted) to ensure uniqueness
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1 TEXT NOT NULL,                   -- lower address
  user2 TEXT NOT NULL,                   -- higher address
  created_at INTEGER NOT NULL,
  UNIQUE(user1, user2)
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2);

-- Rate limiting for claim attempts (abuse prevention)
CREATE TABLE IF NOT EXISTS claim_rate_limits (
  id TEXT PRIMARY KEY,
  shadow_profile_id TEXT NOT NULL REFERENCES shadow_profiles(id),
  ip_hash TEXT NOT NULL,                 -- sha256(ip) - no raw IPs
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at INTEGER,
  locked_until INTEGER,                  -- null = not locked
  created_at INTEGER NOT NULL,
  UNIQUE(shadow_profile_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_locked ON claim_rate_limits(locked_until) WHERE locked_until IS NOT NULL;

-- ============================================================================
-- Heaven Names Registry (.heaven off-chain SLD registry)
-- ============================================================================

-- Core registry: label -> owner mapping
CREATE TABLE IF NOT EXISTS heaven_names (
  label TEXT PRIMARY KEY,                -- normalized lowercase (e.g., "alex")
  label_display TEXT,                    -- original case for UI (e.g., "Alex")
  owner_address TEXT NOT NULL,             -- owner's address (normalized lowercase 0x...)
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'expired')),
  registered_at INTEGER NOT NULL,        -- Unix timestamp
  expires_at INTEGER NOT NULL,           -- Unix timestamp (registered_at + 1 year)
  grace_ends_at INTEGER NOT NULL,        -- expires_at + 30 days
  profile_cid TEXT,                      -- Optional IPFS CID for extended profile
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Reverse lookup: address -> name (for onboarding check)
CREATE INDEX IF NOT EXISTS idx_heaven_names_owner_address ON heaven_names(owner_address);
-- For expiry cron jobs
CREATE INDEX IF NOT EXISTS idx_heaven_names_expires ON heaven_names(expires_at);
-- For status queries
CREATE INDEX IF NOT EXISTS idx_heaven_names_status ON heaven_names(status);

-- Policy-reserved names (premium, profanity, trademark)
-- System-reserved names are hardcoded in the Worker
CREATE TABLE IF NOT EXISTS heaven_reserved (
  label TEXT PRIMARY KEY,                -- normalized lowercase
  reason TEXT,                           -- 'premium', 'profanity', 'trademark', 'brand'
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Anti-replay nonces for registration signatures
CREATE TABLE IF NOT EXISTS heaven_nonces (
  nonce TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,             -- Who generated this nonce
  used_at INTEGER,                       -- NULL if unused, timestamp if used
  expires_at INTEGER NOT NULL,           -- Nonces expire after 5 minutes
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_heaven_nonces_expires ON heaven_nonces(expires_at);
CREATE INDEX IF NOT EXISTS idx_heaven_nonces_owner_address ON heaven_nonces(owner_address);

-- ============================================================================
-- Scrobble Batches (music listening history pinned to IPFS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scrobble_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,              -- address of the user
  cid TEXT NOT NULL,                   -- IPFS CID of the batch JSON
  track_count INTEGER NOT NULL,        -- Number of tracks in batch
  start_ts INTEGER NOT NULL,           -- Earliest playedAt timestamp
  end_ts INTEGER NOT NULL,             -- Latest playedAt timestamp
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_scrobble_batches_user ON scrobble_batches(user_address);
CREATE INDEX IF NOT EXISTS idx_scrobble_batches_created ON scrobble_batches(created_at);

-- ============================================================================
-- Music Publish Pipeline (staged upload -> policy checks -> explicit anchor)
-- ============================================================================

CREATE TABLE IF NOT EXISTS music_publish_jobs (
  job_id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL, -- caller wallet/address (lowercase 0x...)

  status TEXT NOT NULL
    CHECK(status IN (
      'staged',
      'checking',
      'policy_passed',
      'manual_review',
      'rejected',
      'anchoring',
      'anchored',
      'registering',
      'registered',
      'failed'
    )),
  publish_type TEXT
    CHECK(publish_type IN ('original', 'derivative', 'cover')),

  idempotency_key TEXT, -- optional client key to dedupe retries

  -- Upload metadata
  file_name TEXT,
  content_type TEXT,
  file_size INTEGER,
  audio_sha256 TEXT,
  fingerprint TEXT,
  duration_s INTEGER,

  -- Stage-1 LS3 upload (not anchored yet)
  staged_dataitem_id TEXT,
  staged_gateway_url TEXT,
  staged_payload_json TEXT,

  -- Policy result
  policy_decision TEXT NOT NULL DEFAULT 'pending'
    CHECK(policy_decision IN ('pending', 'pass', 'reject', 'manual_review')),
  policy_reason_code TEXT,
  policy_reason TEXT,

  -- Derivative info (JSON arrays for flexibility)
  parent_ip_ids_json TEXT,
  license_terms_ids_json TEXT,

  -- Anchor result
  anchored_dataitem_id TEXT,
  arweave_ref TEXT, -- ar://<id>
  arweave_url TEXT,
  arweave_available INTEGER NOT NULL DEFAULT 0,
  anchor_payload_json TEXT,

  -- Registration placeholders
  story_tx_hash TEXT,
  story_ip_id TEXT,
  story_token_id TEXT,
  story_license_terms_ids_json TEXT,
  story_block_number TEXT,
  megaeth_tx_hash TEXT,

  -- Failure/debug
  error_code TEXT,
  error_message TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_music_publish_jobs_user_created
  ON music_publish_jobs(user_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_music_publish_jobs_status_updated
  ON music_publish_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_music_publish_jobs_sha256
  ON music_publish_jobs(audio_sha256);

CREATE UNIQUE INDEX IF NOT EXISTS idx_music_publish_jobs_user_idempotency
  ON music_publish_jobs(user_address, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS music_upload_bans (
  ban_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  self_nullifier TEXT, -- optional when available from Self
  reason_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  expires_at INTEGER, -- null = permanent
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_music_upload_bans_user_active
  ON music_upload_bans(user_address, active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_music_upload_bans_nullifier_active
  ON music_upload_bans(self_nullifier, active)
  WHERE self_nullifier IS NOT NULL;

-- ============================================================================
-- Study Set Generation Locks (ephemeral, non-canonical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS study_set_generation_locks (
  lock_key TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_set_generation_locks_expires
  ON study_set_generation_locks(expires_at);
