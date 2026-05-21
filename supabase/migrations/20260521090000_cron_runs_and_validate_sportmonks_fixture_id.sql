-- ============================================================
-- 1. Validate the matchday_fixtures.sportmonks_fixture_id NOT NULL
--    constraint that was added as NOT VALID by
--    20260520150000_drop_obsolete_fotmob_columns.sql.
--
--    By this point all legacy rows (fotmob_match_id-only) should have
--    been deleted along with the fotmob_match_id column. VALIDATE will
--    error if any null sportmonks_fixture_id remains — that's by design.
-- ============================================================

alter table public.matchday_fixtures
  validate constraint matchday_fixtures_sportmonks_fixture_id_not_null;

-- ============================================================
-- 2. cron_runs — minimal observability for the three SportMonks cron
--    endpoints. Each route writes one row per invocation with the
--    same JSON payload it returns to the caller, plus duration and
--    error status. Super-admin reads it via /league/cron-status.
-- ============================================================

create table if not exists public.cron_runs (
  id            uuid primary key default gen_random_uuid(),
  endpoint     text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_ms   integer,
  status        text not null check (status in ('ok', 'error', 'skipped')),
  http_status   integer,
  -- The full JSON body that the route returned (or the error message
  -- envelope). Capped at ~32KB by application code before insert.
  summary       jsonb,
  error         text
);

create index if not exists idx_cron_runs_endpoint_started
  on public.cron_runs (endpoint, started_at desc);

create index if not exists idx_cron_runs_started
  on public.cron_runs (started_at desc);

-- 60-day retention. A scheduled DELETE could run, but the table is
-- low-volume (≤ 1440 rows/day at the 1-min cadence) so we leave
-- pruning to a future migration if needed.

-- RLS: only super_admins can read. Service role (used by cron routes
-- to insert) bypasses RLS entirely.
alter table public.cron_runs enable row level security;

create policy "cron_runs read for super admins"
  on public.cron_runs
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_super_admin = true
    )
  );

comment on table public.cron_runs is
  'Per-invocation log of SportMonks cron endpoints. Read at /league/cron-status. Written by service-role only.';
