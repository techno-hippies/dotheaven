-- Migration: 0004_ipfs_cids
-- Description: Add IPFS CID columns to anime_assets for portable storage

-- Add IPFS CID columns for grid and tiles
ALTER TABLE anime_assets ADD COLUMN grid_cid TEXT;
ALTER TABLE anime_assets ADD COLUMN tile1_cid TEXT;
ALTER TABLE anime_assets ADD COLUMN tile2_cid TEXT;
ALTER TABLE anime_assets ADD COLUMN tile3_cid TEXT;
ALTER TABLE anime_assets ADD COLUMN tile4_cid TEXT;

-- Index for looking up by CID (e.g., for IPFS gateway)
CREATE INDEX IF NOT EXISTS idx_anime_assets_tile1_cid ON anime_assets(tile1_cid) WHERE tile1_cid IS NOT NULL;
