-- ============================================================
-- Migration 040 — FantaMondiale Statistico 2026
-- ============================================================
-- A parallel competition module for the 2026 FIFA World Cup.
-- Tables are prefixed `fm_` and live alongside the existing
-- `league_*` (Serie A) tables without colliding.
--
-- KEY MODEL DIFFERENCES vs Serie A league:
--   * Duplicate player ownership is allowed (multiple fantasy
--     teams can field the same real player).
--   * Two-tier lineup model: a 25-man phase squad (revealed at
--     phase lock) + a per-matchday starting XI (revealed at
--     matchday lock). Popularity penalty operates on the XI
--     level, not the squad level.
--   * Classic P/D/C/A roles (no Mantra).
--   * One global super-admin runs the whole thing.
--   * Every rule (brackets, bonuses, weights, tier matrix) is
--     admin-configurable via a JSONB config blob.
--
-- DESIGN NOTES:
--   * fm_phase_squad and fm_matchday_lineup are NOT append-only
--     before their respective locks (users can freely edit
--     drafts). After lock, all mutations go through admin paths
--     only and an audit row is created.
--   * fm_player_match_score stores the full calculation
--     snapshot (config JSONB) so historical scores remain
--     reproducible even if config changes mid-tournament.
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

create type fm_competition_status as enum (
  'draft', 'open', 'in_progress', 'completed', 'archived'
);

create type fm_phase_kind as enum (
  'group_stage', 'round_of_32', 'round_of_16',
  'quarter_final', 'semi_final', 'final'
);

create type fm_phase_status as enum (
  'draft', 'open', 'locked', 'completed'
);

create type fm_round_status as enum (
  'draft', 'open', 'locked', 'scoring', 'published'
);

create type fm_player_role as enum ('P', 'D', 'C', 'A');

create type fm_team_status as enum ('active', 'eliminated');

create type fm_team_tier as enum ('tier_1', 'tier_2', 'tier_3', 'tier_4');

create type fm_budget_mode as enum ('fixed', 'reward_leaders', 'comeback');

create type fm_squad_status as enum ('draft', 'submitted', 'locked');

create type fm_lineup_status as enum ('draft', 'submitted', 'locked');

create type fm_match_status as enum (
  'scheduled', 'in_progress', 'finished', 'cancelled'
);

create type fm_match_result as enum ('home_win', 'draw', 'away_win');

create type fm_calc_order as enum ('mvp_then_penalty', 'penalty_then_mvp');

create type fm_audit_action as enum (
  'competition_create',
  'phase_create', 'phase_lock', 'phase_unlock',
  'round_create', 'round_lock', 'round_unlock', 'round_publish',
  'team_create', 'team_eliminate', 'team_reactivate',
  'player_create', 'player_update', 'player_eliminate',
  'coach_create', 'coach_update', 'coach_tier_change',
  'price_update', 'price_bulk_import',
  'squad_save', 'squad_submit', 'squad_admin_edit',
  'lineup_save', 'lineup_submit', 'lineup_admin_edit',
  'ratings_ingest', 'stats_edit',
  'score_calculate', 'score_publish',
  'config_change'
);

-- ============================================================
-- COMPETITION
-- One row per FantaMondiale instance. Designed for the 2026 WC
-- but the model supports future editions (Euro 2028 etc.).
-- ============================================================

create table fm_competition (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  edition     text not null,
  timezone    text not null default 'Europe/Rome',
  status      fm_competition_status not null default 'draft',
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, edition)
);

create trigger fm_competition_updated_at
  before update on fm_competition
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- COMPETITION CONFIG
-- Single JSONB blob holding every tunable rule. One row per
-- competition. The shape is enforced in TypeScript via Zod;
-- DB stays flexible so we can add knobs without migrations.
--
-- Expected keys (TypeScript will own the canonical shape):
--   squad: { size, starters, bench, budget_default }
--   formations: ["3-4-3", "3-5-2", ...]
--   football_bonuses: { goal_P, goal_D, goal_C, goal_A,
--                       assist, clean_sheet_P, clean_sheet_D,
--                       pen_saved, pen_missed,
--                       yellow, red, own_goal, goal_conceded_P }
--   popularity_brackets: [{ min_pct, max_pct, penalty_pct }, ...]
--   mvp_bonus_brackets: [{ min_pct, max_pct, bonus_pct }, ...]
--   coach_tier_matrix: { tier_1: { win, draw, loss }, ... }
--   tie_breakers: ["br_points", "raw_score", ...]
--   calc_order: "mvp_then_penalty" | "penalty_then_mvp"
--   engine: { fotmob_mean, fotmob_std, voto_base_min,
--             voto_base_max, voto_base_slope }
--   br_thresholds: [64.5, 70.5, 76.5, 82.5, ...]
-- ============================================================

create table fm_competition_config (
  competition_id  uuid primary key references fm_competition on delete cascade,
  config          jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles on delete set null
);

create trigger fm_competition_config_updated_at
  before update on fm_competition_config
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- NATIONAL TEAMS
-- 48 teams in WC 2026. `status` flips to eliminated once the
-- team is knocked out; eliminated teams' players are filtered
-- out of future squad selection but historical squads stay.
-- ============================================================

create table fm_national_team (
  id            uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  name          text not null,
  fifa_code     text not null,
  flag_emoji    text,
  status        fm_team_status not null default 'active',
  eliminated_at timestamptz,
  fotmob_team_id bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (competition_id, fifa_code)
);

create index idx_fm_national_team_competition on fm_national_team (competition_id);
create index idx_fm_national_team_status on fm_national_team (competition_id, status);

create trigger fm_national_team_updated_at
  before update on fm_national_team
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PLAYERS
-- WC players. Linked to a national team. Roles are Classic
-- P/D/C/A. `base_price` is the suggested starting price; the
-- effective price per phase lives in fm_phase_player_price.
-- ============================================================

create table fm_player (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  national_team_id uuid not null references fm_national_team on delete cascade,
  name           text not null,
  shirt_number   int,
  role           fm_player_role not null,
  fotmob_player_id bigint,
  base_price     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, fotmob_player_id),
  constraint chk_fm_player_price_nonneg check (base_price >= 0),
  constraint chk_fm_player_shirt check (shirt_number is null or shirt_number between 1 and 99)
);

create index idx_fm_player_competition on fm_player (competition_id);
create index idx_fm_player_team on fm_player (national_team_id);
create index idx_fm_player_role on fm_player (competition_id, role);
create index idx_fm_player_fotmob on fm_player (fotmob_player_id) where fotmob_player_id is not null;

create trigger fm_player_updated_at
  before update on fm_player
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- COACHES
-- One coach per national team. Coaches are scored separately
-- from players. Tier is assigned per phase via fm_phase_coach_tier.
-- ============================================================

create table fm_coach (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  national_team_id uuid not null references fm_national_team on delete cascade,
  name           text not null,
  fotmob_coach_id bigint,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, national_team_id)
);

create index idx_fm_coach_competition on fm_coach (competition_id);

create trigger fm_coach_updated_at
  before update on fm_coach
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PHASES
-- Tournament stages. requires_new_squad lets admin toggle the
-- rebuild cadence (every phase vs every 2 phases) without
-- schema changes. squad_open_at / squad_lock_at / reveal_at
-- are stored as timestamptz for easy date/time admin editing.
-- ============================================================

create table fm_phase (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  kind           fm_phase_kind not null,
  name           text not null,
  display_order  int not null,
  status         fm_phase_status not null default 'draft',
  requires_new_squad boolean not null default true,
  squad_open_at  timestamptz,
  squad_lock_at  timestamptz,
  reveal_at      timestamptz,
  budget_mode    fm_budget_mode not null default 'comeback',
  budget_config  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, display_order),
  unique (competition_id, kind)
);

create index idx_fm_phase_competition on fm_phase (competition_id);

create trigger fm_phase_updated_at
  before update on fm_phase
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PHASE x PLAYER (prices)
-- Per-phase price. The same player can have different prices
-- across phases (admin re-prices before each rebuild). NULL
-- means the player is not selectable for that phase.
-- ============================================================

create table fm_phase_player_price (
  id         uuid primary key default gen_random_uuid(),
  phase_id   uuid not null references fm_phase on delete cascade,
  player_id  uuid not null references fm_player on delete cascade,
  price      int not null,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phase_id, player_id),
  constraint chk_fm_price_nonneg check (price >= 0)
);

create index idx_fm_phase_price_phase on fm_phase_player_price (phase_id);

create trigger fm_phase_player_price_updated_at
  before update on fm_phase_player_price
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PHASE x COACH (tier)
-- Per-phase coach tier assignment. Admin sets tier_1..4 from
-- bookmaker odds before each phase. Used to compute the coach
-- bonus/malus matrix.
-- ============================================================

create table fm_phase_coach_tier (
  id           uuid primary key default gen_random_uuid(),
  phase_id     uuid not null references fm_phase on delete cascade,
  coach_id     uuid not null references fm_coach on delete cascade,
  tier         fm_team_tier not null,
  odds_value   numeric(8,3),
  odds_source  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (phase_id, coach_id)
);

create index idx_fm_phase_coach_tier_phase on fm_phase_coach_tier (phase_id);

create trigger fm_phase_coach_tier_updated_at
  before update on fm_phase_coach_tier
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- SCORING ROUNDS
-- A scoring round bundles 1+ real matches and produces one BR
-- matchup table. Group stage typically has 3 rounds (one per
-- FIFA matchday), each knockout stage has 1 round.
-- lock_at is when matchday lineups freeze for this round.
-- ============================================================

create table fm_scoring_round (
  id           uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  phase_id     uuid not null references fm_phase on delete cascade,
  name         text not null,
  display_order int not null,
  status       fm_round_status not null default 'draft',
  lineup_open_at timestamptz,
  lock_at      timestamptz,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (phase_id, display_order)
);

create index idx_fm_scoring_round_phase on fm_scoring_round (phase_id);
create index idx_fm_scoring_round_status on fm_scoring_round (competition_id, status);

create trigger fm_scoring_round_updated_at
  before update on fm_scoring_round
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- REAL MATCHES
-- Actual WC matches. Linked to a scoring round. FotMob match
-- ID for ratings ingestion.
-- ============================================================

create table fm_real_match (
  id             uuid primary key default gen_random_uuid(),
  scoring_round_id uuid not null references fm_scoring_round on delete cascade,
  home_team_id   uuid not null references fm_national_team on delete restrict,
  away_team_id   uuid not null references fm_national_team on delete restrict,
  kickoff_at     timestamptz not null,
  home_score     int,
  away_score     int,
  result         fm_match_result,
  status         fm_match_status not null default 'scheduled',
  fotmob_match_id bigint,
  fotmob_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (scoring_round_id, home_team_id, away_team_id),
  constraint chk_fm_match_teams_distinct check (home_team_id <> away_team_id)
);

create index idx_fm_real_match_round on fm_real_match (scoring_round_id);
create index idx_fm_real_match_fotmob on fm_real_match (fotmob_match_id) where fotmob_match_id is not null;

create trigger fm_real_match_updated_at
  before update on fm_real_match
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- FANTASY TEAMS
-- One row per (competition, user). Created by admin invitation.
-- name is the public team name shown on the leaderboard.
-- ============================================================

create table fm_fantasy_team (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references fm_competition on delete cascade,
  manager_id     uuid not null references profiles on delete restrict,
  name           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, manager_id),
  unique (competition_id, name)
);

create index idx_fm_fantasy_team_manager on fm_fantasy_team (manager_id);

create trigger fm_fantasy_team_updated_at
  before update on fm_fantasy_team
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PHASE SQUAD (25-man pool + coach for one phase)
-- Drafts are mutable until phase squad_lock_at. After lock,
-- mutations are admin-only and audited.
-- ============================================================

create table fm_phase_squad (
  id             uuid primary key default gen_random_uuid(),
  phase_id       uuid not null references fm_phase on delete cascade,
  fantasy_team_id uuid not null references fm_fantasy_team on delete cascade,
  coach_id       uuid references fm_coach on delete set null,
  budget_total   int not null,
  budget_spent   int not null default 0,
  status         fm_squad_status not null default 'draft',
  submitted_at   timestamptz,
  locked_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (phase_id, fantasy_team_id),
  constraint chk_fm_phase_squad_budget check (budget_spent >= 0 and budget_spent <= budget_total)
);

create index idx_fm_phase_squad_phase on fm_phase_squad (phase_id);
create index idx_fm_phase_squad_team on fm_phase_squad (fantasy_team_id);

create trigger fm_phase_squad_updated_at
  before update on fm_phase_squad
  for each row execute procedure update_updated_at_column();

create table fm_phase_squad_player (
  id             uuid primary key default gen_random_uuid(),
  phase_squad_id uuid not null references fm_phase_squad on delete cascade,
  player_id      uuid not null references fm_player on delete restrict,
  purchase_price int not null,
  created_at     timestamptz not null default now(),
  unique (phase_squad_id, player_id),
  constraint chk_fm_squad_player_price check (purchase_price >= 0)
);

create index idx_fm_phase_squad_player_squad on fm_phase_squad_player (phase_squad_id);
create index idx_fm_phase_squad_player_player on fm_phase_squad_player (player_id);

-- ============================================================
-- MATCHDAY LINEUP (XI + formation, per scoring round)
-- Drafted from the phase squad. Hidden until round lock_at.
-- A bench is implicit: any phase squad player not in the XI.
-- formation is stored as text (e.g., "4-3-3") and validated
-- against fm_competition_config.formations.
-- ============================================================

create table fm_matchday_lineup (
  id             uuid primary key default gen_random_uuid(),
  scoring_round_id uuid not null references fm_scoring_round on delete cascade,
  fantasy_team_id uuid not null references fm_fantasy_team on delete cascade,
  phase_squad_id uuid not null references fm_phase_squad on delete cascade,
  formation      text not null,
  status         fm_lineup_status not null default 'draft',
  submitted_at   timestamptz,
  locked_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (scoring_round_id, fantasy_team_id)
);

create index idx_fm_matchday_lineup_round on fm_matchday_lineup (scoring_round_id);
create index idx_fm_matchday_lineup_team on fm_matchday_lineup (fantasy_team_id);

create trigger fm_matchday_lineup_updated_at
  before update on fm_matchday_lineup
  for each row execute procedure update_updated_at_column();

create table fm_matchday_lineup_player (
  id               uuid primary key default gen_random_uuid(),
  lineup_id        uuid not null references fm_matchday_lineup on delete cascade,
  player_id        uuid not null references fm_player on delete restrict,
  slot_position    text not null,
  slot_order       int not null,
  is_starter       boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (lineup_id, player_id),
  unique (lineup_id, slot_order)
);

create index idx_fm_md_lineup_player_lineup on fm_matchday_lineup_player (lineup_id);

-- ============================================================
-- ROUND OWNERSHIP
-- Computed at round lock_at. ownership_pct = teams_owning /
-- teams_total. Drives popularity penalty + MVP bonus brackets.
-- Stored once per round, never recomputed (immutable snapshot).
-- ============================================================

create table fm_round_player_ownership (
  id                uuid primary key default gen_random_uuid(),
  scoring_round_id  uuid not null references fm_scoring_round on delete cascade,
  player_id         uuid not null references fm_player on delete restrict,
  teams_owning      int not null,
  teams_total       int not null,
  ownership_pct     numeric(6,3) not null,
  created_at        timestamptz not null default now(),
  unique (scoring_round_id, player_id),
  constraint chk_fm_ownership_counts check (teams_owning >= 0 and teams_total > 0 and teams_owning <= teams_total),
  constraint chk_fm_ownership_pct check (ownership_pct >= 0 and ownership_pct <= 100)
);

create index idx_fm_round_ownership_round on fm_round_player_ownership (scoring_round_id);

-- ============================================================
-- PLAYER MATCH STATS
-- Raw ingested data per (player, real_match). Populated by
-- FotMob ingest or manual admin entry.
-- ============================================================

create table fm_player_match_stats (
  id              uuid primary key default gen_random_uuid(),
  real_match_id   uuid not null references fm_real_match on delete cascade,
  player_id       uuid not null references fm_player on delete restrict,
  minutes_played  int not null default 0,
  fotmob_rating   numeric(4,2),
  goals           int not null default 0,
  assists         int not null default 0,
  yellow_cards    int not null default 0,
  red_cards       int not null default 0,
  penalties_saved int not null default 0,
  penalties_missed int not null default 0,
  own_goals       int not null default 0,
  clean_sheet     boolean not null default false,
  goals_conceded  int not null default 0,
  is_mvp          boolean not null default false,
  raw_payload     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (real_match_id, player_id),
  constraint chk_fm_pms_minutes check (minutes_played >= 0 and minutes_played <= 130),
  constraint chk_fm_pms_rating check (fotmob_rating is null or (fotmob_rating >= 0 and fotmob_rating <= 10))
);

create index idx_fm_pms_match on fm_player_match_stats (real_match_id);
create index idx_fm_pms_player on fm_player_match_stats (player_id);

create trigger fm_player_match_stats_updated_at
  before update on fm_player_match_stats
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- PLAYER MATCH SCORE
-- Calculated per (player, real_match). Stores the full
-- breakdown so the UI can render an explainable score.
-- calc_snapshot freezes the config blob in use at calc time
-- so historical scores stay reproducible.
-- ============================================================

create table fm_player_match_score (
  id                   uuid primary key default gen_random_uuid(),
  scoring_round_id     uuid not null references fm_scoring_round on delete cascade,
  real_match_id        uuid not null references fm_real_match on delete cascade,
  player_id            uuid not null references fm_player on delete restrict,
  base_rating          numeric(5,2),
  z_fotmob             numeric(6,3),
  voto_base            numeric(5,2),
  football_bonus       numeric(5,2) not null default 0,
  football_malus       numeric(5,2) not null default 0,
  raw_subtotal         numeric(6,2) not null default 0,
  ownership_pct        numeric(6,3) not null default 0,
  mvp_bonus_pct        numeric(6,3) not null default 0,
  mvp_bonus_amount     numeric(6,2) not null default 0,
  popularity_penalty_pct numeric(6,3) not null default 0,
  popularity_penalty_amount numeric(6,2) not null default 0,
  final_score          numeric(6,2) not null default 0,
  calc_snapshot        jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (scoring_round_id, player_id, real_match_id)
);

create index idx_fm_pms_score_round on fm_player_match_score (scoring_round_id);
create index idx_fm_pms_score_player on fm_player_match_score (player_id);

create trigger fm_player_match_score_updated_at
  before update on fm_player_match_score
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- COACH MATCH SCORE
-- One row per (coach, real_match). The coach scores for every
-- match his team plays in a round, even if the user fielded
-- the coach for a different national team (they didn't —
-- coaches are tied to fantasy_team via fm_phase_squad.coach_id,
-- so a coach score is consumed once per round per fantasy team
-- via fm_fantasy_team_round_score below).
-- ============================================================

create table fm_coach_match_score (
  id              uuid primary key default gen_random_uuid(),
  scoring_round_id uuid not null references fm_scoring_round on delete cascade,
  real_match_id   uuid not null references fm_real_match on delete cascade,
  coach_id        uuid not null references fm_coach on delete restrict,
  team_tier       fm_team_tier not null,
  match_result    fm_match_result not null,
  bonus_or_malus  numeric(5,2) not null,
  final_score     numeric(5,2) not null,
  calc_snapshot   jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (real_match_id, coach_id)
);

create index idx_fm_coach_score_round on fm_coach_match_score (scoring_round_id);

create trigger fm_coach_match_score_updated_at
  before update on fm_coach_match_score
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- FANTASY TEAM ROUND SCORE
-- Aggregated per (fantasy_team, scoring_round). Sum of XI
-- player final_scores + coach final_score. raw_total feeds the
-- Battle Royale matchup engine. br_points accumulates wins.
-- ============================================================

create table fm_fantasy_team_round_score (
  id                uuid primary key default gen_random_uuid(),
  scoring_round_id  uuid not null references fm_scoring_round on delete cascade,
  fantasy_team_id   uuid not null references fm_fantasy_team on delete cascade,
  player_total      numeric(7,2) not null default 0,
  coach_total       numeric(6,2) not null default 0,
  raw_total         numeric(7,2) not null default 0,
  goals_scored      int not null default 0,
  br_wins           int not null default 0,
  br_draws          int not null default 0,
  br_losses         int not null default 0,
  br_points         int not null default 0,
  rank_in_round     int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (scoring_round_id, fantasy_team_id)
);

create index idx_fm_ft_round_score_round on fm_fantasy_team_round_score (scoring_round_id);
create index idx_fm_ft_round_score_team on fm_fantasy_team_round_score (fantasy_team_id);

create trigger fm_fantasy_team_round_score_updated_at
  before update on fm_fantasy_team_round_score
  for each row execute procedure update_updated_at_column();

-- ============================================================
-- BATTLE ROYALE MATCHUPS
-- One row per (round, team_a, team_b) ordered pair where
-- team_a.id < team_b.id (lexicographic) to avoid duplicates.
-- ============================================================

create table fm_battle_royale_matchup (
  id                uuid primary key default gen_random_uuid(),
  scoring_round_id  uuid not null references fm_scoring_round on delete cascade,
  team_a_id         uuid not null references fm_fantasy_team on delete cascade,
  team_b_id         uuid not null references fm_fantasy_team on delete cascade,
  team_a_score      numeric(7,2) not null,
  team_b_score      numeric(7,2) not null,
  team_a_goals      int not null,
  team_b_goals      int not null,
  result            fm_match_result not null,
  team_a_points     int not null,
  team_b_points     int not null,
  created_at        timestamptz not null default now(),
  unique (scoring_round_id, team_a_id, team_b_id),
  constraint chk_fm_br_teams_distinct check (team_a_id <> team_b_id),
  constraint chk_fm_br_team_order check (team_a_id < team_b_id)
);

create index idx_fm_br_round on fm_battle_royale_matchup (scoring_round_id);

-- ============================================================
-- COMPETITION STANDING
-- Cumulative leaderboard. Recomputed after every round publish.
-- Stores both BR points and raw score for tie-breakers.
-- ============================================================

create table fm_competition_standing (
  id                uuid primary key default gen_random_uuid(),
  competition_id    uuid not null references fm_competition on delete cascade,
  fantasy_team_id   uuid not null references fm_fantasy_team on delete cascade,
  br_points_total   int not null default 0,
  raw_score_total   numeric(9,2) not null default 0,
  round_wins        int not null default 0,
  mvp_bonus_total   numeric(7,2) not null default 0,
  popularity_penalty_total numeric(7,2) not null default 0,
  best_round_score  numeric(7,2) not null default 0,
  rank              int,
  computed_at       timestamptz not null default now(),
  unique (competition_id, fantasy_team_id)
);

create index idx_fm_standing_competition on fm_competition_standing (competition_id);

-- ============================================================
-- AUDIT LOG
-- All meaningful state changes. Lightweight: actor + action +
-- entity ref + payload JSONB. Read-only for managers.
-- ============================================================

create table fm_audit_log (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid references fm_competition on delete cascade,
  actor_id        uuid references profiles on delete set null,
  action          fm_audit_action not null,
  entity_type     text,
  entity_id       uuid,
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create index idx_fm_audit_competition on fm_audit_log (competition_id, created_at desc);
create index idx_fm_audit_actor on fm_audit_log (actor_id, created_at desc);
