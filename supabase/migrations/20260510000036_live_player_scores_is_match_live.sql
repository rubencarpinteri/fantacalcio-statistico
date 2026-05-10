-- Adds a per-player flag indicating their FotMob fixture is currently
-- in progress (started && !finished). Set by the live refresh cron from
-- the page's `general` block. Used by the all-lineups overlay to render
-- a "live" dot on players whose match is happening right now.

ALTER TABLE live_player_scores
ADD COLUMN IF NOT EXISTS is_match_live boolean NOT NULL DEFAULT false;
