-- Duet room discovery index for paid rooms shown in clients.

CREATE TABLE IF NOT EXISTS duet_rooms (
  room_id TEXT PRIMARY KEY,
  host_wallet TEXT NOT NULL,
  guest_wallet TEXT,
  status TEXT NOT NULL CHECK (status IN ('created', 'live', 'ended')),
  split_address TEXT NOT NULL,
  network TEXT NOT NULL,
  live_amount TEXT NOT NULL,
  replay_amount TEXT NOT NULL,
  audience_mode TEXT NOT NULL CHECK (audience_mode IN ('free', 'ticketed')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
  title TEXT,
  room_kind TEXT,
  listener_count INTEGER NOT NULL DEFAULT 0,
  live_started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_duet_rooms_status_visibility_time
  ON duet_rooms(status, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_duet_rooms_host_status
  ON duet_rooms(host_wallet, status);
