-- ============================================================
-- Fantacalcio Statistico — Lineup Locked Fields Cleanup
-- Migration: 20260318000006_cleanup_lineup_locked
-- ============================================================
-- The lineup_submissions table was originally designed with
-- locked_at, locked_snapshot_json, and a 'locked' lineup_status
-- value. In the approved design, lineup_submissions is append-only
-- and can never be updated after insert. Therefore:
--
--   locked_at           — unwritable after insert; never set
--   locked_snapshot_json — unwritable after insert; never set
--
-- These columns are dead weight. Dropping them prevents confusion
-- about lock semantics and removes misleading schema surface.
--
-- Lock semantics (authoritative):
--   A lineup is "locked" when the matchday transitions to status
--   'locked'. At that moment:
--     1. submit_lineup() will RAISE MATCHDAY_NOT_OPEN for any new
--        attempt — no new submissions accepted.
--     2. transitionMatchdayStatusAction writes one lineup_lock
--        audit_log entry per team, referencing the exact
--        submission_id frozen at that moment.
--     3. lineup_current_pointers still points to the last
--        submitted (or draft) row. The scoring engine reads
--        from that pointer at scoring time.
--
-- The 'locked' value is removed from the lineup_status enum
-- by recreating the type. All existing data uses only 'draft'
-- and 'submitted' — no rows have status = 'locked'.
-- ============================================================

-- ---- Step 1: Drop unused columns --------------------------------

alter table lineup_submissions drop column if exists locked_at;
alter table lineup_submissions drop column if exists locked_snapshot_json;

-- ---- Step 2: Simplify the submitted_at check constraint ---------
-- Old: status = 'draft' OR status in ('submitted','locked') AND submitted_at IS NOT NULL
-- New: status = 'draft' OR (status = 'submitted' AND submitted_at IS NOT NULL)

alter table lineup_submissions drop constraint if exists chk_submitted_at;

alter table lineup_submissions
  add constraint chk_submitted_at check (
    status = 'draft'
    or (status = 'submitted' and submitted_at is not null)
  );

-- ---- Step 3: Replace lineup_status enum -------------------------
-- Postgres cannot remove enum values directly.
-- We rename the old type, create a new one without 'locked',
-- update the column, then drop the old type.

alter type lineup_status rename to lineup_status_old;

create type lineup_status as enum ('draft', 'submitted');

-- Cast the column to the new type.
-- Any existing 'locked' rows would fail here, confirming the
-- invariant that no such rows exist. If they did, this migration
-- would surface the problem explicitly.
alter table lineup_submissions
  alter column status type lineup_status
  using status::text::lineup_status;

drop type lineup_status_old;
