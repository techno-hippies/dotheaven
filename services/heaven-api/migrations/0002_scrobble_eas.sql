-- Add EAS attestation columns to scrobble_batches
-- These columns store the on-chain attestation info after IPFS pin

ALTER TABLE scrobble_batches ADD COLUMN attestation_uid TEXT;  -- EAS attestation UID (bytes32 hex)
ALTER TABLE scrobble_batches ADD COLUMN tx_hash TEXT;          -- Transaction hash

CREATE INDEX IF NOT EXISTS idx_scrobble_batches_attestation ON scrobble_batches(attestation_uid) WHERE attestation_uid IS NOT NULL;
