-- ============================================================
-- Engine v3.1 — Ownership penalty + MVP bonus (the trademark)
-- ============================================================
-- Adds to the Serie A engine the same MVP/popularity/calc_order
-- system that FM already has, so the two competitions share an
-- identical scoring pipeline.
--
-- Per-player pipeline (Serie A v3.1, identical to FM):
--   voto_base   = clamp( pivot_vote + slope×(rating − pivot_rating), 1, 10 )
--   raw_subtotal = voto_base + football_bonus − football_malus    (no clamp)
--   pen         = |raw_subtotal| × popularity_pct/100
--   final       = (raw_subtotal − pen) × (1 + mvp_pct/100)        (no clamp)
--
-- New defaults (mirror DEFAULT_FM_CONFIG):
--   popularity_brackets:  0/10/25/40/50  (cap 50%)
--   mvp_bonus_brackets:   50/40/25/15/5  (cap 50%, only if is_mvp)
--   calc_order:           'penalty_then_mvp'
-- ============================================================

BEGIN;

-- ---- league_engine_config: add JSONB knobs ------------------

ALTER TABLE public.league_engine_config
  ADD COLUMN IF NOT EXISTS popularity_brackets jsonb NOT NULL DEFAULT
    '[{"min_pct":0,"max_pct":10,"pct":0},
      {"min_pct":11,"max_pct":25,"pct":10},
      {"min_pct":26,"max_pct":50,"pct":25},
      {"min_pct":51,"max_pct":75,"pct":40},
      {"min_pct":76,"max_pct":100,"pct":50}]'::jsonb,
  ADD COLUMN IF NOT EXISTS mvp_bonus_brackets jsonb NOT NULL DEFAULT
    '[{"min_pct":0,"max_pct":10,"pct":50},
      {"min_pct":11,"max_pct":25,"pct":40},
      {"min_pct":26,"max_pct":50,"pct":25},
      {"min_pct":51,"max_pct":75,"pct":15},
      {"min_pct":76,"max_pct":100,"pct":5}]'::jsonb,
  ADD COLUMN IF NOT EXISTS calc_order text NOT NULL DEFAULT 'penalty_then_mvp';

ALTER TABLE public.league_engine_config
  ADD CONSTRAINT league_engine_config_calc_order_chk
    CHECK (calc_order IN ('mvp_then_penalty', 'penalty_then_mvp'));

COMMENT ON COLUMN public.league_engine_config.popularity_brackets IS
  'Ownership-band ladder for popularity penalty. Array of {min_pct,max_pct,pct}. Penalty applied as |raw_subtotal| × pct/100.';
COMMENT ON COLUMN public.league_engine_config.mvp_bonus_brackets IS
  'Ownership-band ladder for MVP bonus. Array of {min_pct,max_pct,pct}. Only applied when player.is_mvp=true.';
COMMENT ON COLUMN public.league_engine_config.calc_order IS
  'Order of operations: ''penalty_then_mvp'' (Option B compound, default) or ''mvp_then_penalty'' (additive).';

-- ---- player_match_stats: MVP flag ---------------------------

ALTER TABLE public.player_match_stats
  ADD COLUMN IF NOT EXISTS is_mvp boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.player_match_stats.is_mvp IS
  'True for the highest-rated player in each Serie A match. Populated by SportMonks ingest.';

-- ---- player_calculations: trademark output columns ----------

ALTER TABLE public.player_calculations
  ADD COLUMN IF NOT EXISTS raw_subtotal numeric,
  ADD COLUMN IF NOT EXISTS ownership_pct numeric,
  ADD COLUMN IF NOT EXISTS mvp_bonus_pct numeric,
  ADD COLUMN IF NOT EXISTS mvp_bonus_amount numeric,
  ADD COLUMN IF NOT EXISTS popularity_penalty_pct numeric,
  ADD COLUMN IF NOT EXISTS popularity_penalty_amount numeric;

-- ---- matchday_player_ownership: snapshot at lineup deadline -

CREATE TABLE IF NOT EXISTS public.matchday_player_ownership (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id     uuid NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  player_id       uuid NOT NULL REFERENCES public.league_players(id) ON DELETE CASCADE,
  teams_owning    int  NOT NULL,
  teams_total     int  NOT NULL,
  ownership_pct   numeric(5,2) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(matchday_id, player_id)
);

CREATE INDEX IF NOT EXISTS matchday_player_ownership_matchday_idx
  ON public.matchday_player_ownership(matchday_id);

COMMENT ON TABLE public.matchday_player_ownership IS
  'Per-matchday ownership snapshot. Frozen at lineup deadline (matchday→closed). Used as input to the MVP/popularity calculation.';

-- RLS: league members can read their league's snapshots; admins can write.
ALTER TABLE public.matchday_player_ownership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matchday_player_ownership_select ON public.matchday_player_ownership;
CREATE POLICY matchday_player_ownership_select
  ON public.matchday_player_ownership
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_ownership.matchday_id
        AND lu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS matchday_player_ownership_insert ON public.matchday_player_ownership;
CREATE POLICY matchday_player_ownership_insert
  ON public.matchday_player_ownership
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.matchdays m
      JOIN public.league_users lu ON lu.league_id = m.league_id
      WHERE m.id = matchday_player_ownership.matchday_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

-- ---- fm_player_match_stats: add penalties_scored ------------
-- FM needs penalties_scored to mirror Serie A's penalty_scored_discount logic.

ALTER TABLE public.fm_player_match_stats
  ADD COLUMN IF NOT EXISTS penalties_scored int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fm_player_match_stats.penalties_scored IS
  'Subset of `goals` that came from penalty kicks. Used by penalty_scored_discount.';

-- ---- fm_competition_config: rewrite to new engine v3.1 -------
-- Updates the JSONB `config` on every existing row to:
--   * new popularity_brackets / mvp_bonus_brackets (50% caps, quartile edges)
--   * new football B/M structure (penalty_scored_discount, goals_conceded.D)
--   * new calc_order default 'penalty_then_mvp'

UPDATE public.fm_competition_config
SET config = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        config,
        '{popularity_brackets}',
        '[{"min_pct":0,"max_pct":10,"pct":0},
          {"min_pct":11,"max_pct":25,"pct":10},
          {"min_pct":26,"max_pct":50,"pct":25},
          {"min_pct":51,"max_pct":75,"pct":40},
          {"min_pct":76,"max_pct":100,"pct":50}]'::jsonb,
        true
      ),
      '{mvp_bonus_brackets}',
      '[{"min_pct":0,"max_pct":10,"pct":50},
        {"min_pct":11,"max_pct":25,"pct":40},
        {"min_pct":26,"max_pct":50,"pct":25},
        {"min_pct":51,"max_pct":75,"pct":15},
        {"min_pct":76,"max_pct":100,"pct":5}]'::jsonb,
      true
    ),
    '{football}',
    '{
      "goal": {"P":4.0,"D":2.8,"C":2.2,"A":1.8},
      "penalty_scored_discount": 0.3,
      "assist": 1.0,
      "clean_sheet": {"P":0.8,"D":0.5,"min_minutes":60},
      "penalty_saved": 2.0,
      "penalty_missed": -1.5,
      "yellow_card": -0.3,
      "red_card": -1.5,
      "own_goal": -1.5,
      "goals_conceded": {"P":-0.4,"D":-0.15,"def_min_minutes":60},
      "brace_bonus": 0.5,
      "hat_trick_bonus": 1.0
    }'::jsonb,
    true
  ),
  '{calc_order}',
  '"penalty_then_mvp"'::jsonb,
  true
);

COMMIT;
