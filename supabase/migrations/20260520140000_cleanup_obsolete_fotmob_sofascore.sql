-- ============================================================
-- Cleanup: drop everything obsolete from the FotMob/SofaScore era.
-- SportMonks is the sole rating source; the v1.2 dual-source weights
-- and the FotMob ingest scratch tables have no remaining readers.
-- ============================================================

-- 1. Drop the two ingest-side scratch tables (nothing reads them anymore)
drop table if exists public.fotmob_unmatched_players cascade;
drop table if exists public.fotmob_ignored_players   cascade;

-- 2. league_engine_config: rename misnamed source columns, drop v1.2 weights
alter table public.league_engine_config rename column fotmob_mean to rating_mean;
alter table public.league_engine_config rename column fotmob_std  to rating_std;

comment on column public.league_engine_config.rating_mean is
  'Empirical mean of the rating distribution (SportMonks).';
comment on column public.league_engine_config.rating_std is
  'Empirical std of the rating distribution (SportMonks).';

alter table public.league_engine_config drop column if exists source_weight_fotmob;
alter table public.league_engine_config drop column if exists source_weight_sofascore;
alter table public.league_engine_config drop column if exists single_source_shrink;

-- 3. leagues: drop dual-source weights (if present at the league level too)
alter table public.leagues drop column if exists source_weight_fotmob;
alter table public.leagues drop column if exists source_weight_sofascore;

-- 4. matchday_fixtures: drop dead FotMob status plumbing
--    sportmonks_fixture_id is the live-ingest key now.
alter table public.matchday_fixtures drop column if exists fotmob_started;
alter table public.matchday_fixtures drop column if exists fotmob_finished;
alter table public.matchday_fixtures drop column if exists fotmob_status_seen_at;
