-- Add normalization parameters to league_engine_config
-- These control how FotMob and SofaScore ratings are converted to z-scores
-- and the weight each source carries in the combined rating.

ALTER TABLE league_engine_config
  ADD COLUMN IF NOT EXISTS fotmob_mean     numeric(5,3) NOT NULL DEFAULT 6.6,
  ADD COLUMN IF NOT EXISTS fotmob_std      numeric(5,3) NOT NULL DEFAULT 0.79,
  ADD COLUMN IF NOT EXISTS sofascore_mean  numeric(5,3) NOT NULL DEFAULT 6.7,
  ADD COLUMN IF NOT EXISTS sofascore_std   numeric(5,3) NOT NULL DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS fotmob_weight   numeric(5,3) NOT NULL DEFAULT 0.55;

COMMENT ON COLUMN league_engine_config.fotmob_mean    IS 'FotMob rating mean for z-score normalization (z = (r - mean) / std)';
COMMENT ON COLUMN league_engine_config.fotmob_std     IS 'FotMob rating standard deviation';
COMMENT ON COLUMN league_engine_config.sofascore_mean IS 'SofaScore rating mean for z-score normalization';
COMMENT ON COLUMN league_engine_config.sofascore_std  IS 'SofaScore rating standard deviation';
COMMENT ON COLUMN league_engine_config.fotmob_weight  IS 'FotMob weight in dual-source weighted average (SofaScore weight = 1 - this)';
