-- ============================================================
-- competition_standings_snapshots
-- ============================================================
-- Immutable standings snapshot per competition after each computed round.
-- Append-only: never updated — new version_number row inserted on recompute.
--
-- snapshot_json shape (type: 'table', for Campionato / Battle Royale):
--   {
--     "type": "table",
--     "rows": [
--       { "team_id": "...", "played": 8, "wins": 5, "draws": 2,
--         "losses": 1, "goals_for": 14, "goals_against": 9,
--         "goal_difference": 5, "points": 17, "total_fantavoto": 581.4 }
--     ]
--   }
--
-- snapshot_json shape (type: 'groups', for Coppa group stage):
--   {
--     "type": "groups",
--     "groups": {
--       "A": { "rows": [ ... ] },
--       "B": { "rows": [ ... ] }
--     }
--   }
-- ============================================================

CREATE TABLE competition_standings_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid        NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  league_id      uuid        NOT NULL REFERENCES leagues(id),
  after_round_id uuid        NOT NULL REFERENCES competition_rounds(id),
  version_number int         NOT NULL,
  snapshot_json  jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, after_round_id, version_number)
);

CREATE INDEX idx_comp_standings_competition ON competition_standings_snapshots (competition_id);
CREATE INDEX idx_comp_standings_round       ON competition_standings_snapshots (after_round_id);
CREATE INDEX idx_comp_standings_league      ON competition_standings_snapshots (league_id);

ALTER TABLE competition_standings_snapshots ENABLE ROW LEVEL SECURITY;

-- Any league member can read standings
CREATE POLICY "comp_standings_read"
  ON competition_standings_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = competition_standings_snapshots.league_id
        AND lu.user_id = auth.uid()
    )
  );

-- Append-only: only INSERT allowed (no UPDATE / DELETE) for admins
CREATE POLICY "comp_standings_admin_insert"
  ON competition_standings_snapshots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = competition_standings_snapshots.league_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );
