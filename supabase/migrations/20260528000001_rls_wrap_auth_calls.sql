-- Wrap auth.<fn>() in subselects across 53 RLS policies to eliminate
-- auth_rls_initplan performance warnings (re-evaluation per row).
-- Logic is identical; just changes how Postgres evaluates the call.

BEGIN;

-- competition_fixtures.competition_fixtures_admin_all
DROP POLICY "competition_fixtures_admin_all" ON public.competition_fixtures;
CREATE POLICY "competition_fixtures_admin_all" ON public.competition_fixtures
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_fixtures.competition_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competition_fixtures.competition_fixtures_read
DROP POLICY "competition_fixtures_read" ON public.competition_fixtures;
CREATE POLICY "competition_fixtures_read" ON public.competition_fixtures
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_fixtures.competition_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- competition_matchups.competition_matchups: league admin write
DROP POLICY "competition_matchups: league admin write" ON public.competition_matchups;
CREATE POLICY "competition_matchups: league admin write" ON public.competition_matchups
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_matchups.competition_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competition_matchups.competition_matchups: league members read
DROP POLICY "competition_matchups: league members read" ON public.competition_matchups;
CREATE POLICY "competition_matchups: league members read" ON public.competition_matchups
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_matchups.competition_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- competition_rounds.competition_rounds_admin_all
DROP POLICY "competition_rounds_admin_all" ON public.competition_rounds;
CREATE POLICY "competition_rounds_admin_all" ON public.competition_rounds
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_rounds.competition_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competition_rounds.competition_rounds_read
DROP POLICY "competition_rounds_read" ON public.competition_rounds;
CREATE POLICY "competition_rounds_read" ON public.competition_rounds
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_rounds.competition_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- competition_standings_snapshots.comp_standings_admin_insert
DROP POLICY "comp_standings_admin_insert" ON public.competition_standings_snapshots;
CREATE POLICY "comp_standings_admin_insert" ON public.competition_standings_snapshots
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = competition_standings_snapshots.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competition_standings_snapshots.comp_standings_read
DROP POLICY "comp_standings_read" ON public.competition_standings_snapshots;
CREATE POLICY "comp_standings_read" ON public.competition_standings_snapshots
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = competition_standings_snapshots.league_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- competition_teams.competition_teams_admin_all
DROP POLICY "competition_teams_admin_all" ON public.competition_teams;
CREATE POLICY "competition_teams_admin_all" ON public.competition_teams
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_teams.competition_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competition_teams.competition_teams_read
DROP POLICY "competition_teams_read" ON public.competition_teams;
CREATE POLICY "competition_teams_read" ON public.competition_teams
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (competitions c
     JOIN league_users lu ON ((lu.league_id = c.league_id)))
  WHERE ((c.id = competition_teams.competition_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- competitions.competitions_admin_all
DROP POLICY "competitions_admin_all" ON public.competitions;
CREATE POLICY "competitions_admin_all" ON public.competitions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = competitions.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- competitions.competitions_read
DROP POLICY "competitions_read" ON public.competitions;
CREATE POLICY "competitions_read" ON public.competitions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = competitions.league_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- fm_league_competition.fm_league_competition: league admin write
DROP POLICY "fm_league_competition: league admin write" ON public.fm_league_competition;
CREATE POLICY "fm_league_competition: league admin write" ON public.fm_league_competition
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = fm_league_competition.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role))))))
  WITH CHECK ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = fm_league_competition.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role))))));

-- fm_league_competition.fm_league_competition: members and admin read
DROP POLICY "fm_league_competition: members and admin read" ON public.fm_league_competition;
CREATE POLICY "fm_league_competition: members and admin read" ON public.fm_league_competition
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((is_super_admin() OR (EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = fm_league_competition.league_id) AND (lu.user_id = (SELECT auth.uid())))))));

-- fm_matchday_lineup.fm_matchday_lineup: own insert while draft
DROP POLICY "fm_matchday_lineup: own insert while draft" ON public.fm_matchday_lineup;
CREATE POLICY "fm_matchday_lineup: own insert while draft" ON public.fm_matchday_lineup
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = 'draft'::fm_lineup_status)));

-- fm_matchday_lineup.fm_matchday_lineup: own read
DROP POLICY "fm_matchday_lineup: own read" ON public.fm_matchday_lineup;
CREATE POLICY "fm_matchday_lineup: own read" ON public.fm_matchday_lineup
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))));

-- fm_matchday_lineup.fm_matchday_lineup: own update while draft
DROP POLICY "fm_matchday_lineup: own update while draft" ON public.fm_matchday_lineup;
CREATE POLICY "fm_matchday_lineup: own update while draft" ON public.fm_matchday_lineup
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = ANY (ARRAY['draft'::fm_lineup_status, 'submitted'::fm_lineup_status]))))
  WITH CHECK (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = ANY (ARRAY['draft'::fm_lineup_status, 'submitted'::fm_lineup_status]))));

-- fm_matchday_lineup_player.fm_matchday_lineup_player: own read
DROP POLICY "fm_matchday_lineup_player: own read" ON public.fm_matchday_lineup_player;
CREATE POLICY "fm_matchday_lineup_player: own read" ON public.fm_matchday_lineup_player
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((lineup_id IN ( SELECT l.id
   FROM (fm_matchday_lineup l
     JOIN fm_fantasy_team t ON ((t.id = l.fantasy_team_id)))
  WHERE (t.manager_id = (SELECT auth.uid())))));

-- fm_matchday_lineup_player.fm_matchday_lineup_player: own write while draft
DROP POLICY "fm_matchday_lineup_player: own write while draft" ON public.fm_matchday_lineup_player;
CREATE POLICY "fm_matchday_lineup_player: own write while draft" ON public.fm_matchday_lineup_player
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((lineup_id IN ( SELECT l.id
   FROM (fm_matchday_lineup l
     JOIN fm_fantasy_team t ON ((t.id = l.fantasy_team_id)))
  WHERE ((t.manager_id = (SELECT auth.uid())) AND (l.status = ANY (ARRAY['draft'::fm_lineup_status, 'submitted'::fm_lineup_status]))))))
  WITH CHECK ((lineup_id IN ( SELECT l.id
   FROM (fm_matchday_lineup l
     JOIN fm_fantasy_team t ON ((t.id = l.fantasy_team_id)))
  WHERE ((t.manager_id = (SELECT auth.uid())) AND (l.status = ANY (ARRAY['draft'::fm_lineup_status, 'submitted'::fm_lineup_status]))))));

-- fm_phase_squad.fm_phase_squad: own insert while draft
DROP POLICY "fm_phase_squad: own insert while draft" ON public.fm_phase_squad;
CREATE POLICY "fm_phase_squad: own insert while draft" ON public.fm_phase_squad
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = 'draft'::fm_squad_status)));

-- fm_phase_squad.fm_phase_squad: own read
DROP POLICY "fm_phase_squad: own read" ON public.fm_phase_squad;
CREATE POLICY "fm_phase_squad: own read" ON public.fm_phase_squad
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))));

-- fm_phase_squad.fm_phase_squad: own update while draft
DROP POLICY "fm_phase_squad: own update while draft" ON public.fm_phase_squad;
CREATE POLICY "fm_phase_squad: own update while draft" ON public.fm_phase_squad
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = ANY (ARRAY['draft'::fm_squad_status, 'submitted'::fm_squad_status]))))
  WITH CHECK (((fantasy_team_id IN ( SELECT fm_fantasy_team.id
   FROM fm_fantasy_team
  WHERE (fm_fantasy_team.manager_id = (SELECT auth.uid())))) AND (status = ANY (ARRAY['draft'::fm_squad_status, 'submitted'::fm_squad_status]))));

-- fm_phase_squad_player.fm_phase_squad_player: own read
DROP POLICY "fm_phase_squad_player: own read" ON public.fm_phase_squad_player;
CREATE POLICY "fm_phase_squad_player: own read" ON public.fm_phase_squad_player
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((phase_squad_id IN ( SELECT s.id
   FROM (fm_phase_squad s
     JOIN fm_fantasy_team t ON ((t.id = s.fantasy_team_id)))
  WHERE (t.manager_id = (SELECT auth.uid())))));

-- fm_phase_squad_player.fm_phase_squad_player: own write while draft
DROP POLICY "fm_phase_squad_player: own write while draft" ON public.fm_phase_squad_player;
CREATE POLICY "fm_phase_squad_player: own write while draft" ON public.fm_phase_squad_player
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING ((phase_squad_id IN ( SELECT s.id
   FROM (fm_phase_squad s
     JOIN fm_fantasy_team t ON ((t.id = s.fantasy_team_id)))
  WHERE ((t.manager_id = (SELECT auth.uid())) AND (s.status = ANY (ARRAY['draft'::fm_squad_status, 'submitted'::fm_squad_status]))))))
  WITH CHECK ((phase_squad_id IN ( SELECT s.id
   FROM (fm_phase_squad s
     JOIN fm_fantasy_team t ON ((t.id = s.fantasy_team_id)))
  WHERE ((t.manager_id = (SELECT auth.uid())) AND (s.status = ANY (ARRAY['draft'::fm_squad_status, 'submitted'::fm_squad_status]))))));

-- league_engine_config.lec_admin_all
DROP POLICY "lec_admin_all" ON public.league_engine_config;
CREATE POLICY "lec_admin_all" ON public.league_engine_config
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = league_engine_config.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- league_engine_config.lec_member_read
DROP POLICY "lec_member_read" ON public.league_engine_config;
CREATE POLICY "lec_member_read" ON public.league_engine_config
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = league_engine_config.league_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- league_users.league_users: member read own
DROP POLICY "league_users: member read own" ON public.league_users;
CREATE POLICY "league_users: member read own" ON public.league_users
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((user_id = (SELECT auth.uid())) OR is_super_admin()));

-- lineup_current_pointers.lineup_current_pointers: manager read own
DROP POLICY "lineup_current_pointers: manager read own" ON public.lineup_current_pointers;
CREATE POLICY "lineup_current_pointers: manager read own" ON public.lineup_current_pointers
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM fantasy_teams ft
  WHERE ((ft.id = lineup_current_pointers.team_id) AND (ft.manager_id = (SELECT auth.uid()))))) OR is_super_admin()));

-- lineup_current_pointers.lineup_current_pointers: manager upsert own before lock
DROP POLICY "lineup_current_pointers: manager upsert own before lock" ON public.lineup_current_pointers;
CREATE POLICY "lineup_current_pointers: manager upsert own before lock" ON public.lineup_current_pointers
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (fantasy_teams ft
     JOIN matchdays m ON ((m.id = lineup_current_pointers.matchday_id)))
  WHERE ((ft.id = lineup_current_pointers.team_id) AND (ft.manager_id = (SELECT auth.uid())) AND (m.status = 'open'::matchday_status)))));

-- lineup_submission_players.lineup_submission_players: manager insert
DROP POLICY "lineup_submission_players: manager insert" ON public.lineup_submission_players;
CREATE POLICY "lineup_submission_players: manager insert" ON public.lineup_submission_players
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM ((lineup_submissions ls
     JOIN fantasy_teams ft ON ((ft.id = ls.team_id)))
     JOIN matchdays m ON ((m.id = ls.matchday_id)))
  WHERE ((ls.id = lineup_submission_players.submission_id) AND (ft.manager_id = (SELECT auth.uid())) AND (m.status = 'open'::matchday_status)))));

-- lineup_submission_players.lineup_submission_players: manager read own
DROP POLICY "lineup_submission_players: manager read own" ON public.lineup_submission_players;
CREATE POLICY "lineup_submission_players: manager read own" ON public.lineup_submission_players
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM (lineup_submissions ls
     JOIN fantasy_teams ft ON ((ft.id = ls.team_id)))
  WHERE ((ls.id = lineup_submission_players.submission_id) AND (ft.manager_id = (SELECT auth.uid()))))) OR is_super_admin()));

-- lineup_submissions.lineup_submissions: manager insert before lock
DROP POLICY "lineup_submissions: manager insert before lock" ON public.lineup_submissions;
CREATE POLICY "lineup_submissions: manager insert before lock" ON public.lineup_submissions
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (fantasy_teams ft
     JOIN matchdays m ON ((m.id = lineup_submissions.matchday_id)))
  WHERE ((ft.id = lineup_submissions.team_id) AND (ft.manager_id = (SELECT auth.uid())) AND (m.status = 'open'::matchday_status)))));

-- lineup_submissions.lineup_submissions: manager read own
DROP POLICY "lineup_submissions: manager read own" ON public.lineup_submissions;
CREATE POLICY "lineup_submissions: manager read own" ON public.lineup_submissions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((EXISTS ( SELECT 1
   FROM fantasy_teams ft
  WHERE ((ft.id = lineup_submissions.team_id) AND (ft.manager_id = (SELECT auth.uid()))))) OR is_super_admin()));

-- live_player_scores.league_admin_write_live_player_scores
DROP POLICY "league_admin_write_live_player_scores" ON public.live_player_scores;
CREATE POLICY "league_admin_write_live_player_scores" ON public.live_player_scores
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (live_scores ls
     JOIN league_users lu ON ((lu.league_id = ls.league_id)))
  WHERE ((ls.matchday_id = live_player_scores.matchday_id) AND (ls.team_id = live_player_scores.team_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- live_player_scores.league_members_read_live_player_scores
DROP POLICY "league_members_read_live_player_scores" ON public.live_player_scores;
CREATE POLICY "league_members_read_live_player_scores" ON public.live_player_scores
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (live_scores ls
     JOIN league_users lu ON ((lu.league_id = ls.league_id)))
  WHERE ((ls.matchday_id = live_player_scores.matchday_id) AND (ls.team_id = live_player_scores.team_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- live_scores.league_admin_write_live_scores
DROP POLICY "league_admin_write_live_scores" ON public.live_scores;
CREATE POLICY "league_admin_write_live_scores" ON public.live_scores
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users
  WHERE ((league_users.league_id = live_scores.league_id) AND (league_users.user_id = (SELECT auth.uid())) AND (league_users.role = 'league_admin'::league_role)))));

-- live_scores.league_members_read_live_scores
DROP POLICY "league_members_read_live_scores" ON public.live_scores;
CREATE POLICY "league_members_read_live_scores" ON public.live_scores
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users
  WHERE ((league_users.league_id = live_scores.league_id) AND (league_users.user_id = (SELECT auth.uid()))))));

-- matchday_fixtures.matchday_fixtures: league_admin manage
DROP POLICY "matchday_fixtures: league_admin manage" ON public.matchday_fixtures;
CREATE POLICY "matchday_fixtures: league_admin manage" ON public.matchday_fixtures
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_fixtures.matchday_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- matchday_fixtures.matchday_fixtures: member read
DROP POLICY "matchday_fixtures: member read" ON public.matchday_fixtures;
CREATE POLICY "matchday_fixtures: member read" ON public.matchday_fixtures
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_fixtures.matchday_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- matchday_lineups.league admins can write matchday_lineups
DROP POLICY "league admins can write matchday_lineups" ON public.matchday_lineups;
CREATE POLICY "league admins can write matchday_lineups" ON public.matchday_lineups
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((league_id IN ( SELECT league_users.league_id
   FROM league_users
  WHERE ((league_users.user_id = (SELECT auth.uid())) AND (league_users.role = 'league_admin'::league_role)))));

-- matchday_lineups.league members can read matchday_lineups
DROP POLICY "league members can read matchday_lineups" ON public.matchday_lineups;
CREATE POLICY "league members can read matchday_lineups" ON public.matchday_lineups
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((league_id IN ( SELECT league_users.league_id
   FROM league_users
  WHERE (league_users.user_id = (SELECT auth.uid())))));

-- matchday_player_ownership.matchday_player_ownership_insert
DROP POLICY "matchday_player_ownership_insert" ON public.matchday_player_ownership;
CREATE POLICY "matchday_player_ownership_insert" ON public.matchday_player_ownership
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_ownership.matchday_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- matchday_player_ownership.matchday_player_ownership_select
DROP POLICY "matchday_player_ownership_select" ON public.matchday_player_ownership;
CREATE POLICY "matchday_player_ownership_select" ON public.matchday_player_ownership
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_ownership.matchday_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- matchday_player_prices.matchday_player_prices_delete
DROP POLICY "matchday_player_prices_delete" ON public.matchday_player_prices;
CREATE POLICY "matchday_player_prices_delete" ON public.matchday_player_prices
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_prices.matchday_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- matchday_player_prices.matchday_player_prices_insert
DROP POLICY "matchday_player_prices_insert" ON public.matchday_player_prices;
CREATE POLICY "matchday_player_prices_insert" ON public.matchday_player_prices
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_prices.matchday_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- matchday_player_prices.matchday_player_prices_select
DROP POLICY "matchday_player_prices_select" ON public.matchday_player_prices;
CREATE POLICY "matchday_player_prices_select" ON public.matchday_player_prices
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_prices.matchday_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- matchday_player_prices.matchday_player_prices_update
DROP POLICY "matchday_player_prices_update" ON public.matchday_player_prices;
CREATE POLICY "matchday_player_prices_update" ON public.matchday_player_prices
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (matchdays m
     JOIN league_users lu ON ((lu.league_id = m.league_id)))
  WHERE ((m.id = matchday_player_prices.matchday_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- profiles.profiles: league_admin read members
DROP POLICY "profiles: league_admin read members" ON public.profiles;
CREATE POLICY "profiles: league_admin read members" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM (league_users lu_actor
     JOIN league_users lu_target ON ((lu_actor.league_id = lu_target.league_id)))
  WHERE ((lu_actor.user_id = (SELECT auth.uid())) AND (lu_actor.role = 'league_admin'::league_role) AND (lu_target.user_id = profiles.id)))));

-- profiles.profiles: own read
DROP POLICY "profiles: own read" ON public.profiles;
CREATE POLICY "profiles: own read" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((id = (SELECT auth.uid())) OR is_super_admin()));

-- profiles.profiles: own update
DROP POLICY "profiles: own update" ON public.profiles;
CREATE POLICY "profiles: own update" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((id = (SELECT auth.uid())) OR is_super_admin()));

-- published_team_scores.pts_admin_write
DROP POLICY "pts_admin_write" ON public.published_team_scores;
CREATE POLICY "pts_admin_write" ON public.published_team_scores
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = published_team_scores.league_id) AND (lu.user_id = (SELECT auth.uid())) AND (lu.role = 'league_admin'::league_role)))));

-- published_team_scores.pts_read
DROP POLICY "pts_read" ON public.published_team_scores;
CREATE POLICY "pts_read" ON public.published_team_scores
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM league_users lu
  WHERE ((lu.league_id = published_team_scores.league_id) AND (lu.user_id = (SELECT auth.uid()))))));

-- serie_a_players.serie_a_players: authenticated read
DROP POLICY "serie_a_players: authenticated read" ON public.serie_a_players;
CREATE POLICY "serie_a_players: authenticated read" ON public.serie_a_players
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

COMMIT;
