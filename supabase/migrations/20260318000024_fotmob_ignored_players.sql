-- ============================================================
-- Migration: 20260318000024_fotmob_ignored_players
--
-- Persists a per-league list of FotMob player IDs that should
-- never appear in the /pool/link-fotmob unmatched queue.
-- "Ignore" means: don't clutter the UI — the player stays in
-- serie_a_players and can still be linked if added to a team.
-- ============================================================

CREATE TABLE fotmob_ignored_players (
  league_id        uuid   NOT NULL REFERENCES leagues ON DELETE CASCADE,
  fotmob_player_id bigint NOT NULL,
  fotmob_name      text   NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, fotmob_player_id)
);

CREATE INDEX idx_fotmob_ignored_league ON fotmob_ignored_players (league_id);

ALTER TABLE fotmob_ignored_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League admins manage fotmob_ignored_players"
  ON fotmob_ignored_players
  FOR ALL
  USING (
    league_id IN (
      SELECT league_id FROM league_users
      WHERE user_id = auth.uid() AND role = 'league_admin'
    )
  );
