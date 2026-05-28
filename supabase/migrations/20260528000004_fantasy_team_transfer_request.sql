-- Track consent-required handovers of a Serie A fantasy_team between
-- Lega members. A sender (current manager) creates a pending offer to a
-- recipient (another member of the same Lega). The recipient must accept
-- before the team's manager_id changes. Either party may cancel/reject
-- while pending. Only one pending offer per team at a time.

CREATE TABLE IF NOT EXISTS public.fantasy_team_transfer_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES public.fantasy_teams(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  CHECK (from_user_id <> to_user_id)
);

-- Only one open offer per team at any moment.
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_team_transfer_request_pending_team_uniq
  ON public.fantasy_team_transfer_request (team_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fantasy_team_transfer_request_to_user_pending_idx
  ON public.fantasy_team_transfer_request (to_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fantasy_team_transfer_request_from_user_pending_idx
  ON public.fantasy_team_transfer_request (from_user_id)
  WHERE status = 'pending';

ALTER TABLE public.fantasy_team_transfer_request ENABLE ROW LEVEL SECURITY;

-- SELECT: sender, recipient, or any league admin of the Lega
CREATE POLICY "ftr_select" ON public.fantasy_team_transfer_request
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fantasy_team_transfer_request.league_id
        AND lu.user_id = (SELECT auth.uid())
        AND lu.role = 'league_admin'::league_role
    )
  );

-- INSERT: sender must be the current manager of the team in this Lega,
-- and the recipient must also be a member of the same Lega.
CREATE POLICY "ftr_insert" ON public.fantasy_team_transfer_request
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.fantasy_teams ft
      WHERE ft.id = team_id
        AND ft.league_id = fantasy_team_transfer_request.league_id
        AND ft.manager_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fantasy_team_transfer_request.league_id
        AND lu.user_id = to_user_id
    )
  );

-- UPDATE: sender (to cancel) or recipient (to accept/reject) may transition
-- only pending rows. League admins may also act on stale rows. Business
-- rules (allowed status transitions) are enforced by the server action.
CREATE POLICY "ftr_update" ON public.fantasy_team_transfer_request
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = from_user_id
    OR (SELECT auth.uid()) = to_user_id
    OR EXISTS (
      SELECT 1 FROM public.league_users lu
      WHERE lu.league_id = fantasy_team_transfer_request.league_id
        AND lu.user_id = (SELECT auth.uid())
        AND lu.role = 'league_admin'::league_role
    )
  );
