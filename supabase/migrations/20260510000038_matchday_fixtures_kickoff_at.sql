-- Per-fixture kickoff time. Populated from the Serie A calendar CSV at
-- fixture creation, and lazily refreshed from FotMob's general.matchTimeUTCDate
-- on every cron tick. Used by the live-refresh cron to skip pre-kickoff
-- fetches: a fixture more than 5 minutes from kickoff is not contacted.
ALTER TABLE matchday_fixtures
ADD COLUMN IF NOT EXISTS kickoff_at timestamptz;
