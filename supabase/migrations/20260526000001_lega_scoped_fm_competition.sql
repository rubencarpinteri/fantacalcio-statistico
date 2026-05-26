-- Lega-scoped FantaMondiale: split tournament template (global) from game state (per-Lega).
-- Fixes the popularity-penalty + BR single-pool bug where users from different
-- Leghe competed in the same pool against each other.

CREATE TYPE fm_competition_kind AS ENUM ('national_team', 'club_international');

ALTER TABLE fm_competition
  ADD COLUMN kind fm_competition_kind NOT NULL DEFAULT 'national_team';

CREATE TYPE fm_league_competition_status AS ENUM ('active', 'archived');

CREATE TABLE fm_league_competition (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  fm_competition_id uuid NOT NULL REFERENCES fm_competition(id) ON DELETE CASCADE,
  status            fm_league_competition_status NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES profiles(id),
  UNIQUE (league_id, fm_competition_id)
);

CREATE INDEX fm_league_competition_league_id_idx
  ON fm_league_competition(league_id);
CREATE INDEX fm_league_competition_fm_competition_id_idx
  ON fm_league_competition(fm_competition_id);

ALTER TABLE fm_league_competition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fm_league_competition: members and admin read"
  ON fm_league_competition FOR SELECT
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = fm_league_competition.league_id
        AND lu.user_id = auth.uid()
    )
  );

CREATE POLICY "fm_league_competition: league admin write"
  ON fm_league_competition FOR ALL
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = fm_league_competition.league_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = fm_league_competition.league_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );

ALTER TABLE fm_fantasy_team
  ADD COLUMN league_competition_id uuid
  REFERENCES fm_league_competition(id) ON DELETE CASCADE;

ALTER TABLE fm_competition_standing
  ADD COLUMN league_competition_id uuid
  REFERENCES fm_league_competition(id) ON DELETE CASCADE;

ALTER TABLE fm_round_player_ownership
  ADD COLUMN league_competition_id uuid
  REFERENCES fm_league_competition(id) ON DELETE CASCADE;

ALTER TABLE fm_battle_royale_matchup
  ADD COLUMN league_competition_id uuid
  REFERENCES fm_league_competition(id) ON DELETE CASCADE;

-- Backfill: create one fm_league_competition per (Lega, tournament) pair
-- that has an existing fantasy team. Resolves the Lega via league_users.
INSERT INTO fm_league_competition (league_id, fm_competition_id, status, created_by)
SELECT DISTINCT lu.league_id, fft.competition_id, 'active'::fm_league_competition_status, fft.manager_id
FROM fm_fantasy_team fft
JOIN league_users lu ON lu.user_id = fft.manager_id
ON CONFLICT (league_id, fm_competition_id) DO NOTHING;

UPDATE fm_fantasy_team fft
SET league_competition_id = flc.id
FROM fm_league_competition flc
JOIN league_users lu ON lu.league_id = flc.league_id
WHERE flc.fm_competition_id = fft.competition_id
  AND lu.user_id = fft.manager_id;

UPDATE fm_competition_standing fcs
SET league_competition_id = (
  SELECT fft.league_competition_id
  FROM fm_fantasy_team fft
  WHERE fft.id = fcs.fantasy_team_id
  LIMIT 1
)
WHERE league_competition_id IS NULL;

ALTER TABLE fm_fantasy_team
  ALTER COLUMN league_competition_id SET NOT NULL;
ALTER TABLE fm_competition_standing
  ALTER COLUMN league_competition_id SET NOT NULL;

ALTER TABLE fm_fantasy_team        DROP COLUMN competition_id;
ALTER TABLE fm_competition_standing DROP COLUMN competition_id;

DROP FUNCTION IF EXISTS public.fm_is_competition_member(uuid);
CREATE FUNCTION public.fm_is_competition_member(p_league_competition_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fm_fantasy_team
    WHERE league_competition_id = p_league_competition_id
      AND manager_id = auth.uid()
  )
$$;

DROP FUNCTION IF EXISTS public.fm_get_user_team_id(uuid);
CREATE FUNCTION public.fm_get_user_team_id(p_league_competition_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM fm_fantasy_team
  WHERE league_competition_id = p_league_competition_id
    AND manager_id = auth.uid()
  LIMIT 1
$$;

CREATE INDEX fm_fantasy_team_league_competition_id_idx
  ON fm_fantasy_team(league_competition_id);
CREATE INDEX fm_competition_standing_league_competition_id_idx
  ON fm_competition_standing(league_competition_id);
CREATE INDEX fm_round_player_ownership_league_competition_id_idx
  ON fm_round_player_ownership(league_competition_id);
CREATE INDEX fm_battle_royale_matchup_league_competition_id_idx
  ON fm_battle_royale_matchup(league_competition_id);
