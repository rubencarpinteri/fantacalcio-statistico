-- Stores external fixture IDs per matchday for automated rating fetching.
-- A single Serie A matchday typically maps to ~10 fixtures across FotMob + SofaScore.
create table matchday_fixtures (
  id                 uuid primary key default gen_random_uuid(),
  matchday_id        uuid not null references matchdays(id) on delete cascade,
  fotmob_match_id    bigint,
  sofascore_event_id bigint,
  label              text not null default '',
  created_at         timestamptz not null default now(),
  constraint chk_fixture_has_at_least_one_id
    check (fotmob_match_id is not null or sofascore_event_id is not null)
);

create index idx_matchday_fixtures_matchday on matchday_fixtures (matchday_id);

alter table matchday_fixtures enable row level security;

create policy "matchday_fixtures: league_admin manage"
  on matchday_fixtures for all
  using (
    exists (
      select 1 from matchdays m
      join league_users lu on lu.league_id = m.league_id
      where m.id = matchday_fixtures.matchday_id
        and lu.user_id = auth.uid()
        and lu.role = 'league_admin'
    )
  );

create policy "matchday_fixtures: member read"
  on matchday_fixtures for select
  using (
    exists (
      select 1 from matchdays m
      join league_users lu on lu.league_id = m.league_id
      where m.id = matchday_fixtures.matchday_id
        and lu.user_id = auth.uid()
    )
  );
