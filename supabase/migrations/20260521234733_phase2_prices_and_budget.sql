-- ============================================================
-- Phase 2 — Per-matchday player prices + per-league budget
-- ============================================================
-- The unified game model: every matchday, every user picks fresh
-- from the full Serie A pool inside a fixed budget. Prices are
-- uploaded by the league admin via CSV per matchday. The budget
-- is set once per league and is shared across matchdays.
-- ============================================================

BEGIN;

-- ---- weekly_budget on engine config -------------------------

ALTER TABLE public.league_engine_config
  ADD COLUMN IF NOT EXISTS weekly_budget integer NOT NULL DEFAULT 500;

ALTER TABLE public.league_engine_config
  DROP CONSTRAINT IF EXISTS league_engine_config_weekly_budget_chk;
ALTER TABLE public.league_engine_config
  ADD CONSTRAINT league_engine_config_weekly_budget_chk
    CHECK (weekly_budget BETWEEN 50 AND 10000);

COMMENT ON COLUMN public.league_engine_config.weekly_budget IS
  'Credits each manager can spend per matchday. Default 500. Applies to starters + bench at full price.';

-- ---- matchday_player_prices ---------------------------------

CREATE TABLE IF NOT EXISTS public.matchday_player_prices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id uuid NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES public.league_players(id) ON DELETE CASCADE,
  price       integer NOT NULL CHECK (price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(matchday_id, player_id)
);

CREATE INDEX IF NOT EXISTS matchday_player_prices_matchday_idx
  ON public.matchday_player_prices(matchday_id);

COMMENT ON TABLE public.matchday_player_prices IS
  'Per-matchday player prices, uploaded by the league admin via CSV. Required before a matchday can be opened for lineup submission.';

-- Trigger to update updated_at on UPDATE
CREATE OR REPLACE FUNCTION public.matchday_player_prices_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matchday_player_prices_touch ON public.matchday_player_prices;
CREATE TRIGGER matchday_player_prices_touch
  BEFORE UPDATE ON public.matchday_player_prices
  FOR EACH ROW EXECUTE FUNCTION public.matchday_player_prices_set_updated_at();

-- ---- RLS ----------------------------------------------------

ALTER TABLE public.matchday_player_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matchday_player_prices_select ON public.matchday_player_prices;
CREATE POLICY matchday_player_prices_select
  ON public.matchday_player_prices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_prices.matchday_id
        AND lu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS matchday_player_prices_insert ON public.matchday_player_prices;
CREATE POLICY matchday_player_prices_insert
  ON public.matchday_player_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_prices.matchday_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

DROP POLICY IF EXISTS matchday_player_prices_update ON public.matchday_player_prices;
CREATE POLICY matchday_player_prices_update
  ON public.matchday_player_prices
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_prices.matchday_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

DROP POLICY IF EXISTS matchday_player_prices_delete ON public.matchday_player_prices;
CREATE POLICY matchday_player_prices_delete
  ON public.matchday_player_prices
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_prices.matchday_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

COMMIT;
