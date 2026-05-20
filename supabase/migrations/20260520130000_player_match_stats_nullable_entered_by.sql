-- Make entered_by nullable on player_match_stats.
--
-- Why: the SportMonks ratings-tick cron writes provisional per-player rows
-- during live Serie A matches with no human attribution. Manual-edit flows
-- (admin stats UI) still populate it. NULL = system-ingested.
alter table public.player_match_stats
  alter column entered_by drop not null;

comment on column public.player_match_stats.entered_by is
  'User who entered/edited stats manually. NULL = system-ingested (SportMonks live cron).';
