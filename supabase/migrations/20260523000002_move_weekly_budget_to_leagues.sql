-- ============================================================
-- Move weekly_budget from league_engine_config to leagues
-- ============================================================
-- weekly_budget is a draft-time setting (credits per matchday),
-- not a scoring rule, so it does not belong on the engine config.
-- Serie A's weekly draft is league-wide because every Serie A
-- competition (Campionato, Battle Royale, Coppa) shares the same
-- lineup. FantaMondiale keeps its per-competition budgets in
-- fm_competition_config.config.squad.budget_default.
--
-- Step 4 of the unification plan. The legacy
-- league_engine_config.weekly_budget column remains until step 6
-- to keep code that hasn't been migrated yet alive.
-- ============================================================

BEGIN;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS weekly_budget integer NOT NULL DEFAULT 500;

ALTER TABLE public.leagues
  DROP CONSTRAINT IF EXISTS leagues_weekly_budget_chk;
ALTER TABLE public.leagues
  ADD CONSTRAINT leagues_weekly_budget_chk
    CHECK (weekly_budget BETWEEN 50 AND 10000);

COMMENT ON COLUMN public.leagues.weekly_budget IS
  'Credits each manager spends per Serie A matchday to assemble the lineup. League-wide because every Serie A competition (Campionato, Battle Royale, Coppa) shares the same weekly draft. FantaMondiale budgets stay on fm_competition_config.';

UPDATE public.leagues l
SET weekly_budget = lec.weekly_budget
FROM public.league_engine_config lec
WHERE lec.league_id = l.id;

COMMIT;
