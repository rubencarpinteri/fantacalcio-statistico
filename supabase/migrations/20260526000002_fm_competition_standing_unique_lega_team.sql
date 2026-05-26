-- The original UNIQUE(competition_id, fantasy_team_id) was implicitly dropped
-- when competition_id was removed in the Lega-scoped migration. The engine
-- upserts standings keyed by (league_competition_id, fantasy_team_id).
ALTER TABLE fm_competition_standing
  ADD CONSTRAINT fm_competition_standing_lega_team_unique
  UNIQUE (league_competition_id, fantasy_team_id);
