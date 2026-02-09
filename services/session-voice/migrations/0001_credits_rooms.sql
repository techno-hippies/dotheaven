-- Session Voice v2: Credit Ledger + Free Rooms
-- D1 schema migration

-- ── Credit Accounts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_accounts (
  wallet TEXT PRIMARY KEY,
  base_granted_seconds INTEGER NOT NULL DEFAULT 0,
  bonus_granted_seconds INTEGER NOT NULL DEFAULT 0,
  consumed_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Credit Events (append-only audit trail) ─────────────────────
CREATE TABLE IF NOT EXISTS credit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  delta_seconds INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('grant_base', 'grant_celo_bonus', 'debit_usage', 'refund_usage', 'admin_adjust')
  ),
  balance_after_seconds INTEGER NOT NULL,
  connection_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_events_wallet_time
  ON credit_events(wallet, created_at DESC);

-- ── Verification State ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verifications (
  wallet TEXT PRIMARY KEY,
  celo_verified INTEGER NOT NULL DEFAULT 0,
  bonus_granted_at TEXT
);

-- ── Rooms ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  room_type TEXT NOT NULL CHECK (room_type IN ('free', 'booked')),
  booking_id INTEGER,
  host_wallet TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_booking
  ON rooms(booking_id) WHERE booking_id IS NOT NULL;

-- One active free room per host — DB-level enforcement against concurrent create race
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_active_free_host
  ON rooms(host_wallet) WHERE room_type = 'free' AND status = 'active';

-- ── Room Participants ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_participants (
  connection_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  agora_uid INTEGER NOT NULL,
  joined_at_epoch INTEGER NOT NULL,
  last_metered_at_epoch INTEGER NOT NULL,
  left_at_epoch INTEGER,
  warned_low INTEGER NOT NULL DEFAULT 0,
  exhausted INTEGER NOT NULL DEFAULT 0,
  debited_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room
  ON room_participants(room_id, left_at_epoch);

CREATE INDEX IF NOT EXISTS idx_room_participants_wallet_active
  ON room_participants(wallet) WHERE left_at_epoch IS NULL;

-- ── Auth Nonces (one-time consume) ──────────────────────────────
CREATE TABLE IF NOT EXISTS auth_nonces (
  wallet TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (wallet, nonce)
);
