-- Tighten SECURITY DEFINER function exposure flagged by the Supabase advisor.
--
-- Three buckets:
--   1. Revoke anon EXECUTE on every flagged function (no anon flow uses them).
--   2. Revoke BOTH anon + authenticated on functions that should never be
--      called from PostgREST: trigger functions and helpers unused by app/RLS.
--   3. Keep authenticated EXECUTE on the helpers that RLS policies invoke
--      (is_super_admin, is_league_admin, is_league_member, fm_round_is_*,
--       fm_phase_is_revealed). They're SECURITY DEFINER so they can bypass
--       RLS recursion inside policy expressions — required by design.

-- ── 1. Revoke anon on the 7 helpers + submit_lineup ────────────────────────
REVOKE EXECUTE ON FUNCTION public.submit_lineup(uuid, uuid, uuid, boolean, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_league_admin(uuid)                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.fm_round_is_published(uuid)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.fm_round_is_revealed(uuid)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.fm_phase_is_revealed(uuid)             FROM anon;

-- ── 2. Revoke both anon + authenticated on functions never called from PostgREST ─
-- Trigger function — invoked by Postgres, never via RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                      FROM anon, authenticated;

-- Unused helpers (zero RLS uses, zero app .rpc() calls).
REVOKE EXECUTE ON FUNCTION public.fm_get_user_team_id(uuid)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_team_id(uuid)                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fm_is_competition_member(uuid)         FROM anon, authenticated;
