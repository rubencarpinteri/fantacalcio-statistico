-- ============================================================
-- published_team_scores
-- ============================================================
-- Normalized, queryable source of truth written (upserted) every
-- time a calculation run is published via publishCalculationAction.
--
-- Competitions read from this table instead of parsing JSON blobs
-- from standings_snapshots. standings_snapshots is kept as a
-- historical/presentation record; this table is the operational source.
--
-- UNIQUE(matchday_id, team_id): republishing overwrites the previous
-- published score for that team/matchday pair with the newest run.
-- ============================================================

CREATE TABLE published_team_scores (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid         NOT NULL REFERENCES leagues(id)        ON DELETE CASCADE,
  matchday_id     uuid         NOT NULL REFERENCES matchdays(id)      ON DELETE CASCADE,
  team_id         uuid         NOT NULL REFERENCES fantasy_teams(id)  ON DELETE CASCADE,
  run_id          uuid         NOT NULL REFERENCES calculation_runs(id),
  total_fantavoto numeric(8,3) NOT NULL,
  player_count    int          NOT NULL DEFAULT 0,
  nv_count        int          NOT NULL DEFAULT 0,
  published_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (matchday_id, team_id)
);

CREATE INDEX idx_published_team_scores_matchday ON published_team_scores (matchday_id);
CREATE INDEX idx_published_team_scores_league   ON published_team_scores (league_id, matchday_id);
CREATE INDEX idx_published_team_scores_team     ON published_team_scores (team_id);

ALTER TABLE published_team_scores ENABLE ROW LEVEL SECURITY;

-- Any league member can read published scores
CREATE POLICY "pts_read"
  ON published_team_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = published_team_scores.league_id
        AND lu.user_id = auth.uid()
    )
  );

-- League admins can insert / update (via upsert on publish)
CREATE POLICY "pts_admin_write"
  ON published_team_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM league_users lu
      WHERE lu.league_id = published_team_scores.league_id
        AND lu.user_id = auth.uid()
        AND lu.role = 'league_admin'
    )
  );
