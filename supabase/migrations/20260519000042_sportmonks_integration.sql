-- ============================================================
-- SportMonks integration
-- League-agnostic external-ID layer, fixtures cache,
-- engine passthrough mode.
--
-- Companion to Engine v2.0 (FotMob-only) — keeps fotmob_* columns
-- in place during trial. A later migration will drop them after
-- one week of green SportMonks operation.
-- ============================================================

-- ---- 1. External SportMonks IDs (parallel to fotmob_*) ----

alter table serie_a_players
  add column sportmonks_player_id bigint;

create unique index ux_serie_a_players_sportmonks
  on serie_a_players (sportmonks_player_id)
  where sportmonks_player_id is not null;

alter table fm_player
  add column sportmonks_player_id bigint;

create unique index ux_fm_player_sportmonks
  on fm_player (competition_id, sportmonks_player_id)
  where sportmonks_player_id is not null;

alter table fm_coach
  add column sportmonks_coach_id bigint;

alter table fm_real_match
  add column sportmonks_fixture_id bigint;

create unique index ux_fm_real_match_sportmonks
  on fm_real_match (sportmonks_fixture_id)
  where sportmonks_fixture_id is not null;

alter table fm_national_team
  add column sportmonks_team_id bigint;

create unique index ux_fm_national_team_sportmonks
  on fm_national_team (sportmonks_team_id)
  where sportmonks_team_id is not null;

-- ---- 2. Per-league/competition active SportMonks league pointer ----
-- Single flip-point: Scottish Prem 501 (trial) → WC 2026 (Jun 1)
-- → Serie A (Aug). Null = SportMonks disabled for this league.

alter table leagues
  add column active_sportmonks_league_id int;

alter table fm_competition
  add column active_sportmonks_league_id int;

-- ---- 3. Fixtures cache ----
-- Upstream mirror of SportMonks /fixtures responses. NOT the
-- system of record — matchday_fixtures (Serie A) and fm_real_match
-- (FantaMondiale) remain authoritative. The cron upserts here,
-- auto-create logic reads here.

create table sportmonks_fixtures (
  sportmonks_fixture_id bigint primary key,
  league_id      int  not null,
  season_id      int,
  stage_id       bigint,
  round_id       bigint,
  home_team_id   bigint,
  away_team_id   bigint,
  home_team_name text,
  away_team_name text,
  kickoff_at     timestamptz not null,
  state_id       int,
  state_name     text,
  length_minutes int,
  raw_payload    jsonb,
  fetched_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_sportmonks_fixtures_league_kickoff
  on sportmonks_fixtures (league_id, kickoff_at);

create index idx_sportmonks_fixtures_state
  on sportmonks_fixtures (state_id);

create trigger sportmonks_fixtures_updated_at
  before update on sportmonks_fixtures
  for each row execute procedure update_updated_at_column();

-- Service-role only. No client policies = no anon/auth access.
-- Server actions go through service client for reads.
alter table sportmonks_fixtures enable row level security;

-- ---- 4. Engine normalization opt-in ----
-- false = passthrough (rating IS voto_base candidate, role mult
--         applied around base_score)
-- true  = v2.0 z-score normalization (existing behaviour)
--
-- Existing rows backfilled to true to preserve current scoring
-- on any in-flight Serie A leagues.

alter table league_engine_config
  add column normalize_ratings boolean not null default false;

update league_engine_config
  set normalize_ratings = true;

-- ---- 5. Raw SportMonks per-player stat dump (Serie A) ----
-- FantaMondiale already has fm_player_match_stats.raw_payload —
-- we'll write the SportMonks payload there. For Serie A's
-- player_match_stats, add a parallel column.

alter table player_match_stats
  add column sportmonks_raw_stats jsonb;
