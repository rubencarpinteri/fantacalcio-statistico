-- ============================================================
-- Engine v3.0 — "Pivot + Bonus" simplification
-- ============================================================
-- The v2.0 z-score path (normalization + target distribution +
-- role multipliers + 2-band minutes factor) is replaced by a
-- single linear pivot:
--
--     voto_base = pivot_vote + slope × (rating − pivot_rating)
--
-- with the (10, 10) anchor implicit. Defaults map SportMonks
-- 6.50 (kickoff baseline) → voto 6.00 (Italian sufficienza).
--
-- This migration:
--   1. Drops the now-unused league_engine_config knobs.
--   2. Adds two new knobs: pivot_rating and pivot_vote.
--   3. Leaves the legacy columns on player_calculations intact
--      for historical audit (older runs preserved as-is); the
--      engine simply stops writing them.
-- ============================================================

BEGIN;

-- ---- league_engine_config: drop dead columns ---------------

ALTER TABLE public.league_engine_config
  DROP COLUMN IF EXISTS normalize_ratings,
  DROP COLUMN IF EXISTS rating_mean,
  DROP COLUMN IF EXISTS rating_std,
  DROP COLUMN IF EXISTS role_multiplier_gk,
  DROP COLUMN IF EXISTS role_multiplier_def,
  DROP COLUMN IF EXISTS role_multiplier_mid,
  DROP COLUMN IF EXISTS role_multiplier_att,
  DROP COLUMN IF EXISTS target_mean_vote,
  DROP COLUMN IF EXISTS target_vote_std,
  DROP COLUMN IF EXISTS minutes_factor_threshold,
  DROP COLUMN IF EXISTS minutes_factor_partial,
  DROP COLUMN IF EXISTS minutes_factor_full,
  DROP COLUMN IF EXISTS voto_base_cap_min,
  DROP COLUMN IF EXISTS voto_base_cap_max;

-- ---- league_engine_config: add pivot knobs -----------------

ALTER TABLE public.league_engine_config
  ADD COLUMN IF NOT EXISTS pivot_rating numeric(4, 2) NOT NULL DEFAULT 6.50,
  ADD COLUMN IF NOT EXISTS pivot_vote   numeric(4, 2) NOT NULL DEFAULT 6.00;

COMMENT ON COLUMN public.league_engine_config.pivot_rating IS
  'SportMonks rating value that pivots to pivot_vote. Default 6.50 (SportMonks kickoff baseline).';

COMMENT ON COLUMN public.league_engine_config.pivot_vote IS
  'Italian fantacalcio voto that the pivot_rating maps to. Default 6.00 ("sufficienza").';

COMMIT;
