-- Migration 009: DB-level uniqueness for active score overrides
-- Enforces at most one active override per (matchday_id, player_id).
-- Uses a partial unique index on rows WHERE removed_at IS NULL.
-- Soft-deleted rows (removed_at IS NOT NULL) are excluded from the constraint,
-- so historical removed overrides for the same player/matchday pair are allowed.

CREATE UNIQUE INDEX IF NOT EXISTS uq_score_overrides_active_per_player
  ON score_overrides (matchday_id, player_id)
  WHERE removed_at IS NULL;
