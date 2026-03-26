-- Migration 020: H2H matchups for campionato
create table competition_matchups (
  id              uuid         primary key default gen_random_uuid(),
  competition_id  uuid         not null references competitions(id) on delete cascade,
  round_number    int          not null,
  home_team_id    uuid         not null references fantasy_teams(id) on delete cascade,
  away_team_id    uuid         not null references fantasy_teams(id) on delete cascade,
  home_fantavoto  numeric(6,2),
  away_fantavoto  numeric(6,2),
  result          text         check (result in ('1', 'X', '2')),
  computed_at     timestamptz,
  created_at      timestamptz  not null default now(),
  constraint uq_matchup_home unique (competition_id, round_number, home_team_id),
  constraint uq_matchup_away unique (competition_id, round_number, away_team_id)
);
create index idx_competition_matchups_comp  on competition_matchups (competition_id);
create index idx_competition_matchups_round on competition_matchups (competition_id, round_number);
alter table matchdays add column if not exists round_number int;
alter table competition_matchups enable row level security;
create policy "competition_matchups: league members read" on competition_matchups for select using (exists (select 1 from competitions c join league_users lu on lu.league_id = c.league_id where c.id = competition_matchups.competition_id and lu.user_id = auth.uid()));
create policy "competition_matchups: league admin write" on competition_matchups for all using (exists (select 1 from competitions c join league_users lu on lu.league_id = c.league_id where c.id = competition_matchups.competition_id and lu.user_id = auth.uid() and lu.role = 'league_admin'));
