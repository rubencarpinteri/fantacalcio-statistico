-- ============================================================
-- Migration: 20260318000013_league_source_weights
-- Add per-league configurable source weights to the leagues table.
-- Stored as integer percentages (0–100); sum must equal 100.
-- Defaults match the v1 hardcoded values: SofaScore 40%, WhoScored 25%, FotMob 35%.
-- ============================================================

alter table leagues
  add column source_weight_sofascore smallint not null default 40,
  add column source_weight_whoscored smallint not null default 25,
  add column source_weight_fotmob    smallint not null default 35;

alter table leagues
  add constraint chk_source_weights_sum
  check (source_weight_sofascore + source_weight_whoscored + source_weight_fotmob = 100);
