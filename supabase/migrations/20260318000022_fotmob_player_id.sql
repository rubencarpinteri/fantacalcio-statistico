-- ============================================================
-- Migration: 20260318000022_fotmob_player_id
--
-- Adds fotmob_player_id directly to league_players so the
-- live fetch pipeline can match by numeric ID instead of
-- normalized name (eliminates the ~100 unmatched players).
--
-- Also adds fotmob_unmatched_players to persist unmatched
-- FotMob names across fetches so admin can link them once.
-- ============================================================

-- Direct fotmob player ID on league_players.
-- Populated by the admin linking UI; used as step-0 in matching.
ALTER TABLE league_players
  ADD COLUMN fotmob_player_id bigint;

CREATE INDEX idx_league_players_fotmob ON league_players (fotmob_player_id)
  WHERE fotmob_player_id IS NOT NULL;

-- Persists FotMob players that couldn't be matched to any DB player
-- during a fetch. Admin resolves them via /pool/link-fotmob.
CREATE TABLE fotmob_unmatched_players (
  matchday_id      uuid    NOT NULL REFERENCES matchdays ON DELETE CASCADE,
  fotmob_player_id bigint  NOT NULL,
  fotmob_name      text    NOT NULL,
  fotmob_team      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (matchday_id, fotmob_player_id)
);

CREATE INDEX idx_fotmob_unmatched_matchday ON fotmob_unmatched_players (matchday_id);

-- RLS: admins can read/write; no manager access needed
ALTER TABLE fotmob_unmatched_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League admins manage fotmob_unmatched_players"
  ON fotmob_unmatched_players
  FOR ALL
  USING (
    matchday_id IN (
      SELECT id FROM matchdays
      WHERE league_id IN (
        SELECT league_id FROM league_users
        WHERE user_id = auth.uid() AND role = 'league_admin'
      )
    )
  );
