-- Tighten the per-Lega columns added in the previous migration. Both tables
-- are empty in production, so NOT NULL applies without a backfill step.
ALTER TABLE fm_round_player_ownership
  ALTER COLUMN league_competition_id SET NOT NULL;
ALTER TABLE fm_battle_royale_matchup
  ALTER COLUMN league_competition_id SET NOT NULL;

-- Ownership is now keyed per Lega instance (each Lega computes its own
-- popularity penalty from its own pool of teams).
ALTER TABLE fm_round_player_ownership
  ADD CONSTRAINT fm_round_player_ownership_lega_round_player_unique
  UNIQUE (league_competition_id, scoring_round_id, player_id);

-- BR matchups: a single (lega_instance, round, team_a, team_b) at most.
ALTER TABLE fm_battle_royale_matchup
  ADD CONSTRAINT fm_battle_royale_matchup_lega_round_pair_unique
  UNIQUE (league_competition_id, scoring_round_id, team_a_id, team_b_id);

-- Drop the per-Lega-dependent columns from fm_player_match_score.
-- These were computed assuming one global pool; per-Lega values now live in
-- fm_round_player_ownership (ownership_pct per Lega instance) and the
-- finalized per-team final scores are derived on the fly during aggregation
-- via finalizePlayerForLega().
ALTER TABLE fm_player_match_score
  DROP COLUMN ownership_pct,
  DROP COLUMN mvp_bonus_pct,
  DROP COLUMN mvp_bonus_amount,
  DROP COLUMN popularity_penalty_pct,
  DROP COLUMN popularity_penalty_amount,
  DROP COLUMN final_score;
