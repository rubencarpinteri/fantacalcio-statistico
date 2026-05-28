-- Consent-required handover of an fm_fantasy_team (CFM team) between
-- members of the same Lega. Mirrors fantasy_team_transfer_request but
-- scoped through fm_league_competition (the per-Lega tournament
-- instance). league_id is denormalised for RLS scope, league_competition_id
-- for tournament scope.

CREATE TABLE IF NOT EXISTS public.fm_fantasy_team_transfer_request (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id              UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  league_competition_id  UUID NOT NULL REFERENCES public.fm_league_competition(id) ON DELETE CASCADE,
  team_id                UUID NOT NULL REFERENCES public.fm_fantasy_team(id) ON DELETE CASCADE,
  from_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message                TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at           TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fm_fantasy_team_transfer_request_pending_team_uniq
  ON public.fm_fantasy_team_transfer_request (team_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fm_fantasy_team_transfer_request_to_user_pending_idx
  ON public.fm_fantasy_team_transfer_request (to_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fm_fantasy_team_transfer_request_from_user_pending_idx
  ON public.fm_fantasy_team_transfer_request (from_user_id)
  WHERE status = 'pending';

ALTER TABLE public.fm_fantasy_team_transfer_request ENABLE ROW LEVEL SECURITY;

-- SELECT: sender, recipient, or any league admin of the Lega
CREATE POLICY "fm_ftr_select" ON public.fm_fantasy_team_transfer_request
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fm_fantasy_team_transfer_request.league_id
        AND lu.user_id = (SELECT auth.uid())
        AND lu.role = 'league_admin'::league_role
    )
  );

-- INSERT: sender must be the current manager of the FM team in this
-- league_competition, the league_competition must actually belong to
-- the named Lega, and the recipient must be a member of the same Lega.
CREATE POLICY "fm_ftr_insert" ON public.fm_fantasy_team_transfer_request
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.fm_fantasy_team ft
      JOIN public.fm_league_competition lc ON lc.id = ft.league_competition_id
      WHERE ft.id = team_id
        AND ft.manager_id = (SELECT auth.uid())
        AND lc.id = fm_fantasy_team_transfer_request.league_competition_id
        AND lc.league_id = fm_fantasy_team_transfer_request.league_id
    )
    AND EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fm_fantasy_team_transfer_request.league_id
        AND lu.user_id = to_user_id
    )
  );

-- UPDATE: sender, recipient, or league admin. Allowed transitions
-- enforced by the server action.
CREATE POLICY "fm_ftr_update" ON public.fm_fantasy_team_transfer_request
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fm_fantasy_team_transfer_request.league_id
        AND lu.user_id = (SELECT auth.uid())
        AND lu.role = 'league_admin'::league_role
    )
  );
