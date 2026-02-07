-- Meal photos table for food tracking
CREATE TABLE IF NOT EXISTS meal_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_pkp TEXT NOT NULL,
    photo_cid TEXT NOT NULL,
    analysis_cid TEXT,
    description TEXT,
    total_calories INTEGER,
    total_protein INTEGER,
    total_carbs INTEGER,
    total_fat INTEGER,
    captured_at INTEGER NOT NULL,
    attestation_uid TEXT,
    tx_hash TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meal_photos_user ON meal_photos(user_pkp);
CREATE INDEX IF NOT EXISTS idx_meal_photos_captured ON meal_photos(captured_at);
