-- Rate limit table for gasless meta-tx relay
-- Tracks last profile set time per wallet address to prevent gas abuse
CREATE TABLE IF NOT EXISTS wallet_rate_limits (
  user_address TEXT PRIMARY KEY,
  last_profile_set INTEGER NOT NULL
);
