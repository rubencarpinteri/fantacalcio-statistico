-- ============================================================
-- Step 6 — Drop legacy scoring columns
-- ============================================================
-- After the unification rollout (steps 1–5), the canonical source
-- of game rules is league_engine_config. These legacy columns are
-- no longer read by application code:
--
--   * leagues.result_rules            → league_engine_config.{goal_thresholds, smoothing, result_points}
--   * league_engine_config.weekly_budget → leagues.weekly_budget
--   * fm_competition_config.config.{engine, football,
--       popularity_brackets, mvp_bonus_brackets, calc_order,
--       battle_royale}                 → derived from league_engine_config
--                                        at scoring time
-- ============================================================

BEGIN;

ALTER TABLE public.leagues
  DROP COLUMN IF EXISTS result_rules;

ALTER TABLE public.league_engine_config
  DROP CONSTRAINT IF EXISTS league_engine_config_weekly_budget_chk;
ALTER TABLE public.league_engine_config
  DROP COLUMN IF EXISTS weekly_budget;

-- Strip the scoring keys from every FM competition config.
-- competitions.scoring_config keeps only { method } now — we leave
-- the JSONB column in place because callers (rounds/standings UI,
-- compute action) still read the method.
UPDATE public.fm_competition_config
SET config = config
  - 'engine'
  - 'football'
  - 'popularity_brackets'
  - 'mvp_bonus_brackets'
  - 'calc_order'
  - 'battle_royale';

COMMIT;
