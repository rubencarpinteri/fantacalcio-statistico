-- Add penalties_saved and penalties_missed to live_player_scores
-- (were missing from the original migration 018)
ALTER TABLE live_player_scores
  ADD COLUMN penalties_saved  int NOT NULL DEFAULT 0,
  ADD COLUMN penalties_missed int NOT NULL DEFAULT 0;
