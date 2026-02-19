-- Music publish pipeline tables
-- Staged upload -> preflight checks -> explicit Arweave anchor -> on-chain registration

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

