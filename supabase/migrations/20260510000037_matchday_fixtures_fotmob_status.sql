-- Per-fixture FotMob match status, cached on every cron tick.
-- The live-ratings cron uses these to skip refetching a fixture
-- that's already over (saves ~10 FotMob requests per tick at the
-- end of a matchday) and to drive the "currently playing" UI.

ALTER TABLE matchday_fixtures
ADD COLUMN IF NOT EXISTS fotmob_started boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS fotmob_finished boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS fotmob_status_seen_at timestamptz;
