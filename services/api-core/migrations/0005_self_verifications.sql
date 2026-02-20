-- Self.xyz verification sessions and results
-- Stores verification state for passport-based identity verification

CREATE TABLE IF NOT EXISTS self_verifications (
  session_id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,                  -- address requesting verification
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'verified', 'failed', 'expired')),

  -- Verified identity data (populated on success)
  date_of_birth TEXT,                      -- "1995-03-15" from passport
  age INTEGER,                             -- Calculated from DOB at verification time
  nationality TEXT,                        -- ISO-3 country code: "USA", "GBR", "IND"

  -- Self.xyz proof metadata
  attestation_id INTEGER,                  -- Document type identifier from Self
  proof_hash TEXT,                         -- sha256 of proof JSON (for audit)

  -- Timestamps
  verified_at INTEGER,                     -- When verification completed
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,             -- Session expires after 10 minutes

  -- Failure info
  failure_reason TEXT                      -- If status = 'failed'
);

CREATE INDEX IF NOT EXISTS idx_self_verifications_user ON self_verifications(user_address);
CREATE INDEX IF NOT EXISTS idx_self_verifications_status ON self_verifications(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_self_verifications_expires ON self_verifications(expires_at);

-- Store the latest successful verification per user (for quick lookups)
CREATE TABLE IF NOT EXISTS user_identity (
  user_address TEXT PRIMARY KEY,
  date_of_birth TEXT NOT NULL,             -- "1995-03-15"
  age_at_verification INTEGER NOT NULL,    -- Age when verified
  nationality TEXT NOT NULL,               -- ISO-3 code
  verification_session_id TEXT NOT NULL REFERENCES self_verifications(session_id),
  verified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
