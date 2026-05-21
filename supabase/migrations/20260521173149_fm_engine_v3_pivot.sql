-- ============================================================
-- FantaMondiale engine v3.0 — Pivot + Bonus alignment
-- ============================================================
-- The FM engine config lives as a JSONB document inside
-- fm_competition_config.config. This migration rewrites the
-- `engine` sub-object on every existing row to the new
-- "Pivot + Bonus" shape — same architecture as the Serie A
-- engine — so that the new Zod schema can parse them.
--
-- Old shape (v2.0): rating_mean, rating_std, role_multiplier,
--   target_mean_vote, target_vote_std, minutes_threshold,
--   minutes_partial, minutes_full, voto_base_min/max.
--
-- New shape (v3.0): pivot_rating, pivot_vote, voto_min, voto_max,
--   minutes_min_for_voto, base_score.
--
-- All other config sub-objects (football, popularity_brackets,
-- mvp_bonus_brackets, coach_tier_matrix, battle_royale, squad,
-- formations, calc_order, tie_breakers, schema_version) are
-- left untouched.
-- ============================================================

UPDATE public.fm_competition_config
SET config = jsonb_set(
  config,
  '{engine}',
  '{
    "pivot_rating": 6.50,
    "pivot_vote": 6.00,
    "voto_min": 1.0,
    "voto_max": 10.0,
    "minutes_min_for_voto": 15,
    "base_score": 6.0
  }'::jsonb,
  true
);
