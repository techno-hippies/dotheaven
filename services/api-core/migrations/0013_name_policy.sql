-- Name anti-squat policy state (Tempo)
-- - Optional identity nullifier hash on user_identity
-- - PoW challenge lifecycle for long-name permits
-- - Permit issuance log for backend rate limits

ALTER TABLE user_identity ADD COLUMN identity_nullifier_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_user_identity_nullifier_hash
  ON user_identity(identity_nullifier_hash)
  WHERE identity_nullifier_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS name_pow_challenges (
  challenge_id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  label_hash TEXT NOT NULL,
  parent_node TEXT NOT NULL,
  challenge TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_name_pow_challenges_wallet_created
  ON name_pow_challenges(wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_name_pow_challenges_expires
  ON name_pow_challenges(expires_at);

CREATE TABLE IF NOT EXISTS name_permit_issuance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  ip_hash TEXT,
  device_id TEXT,
  label_hash TEXT NOT NULL,
  parent_node TEXT NOT NULL,
  policy_type INTEGER NOT NULL,
  issued_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_name_permit_issuance_wallet_issued
  ON name_permit_issuance(wallet_address, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_name_permit_issuance_ip_issued
  ON name_permit_issuance(ip_hash, issued_at DESC)
  WHERE ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_name_permit_issuance_device_issued
  ON name_permit_issuance(device_id, issued_at DESC)
  WHERE device_id IS NOT NULL;
