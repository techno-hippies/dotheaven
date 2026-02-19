-- Ephemeral generation lock table for study-set on-demand generation.
-- This table is NOT canonical state; canonical refs/hashes live onchain.

CREATE TABLE IF NOT EXISTS study_set_generation_locks (
  lock_key TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_study_set_generation_locks_expires
  ON study_set_generation_locks(expires_at);
