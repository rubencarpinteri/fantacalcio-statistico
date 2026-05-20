-- ============================================================
-- Drop all remaining fotmob_* / sofascore_* ID columns. SportMonks
-- equivalents (sportmonks_*_id) are the canonical references now.
-- ============================================================

-- serie_a_players: drop external IDs that nothing reads
alter table public.serie_a_players drop column if exists fotmob_id;
alter table public.serie_a_players drop column if exists sofascore_id;

-- league_players: drop fotmob_player_id and its index
drop index if exists public.idx_league_players_fotmob;
alter table public.league_players drop column if exists fotmob_player_id;

-- matchday_fixtures: drop fotmob_match_id. sportmonks_fixture_id is the
-- new key. Tighten the constraint so every fixture must have one.
alter table public.matchday_fixtures drop column if exists fotmob_match_id;
alter table public.matchday_fixtures drop constraint if exists chk_fixture_has_at_least_one_id;
alter table public.matchday_fixtures
  add constraint matchday_fixtures_sportmonks_fixture_id_not_null
  check (sportmonks_fixture_id is not null) not valid;

-- fm_national_team: drop fotmob_team_id
alter table public.fm_national_team drop column if exists fotmob_team_id;

-- fm_coach: drop fotmob_coach_id
alter table public.fm_coach drop column if exists fotmob_coach_id;

-- fm_player: drop fotmob_player_id, its unique constraint and index,
-- and add an equivalent unique constraint on sportmonks_player_id.
drop index if exists public.idx_fm_player_fotmob;
alter table public.fm_player drop constraint if exists fm_player_competition_id_fotmob_player_id_key;
alter table public.fm_player drop column if exists fotmob_player_id;
create unique index if not exists fm_player_competition_sportmonks_uniq
  on public.fm_player (competition_id, sportmonks_player_id)
  where sportmonks_player_id is not null;
