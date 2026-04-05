-- ============================================================
-- Engine v1.1: per-league role multipliers
-- ============================================================
-- Adds four configurable role multiplier columns to league_engine_config.
-- Defaults match DEFAULT_ENGINE_CONFIG in domain/engine/v1/config.ts:
--   GK 1.15 / DEF 1.10 / MID 1.00 / ATT 0.97
--
-- These replace the previously hardcoded values in config.ts.
-- Existing leagues that have no row in league_engine_config continue
-- to use the defaults via buildEngineConfig() fallback.
-- ============================================================

ALTER TABLE league_engine_config
  ADD COLUMN role_multiplier_gk  NUMERIC(4,2) NOT NULL DEFAULT 1.15,
  ADD COLUMN role_multiplier_def NUMERIC(4,2) NOT NULL DEFAULT 1.10,
  ADD COLUMN role_multiplier_mid NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  ADD COLUMN role_multiplier_att NUMERIC(4,2) NOT NULL DEFAULT 0.97;
