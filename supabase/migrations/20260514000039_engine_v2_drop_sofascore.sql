-- ============================================================
-- Migration 039 — Engine v2.0: drop SofaScore everywhere
-- ============================================================
-- Engine v1.2 (dual-source FotMob + SofaScore) is replaced by
-- v2.0 (FotMob-only). SofaScore was abandoned because:
--   - SofaScore API requires manual browser-side fetching (CORS)
--   - FotMob HTML scrape covers both live + finished matches
--   - Empirical FotMob normalization from Ball, Huynh & Varley
--     (2025, J. Sports Sci. 43:7): mean 6.87 / std 0.79.
--
-- This migration:
--   1. Drops every SofaScore column across the schema
--   2. Updates default fotmob_mean from 6.6 → 6.87
--   3. Existing rows with fotmob_mean = 6.6 are bumped to 6.87
--      (they were defaulted under the old dual-source compromise)
-- ============================================================

-- ---- league_engine_config -----------------------------------
ALTER TABLE public.league_engine_config
  DROP COLUMN IF EXISTS sofascore_mean,
  DROP COLUMN IF EXISTS sofascore_std,
  DROP COLUMN IF EXISTS fotmob_weight;

-- Bump fotmob_mean default; migrate existing 6.6 values to 6.87.
UPDATE public.league_engine_config
  SET fotmob_mean = 6.87
  WHERE fotmob_mean = 6.6;

ALTER TABLE public.league_engine_config
  ALTER COLUMN fotmob_mean SET DEFAULT 6.87;

-- ---- leagues ------------------------------------------------
ALTER TABLE public.leagues
  DROP COLUMN IF EXISTS source_weight_sofascore;

-- ---- live_player_scores -------------------------------------
ALTER TABLE public.live_player_scores
  DROP COLUMN IF EXISTS sofascore_rating,
  DROP COLUMN IF EXISTS z_sofascore;

-- ---- matchday_fixtures --------------------------------------
ALTER TABLE public.matchday_fixtures
  DROP COLUMN IF EXISTS sofascore_event_id;

-- ---- player_calculations ------------------------------------
ALTER TABLE public.player_calculations
  DROP COLUMN IF EXISTS z_sofascore;

-- ---- player_match_stats -------------------------------------
ALTER TABLE public.player_match_stats
  DROP COLUMN IF EXISTS sofascore_rating;

-- ---- serie_a_players ----------------------------------------
DROP INDEX IF EXISTS public.idx_serie_a_players_sofascore_id;
ALTER TABLE public.serie_a_players
  DROP COLUMN IF EXISTS sofascore_id;
