-- ============================================================
-- League invite tokens
-- One reusable join-link token per league. Stored inline on the
-- leagues row so revoke/regenerate is a single UPDATE.
-- Public route /join/[token] resolves the league, signs the
-- user up (or accepts an already-logged-in user), inserts the
-- league_users row, and auto-enrolls them into the most recent
-- fm_competition with a default team name.
-- ============================================================

alter table leagues
  add column invite_token text;

create unique index ux_leagues_invite_token
  on leagues (invite_token)
  where invite_token is not null;
