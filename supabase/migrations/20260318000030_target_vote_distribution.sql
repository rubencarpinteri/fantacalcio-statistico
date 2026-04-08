-- Migration 030: Target vote distribution parameters
-- Adds configurable target mean and standard deviation for the final voto_base
-- distribution. These replace the hardcoded base_score (6.0) and scale_factor (1.15)
-- in the b0/b1 formula, making the output distribution fully admin-configurable.
--
-- Formula:
--   b0 = target_mean_vote + target_vote_std × z_adjusted
--   b1 = target_mean_vote + role_multiplier × (b0 − target_mean_vote)
--   voto_base = clamp(b1, cap_min, cap_max)

ALTER TABLE league_engine_config
  ADD COLUMN IF NOT EXISTS target_mean_vote numeric(5,3) DEFAULT 6.000,
  ADD COLUMN IF NOT EXISTS target_vote_std  numeric(5,3) DEFAULT 0.750;

COMMENT ON COLUMN league_engine_config.target_mean_vote IS
  'Center of the output vote distribution on our fantacalcio scale (default 6.0). '
  'A combined z-score of 0 → exactly this value.';

COMMENT ON COLUMN league_engine_config.target_vote_std IS
  'Spread of the output vote distribution (default 0.75). '
  'Higher values → more extreme votes; lower values → more compressed.';
