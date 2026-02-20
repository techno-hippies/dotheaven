-- Nonce challenges for signature auth
CREATE TABLE IF NOT EXISTS nonces (
  wallet TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Voice sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  channel TEXT NOT NULL,
  agora_agent_id TEXT,
  llm_secret_hash TEXT NOT NULL,
  context_blob TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  status TEXT NOT NULL  -- 'active','ended','error'
);

CREATE INDEX IF NOT EXISTS idx_sessions_wallet_started_at
  ON sessions(wallet, started_at);

CREATE INDEX IF NOT EXISTS idx_sessions_llm_secret_hash
  ON sessions(llm_secret_hash);
