-- Migration 029: Simplify matchday status machine
--
-- Collapses locked/scoring/published into a single 'closed' state.
-- The 'closed' state means: lineup submissions frozen, results finalized.
-- Calculations can still be run and published at any time in open or closed.
-- Closing a matchday auto-opens the next one (handled in app layer).

-- Add 'closed' to the enum (old values kept for log history)
ALTER TYPE matchday_status ADD VALUE IF NOT EXISTS 'closed';

-- Migrate active matchdays from intermediate states to 'closed'
-- (archived rows stay archived; draft and open stay as-is)
UPDATE matchdays
SET status = 'closed'
WHERE status IN ('locked', 'scoring', 'published');
