-- ============================================================
-- Migration 018: Live score tables
-- ============================================================
-- live_scores: one row per (matchday, team) — the running
--   team fantavoto with bench subs applied.
-- live_player_scores: one row per (matchday, team, player) —
--   per-player breakdown used in the detail panel.
--
-- Both tables are upserted by the cron job and the manual
-- "Aggiorna ora" trigger. Managers can read; only admins and
-- the service role can write.
-- ============================================================

create table live_scores (
  matchday_id      uuid        not null references matchdays(id) on delete cascade,
  team_id          uuid        not null references fantasy_teams(id) on delete cascade,
  league_id        uuid        not null references leagues(id) on delete cascade,
  total_fantavoto  numeric(6,2) not null default 0,
  player_count     int         not null default 0,
  nv_count         int         not null default 0,
  refreshed_at     timestamptz not null default now(),
  primary key (matchday_id, team_id)
);

create table live_player_scores (
  matchday_id          uuid        not null references matchdays(id) on delete cascade,
  team_id              uuid        not null references fantasy_teams(id) on delete cascade,
  player_id            uuid        not null references league_players(id) on delete cascade,
  assigned_mantra_role text,
  is_bench             boolean     not null default false,
  bench_order          int,
  -- 'active'       = starter who played
  -- 'nv_subbed'    = NV starter replaced by bench
  -- 'nv_no_sub'    = NV starter with no available sub
  -- 'bench_used'   = bench player who came on
  -- 'bench_unused' = bench player who didn't come on
  -- 'bench_nv'     = bench player who was NV
  sub_status           text        not null default 'active',
  extended_penalty     numeric(3,1) not null default 0,
  voto_base            numeric(4,2),
  fantavoto            numeric(5,2),
  sofascore_rating     numeric(4,2),
  fotmob_rating        numeric(4,2),
  minutes_played       int         not null default 0,
  goals_scored         int         not null default 0,
  assists              int         not null default 0,
  yellow_cards         int         not null default 0,
  red_cards            int         not null default 0,
  own_goals            int         not null default 0,
  penalties_scored     int         not null default 0,
  saves                int         not null default 0,
  goals_conceded       int         not null default 0,
  refreshed_at         timestamptz not null default now(),
  primary key (matchday_id, team_id, player_id)
);

create index idx_live_scores_matchday  on live_scores        (matchday_id);
create index idx_live_scores_league    on live_scores        (league_id);
create index idx_live_player_matchday  on live_player_scores (matchday_id);
create index idx_live_player_team      on live_player_scores (matchday_id, team_id);

-- ── RLS ────────────────────────────────────────────────────────

alter table live_scores        enable row level security;
alter table live_player_scores enable row level security;

-- Any league member can read live scores for their league
create policy "league_members_read_live_scores"
  on live_scores for select
  using (
    exists (
      select 1 from league_users
      where league_users.league_id = live_scores.league_id
        and league_users.user_id = auth.uid()
    )
  );

create policy "league_members_read_live_player_scores"
  on live_player_scores for select
  using (
    exists (
      select 1 from live_scores ls
      join league_users lu on lu.league_id = ls.league_id
      where ls.matchday_id = live_player_scores.matchday_id
        and ls.team_id     = live_player_scores.team_id
        and lu.user_id     = auth.uid()
    )
  );

-- League admins can write (manual trigger from server action)
create policy "league_admin_write_live_scores"
  on live_scores for all
  using (
    exists (
      select 1 from league_users
      where league_users.league_id = live_scores.league_id
        and league_users.user_id   = auth.uid()
        and league_users.role      = 'league_admin'
    )
  );

create policy "league_admin_write_live_player_scores"
  on live_player_scores for all
  using (
    exists (
      select 1 from live_scores ls
      join league_users lu on lu.league_id = ls.league_id
      where ls.matchday_id = live_player_scores.matchday_id
        and ls.team_id     = live_player_scores.team_id
        and lu.user_id     = auth.uid()
        and lu.role        = 'league_admin'
    )
  );
