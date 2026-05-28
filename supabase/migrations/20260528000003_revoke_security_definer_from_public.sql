-- Follow-up: the previous migration revoked from anon/authenticated, but the
-- functions still had GRANT EXECUTE TO PUBLIC (the `=X/postgres` ACL entry),
-- which is what anon/authenticated were actually inheriting from.
-- Revoke from PUBLIC, then re-grant authenticated where the function is an
-- RLS helper or RPC entry-point.

-- ── Helpers used inside RLS policies — keep callable by authenticated ─────
REVOKE EXECUTE ON FUNCTION public.is_super_admin()            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_super_admin()            TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_league_admin(uuid)       FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_league_admin(uuid)       TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid)      FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_league_member(uuid)      TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fm_round_is_published(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fm_round_is_published(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fm_round_is_revealed(uuid)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fm_round_is_revealed(uuid)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fm_phase_is_revealed(uuid)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fm_phase_is_revealed(uuid)  TO authenticated;

-- ── RPC entry-point — keep callable by authenticated ─────────────────────
REVOKE EXECUTE ON FUNCTION public.submit_lineup(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_lineup(uuid, uuid, uuid, boolean, uuid, text, jsonb) TO authenticated;

-- ── Never called via PostgREST — revoke from PUBLIC, no re-grant ─────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fm_get_user_team_id(uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_team_id(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fm_is_competition_member(uuid) FROM PUBLIC;
