# Runbook — Jun 1 (WC2026) + Aug 1 (Serie A 26/27) flips

The two days when SportMonks billing comes online. This page is the
short, opinionated checklist for each. For the architectural background
see [`docs/sportmonks-setup.md`](./sportmonks-setup.md) and the engine
v2 notes in `CLAUDE.md`.

---

## Before either flip — one-time prep (do now)

- [ ] Set up three jobs on **cron-job.org** if not already:
  - `GET /api/cron/sportmonks-fixtures-sync` — daily 04:00 UTC
  - `GET /api/cron/sportmonks-ratings-tick`  — every 1 min
  - `GET /api/cron/sportmonks-reconcile-week` — Mon 03:00 UTC
  - All three send `Authorization: Bearer <CRON_SECRET>`.
- [ ] Confirm `CRON_SECRET` and the (current trial) `SPORTMONKS_API_TOKEN`
      are set on Vercel **and** in `.env.local`.
- [ ] Visit `/league/cron-status`. If you see "Nessun run registrato",
      the crons aren't actually firing — fix cron-job.org before going
      further.

---

## 🌍 Jun 1 — World Cup plan (FantaMondiale goes live)

### 1. Rotate the API token

- Subscribe to the SportMonks WC 2026 plan, copy the new token.
- **Vercel → Project Settings → Environment Variables → `SPORTMONKS_API_TOKEN`** — update + redeploy.
- Update `.env.local` locally too.

### 2. Seed the WC competition

You need the WC league + season IDs from SportMonks (typically league
`732`, season TBD — check the SportMonks dashboard the day you flip).

```bash
FM_COMPETITION_ID=<uuid-of-your-existing-fm_competition-row> \
SPORTMONKS_LEAGUE_ID=<wc_league_id> \
SPORTMONKS_SEASON_ID=<wc_season_id> \
node --env-file=.env.local ./node_modules/.bin/tsx \
  scripts/seed-fm-from-sportmonks.ts
```

The script is idempotent. It matches teams by name + FIFA code, only
inserts new rows, and reports orphans (teams in your DB that aren't in
the SportMonks season — review and remove via the admin UI). It also
pulls full squads.

### 3. Trigger the daily sync once manually

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fantacalcio-statistico.vercel.app/api/cron/sportmonks-fixtures-sync
```

This populates `sportmonks_fixtures` + auto-creates `fm_scoring_round`
and `fm_real_match` rows for the next 14 days.

### 4. Verify

- [ ] `/league/cron-status` shows a fresh `sportmonks-fixtures-sync` row
      with `status: ok` and a non-zero `fixtures_fetched`.
- [ ] In the FM admin UI: rounds + real matches exist for the group
      stage opener.
- [ ] Sidebar `/fantamondiale` entry loads without errors.

### 5. Dry-run the scoring pipeline (recommended)

While there's no real data yet, you can prove the full chain works:

```bash
FM_ROUND_ID=<uuid-of-any-created-round> \
node --env-file=.env.local ./node_modules/.bin/tsx \
  scripts/fm-synthetic-round.ts
```

Inserts synthetic player stats + scores, runs the engine, and prints
counts. Then open the round in the admin UI and confirm the standings,
player scores and Battle Royale matchups look sensible.

---

## ⚽ Aug 1 — Starter plan (Serie A 26/27 goes live)

### 1. Replace the calendar CSV

The loader reads `_data/SerieAcalendar2526.csv` by default. To swap in
26/27:

1. Drop the new file (same column layout — col 7 = `sportmonks_fixture_id`)
   into `_data/`, e.g. `SerieAcalendar2627.csv`.
2. On Vercel set `SERIE_A_CALENDAR_FILE=SerieAcalendar2627.csv` and redeploy.
3. Locally, add the same line to `.env.local`.

If the file has any rows with an empty SportMonks ID column, the
matchday-fixture seed will fail the NOT NULL constraint — fill them all
before importing.

### 2. Token: nothing to do (usually)

If your WC plan already covers Serie A you keep using the same token.
If you actually switch plans, repeat step 1 from the Jun 1 section.

### 3. Confirm Serie A is wired up

- [ ] At least one row in `leagues` has `active_sportmonks_league_id` set
      to the Serie A league id (SportMonks: typically `271` — verify).
- [ ] Run fixtures-sync manually as above. The response should report
      `fixtures_fetched > 0` for the Serie A league.
- [ ] First matchday in the admin UI shows kickoff times sourced from
      the CSV and SportMonks fixture IDs attached.

### 4. First live day — what to watch

While the first matches are being played:

1. Watch `/league/cron-status`. Every minute the `ratings-tick` row
   should be `skipped` (before kickoff) or `ok` (during the live window).
2. If you see `error` rows, click through — `error` column shows the
   message and the `summary` JSON shows which fixtures were processed.
3. After full-time, the LiveBoard should show provisional scores within
   60 seconds of the SportMonks rating being published.

---

## Rollback / emergency stop

If a flip goes sideways:

- **Stop new ingestion**: in cron-job.org, disable
  `sportmonks-ratings-tick` and `sportmonks-fixtures-sync`. Manual
  scoring still works.
- **Wipe synthetic / bad data** on the trial competition only:
  ```sql
  delete from fm_player_match_stats where real_match_id in (
    select id from fm_real_match where scoring_round_id = '<round_id>'
  );
  ```
  Never run this on the real competition. The `is_provisional` /
  manual-edit guard in `upsertSerieAPlayerStats` means you cannot
  accidentally overwrite a manually-corrected row even if the cron
  misbehaves.
- **Token panic**: rotating `SPORTMONKS_API_TOKEN` is a Vercel env-var
  edit + redeploy. Crons fail loudly with a clear 503 if the token is
  missing entirely (the `checkCronEnv` guard).
