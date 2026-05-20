-- ============================================================
-- SportMonks-only transition — Step 1 (schema)
-- ============================================================
-- Two changes, no data loss:
--
-- 1. Add sportmonks_fixture_id to matchday_fixtures and relax the
--    "at least one external ID" check so SportMonks-only fixtures are
--    valid. fm_real_match already got this column in migration 042.
--
-- 2. Rename rating columns from FotMob-specific to source-agnostic:
--      fotmob_rating  → rating      (3 tables)
--      z_fotmob       → z_rating    (3 tables)
--    The columns already hold SportMonks data (the crons write to them);
--    the name was lying. CHECK constraint expressions auto-update on
--    column rename in Postgres, so no constraint surgery needed.
--
-- Legacy FotMob/SofaScore ID columns (fotmob_match_id, sofascore_event_id,
-- fotmob_id, sofascore_id) stay intact for now. They'll be dropped in a
-- later cleanup migration after the SportMonks fetch path is validated
-- against live WC2026 data (post 2026-06-01).
-- ============================================================

-- ─── 1. matchday_fixtures: add sportmonks_fixture_id ─────────────────────────

alter table matchday_fixtures
  add column if not exists sportmonks_fixture_id bigint;

create index if not exists idx_matchday_fixtures_sportmonks
  on matchday_fixtures (sportmonks_fixture_id)
  where sportmonks_fixture_id is not null;

-- Relax the "must have at least one external ID" constraint to include sportmonks.
alter table matchday_fixtures
  drop constraint if exists chk_fixture_has_at_least_one_id;

alter table matchday_fixtures
  add constraint chk_fixture_has_at_least_one_id
  check (
    fotmob_match_id      is not null
    or sportmonks_fixture_id is not null
  );

-- ─── 2. Rename rating columns ─────────────────────────────────────────────────
-- Three tables hold fotmob_rating; three tables hold z_fotmob.

alter table player_match_stats     rename column fotmob_rating to rating;
alter table live_player_scores     rename column fotmob_rating to rating;
alter table fm_player_match_stats  rename column fotmob_rating to rating;

alter table player_calculations    rename column z_fotmob to z_rating;
alter table live_player_scores     rename column z_fotmob to z_rating;
alter table fm_player_match_score  rename column z_fotmob to z_rating;
