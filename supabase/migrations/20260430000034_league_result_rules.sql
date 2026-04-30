-- Add league-level result rules (goal thresholds, smoothing, points).
-- Source of truth for how a team's total_fantavoto becomes a fixture result.
-- Shared across all competitions in the league (Campionato, Battle Royal, Coppa).
-- competitions.scoring_config remains as an optional per-competition override.

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS result_rules jsonb NOT NULL DEFAULT '{
    "thresholds": [
      {"min": 0,    "goals": 0},
      {"min": 64.5, "goals": 1},
      {"min": 70.5, "goals": 2},
      {"min": 76.5, "goals": 3},
      {"min": 82.5, "goals": 4},
      {"min": 88.5, "goals": 5},
      {"min": 94.5, "goals": 6}
    ],
    "smoothing": {
      "drawIfDiffBelow": 1.0,
      "drawIf1GoalLeadAndDiffBelow": 1.5
    },
    "points": {"win": 3, "draw": 1, "loss": 0}
  }'::jsonb;

COMMENT ON COLUMN leagues.result_rules IS
  'League-wide rules for converting team total_fantavoto into fixture results. '
  'Shape: { thresholds: [{min, goals}...], smoothing: {drawIfDiffBelow, drawIf1GoalLeadAndDiffBelow}, points: {win, draw, loss} }. '
  'Used by both Campionato and Battle Royal. Override per-competition via competitions.scoring_config.';
