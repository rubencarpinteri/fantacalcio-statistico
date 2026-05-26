-- The Lega-agnostic raw score cache needs to carry is_mvp so per-Lega
-- finalization can apply the MVP bonus without re-fetching player stats.
ALTER TABLE fm_player_match_score
  ADD COLUMN is_mvp boolean NOT NULL DEFAULT false;
