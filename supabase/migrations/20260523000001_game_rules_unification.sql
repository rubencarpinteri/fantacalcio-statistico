-- ============================================================
-- Game Rules Unification — single source of truth for scoring
-- ============================================================
-- Brings goal thresholds, smoothing rules, and W/D/L points into
-- league_engine_config alongside the engine knobs already there
-- (pivot, bonus/malus, popularity, MVP, calc_order).
--
-- These rules now apply uniformly to EVERY competition in the
-- league: Campionato, Battle Royale, Coppa, Fantamondiale.
--
-- Step 1 of the unification rollout. Old sources remain readable
-- until step 6 of the migration plan:
--   * leagues.result_rules
--   * competitions.scoring_config.thresholds
--   * fm_competition_config.config.battle_royale.goal_thresholds
-- ============================================================

BEGIN;

-- ---- 1. Add new columns -------------------------------------

ALTER TABLE public.league_engine_config
  ADD COLUMN IF NOT EXISTS goal_thresholds jsonb NOT NULL DEFAULT
    '[{"min":0,"goals":0},
      {"min":64.5,"goals":1},
      {"min":70.5,"goals":2},
      {"min":76.5,"goals":3},
      {"min":82.5,"goals":4},
      {"min":88.5,"goals":5},
      {"min":94.5,"goals":6}]'::jsonb,
  ADD COLUMN IF NOT EXISTS smoothing jsonb NOT NULL DEFAULT
    '{"drawIfDiffBelow":1.0,"drawIf1GoalLeadAndDiffBelow":1.5}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_points jsonb NOT NULL DEFAULT
    '{"win":3,"draw":1,"loss":0}'::jsonb;

COMMENT ON COLUMN public.league_engine_config.goal_thresholds IS
  'Cumulative team_total_fantavoto → goals lookup. Array of {min, goals} entries sorted ascending. Applies to every competition (Campionato, Battle Royale, Coppa, Fantamondiale).';
COMMENT ON COLUMN public.league_engine_config.smoothing IS
  'Smoothing rules to absorb sub-point noise: {drawIfDiffBelow, drawIf1GoalLeadAndDiffBelow}. Applies to every competition that produces head-to-head results.';
COMMENT ON COLUMN public.league_engine_config.result_points IS
  'Win/Draw/Loss point values: {win, draw, loss}. Applies to every competition that awards table points.';

-- ---- 2. Seed from existing leagues.result_rules --------------

UPDATE public.league_engine_config lec
SET
  goal_thresholds = COALESCE(l.result_rules->'thresholds', lec.goal_thresholds),
  smoothing       = COALESCE(l.result_rules->'smoothing',  lec.smoothing),
  result_points   = COALESCE(l.result_rules->'points',     lec.result_points)
FROM public.leagues l
WHERE lec.league_id = l.id
  AND l.result_rules IS NOT NULL;

-- ---- 3. Backfill: ensure every league has a config row -------

INSERT INTO public.league_engine_config (
  league_id,
  goal_thresholds,
  smoothing,
  result_points
)
SELECT
  l.id,
  COALESCE(l.result_rules->'thresholds',
    '[{"min":0,"goals":0},
      {"min":64.5,"goals":1},
      {"min":70.5,"goals":2},
      {"min":76.5,"goals":3},
      {"min":82.5,"goals":4},
      {"min":88.5,"goals":5},
      {"min":94.5,"goals":6}]'::jsonb),
  COALESCE(l.result_rules->'smoothing',
    '{"drawIfDiffBelow":1.0,"drawIf1GoalLeadAndDiffBelow":1.5}'::jsonb),
  COALESCE(l.result_rules->'points',
    '{"win":3,"draw":1,"loss":0}'::jsonb)
FROM public.leagues l
WHERE NOT EXISTS (
  SELECT 1 FROM public.league_engine_config WHERE league_id = l.id
);

COMMIT;
