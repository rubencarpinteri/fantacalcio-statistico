# SportMonks integration — setup & ops

This document covers the **operational** side of the SportMonks
pipeline: environment variables, cron-job.org schedules, and the
flip procedure when switching between leagues (Scottish trial → WC
2026 → Serie A 26/27).

For the architectural overview, see migration `20260519000042_sportmonks_integration.sql`
and `lib/sportmonks/`.

---

## 1. Environment variables

Set these in **Vercel → Project Settings → Environment Variables**
(or in `.env.local` for dev). All are **server-only** — never
expose `SPORTMONKS_API_TOKEN` to the browser.

| Var | Value (current) | Notes |
|---|---|---|
| `SPORTMONKS_API_TOKEN` | *(free trial token)* | Replace when WC plan subscribed (Jun 1). |
| `CRON_SECRET` | *(existing)* | Reused for new cron routes. |
| `NEXT_PUBLIC_SUPABASE_URL` | *(existing)* | — |
| `SUPABASE_SERVICE_ROLE_KEY` | *(existing)* | — |

### Trial-mode env (optional)

| Var | Default | Purpose |
|---|---|---|
| `SPORTMONKS_TRIAL_LEAGUE_ID` | `501` | Scottish Premiership |
| `SPORTMONKS_TRIAL_SEASON_ID` | `25598` | 25/26 season |

---

## 2. Activating a league

A SportMonks league becomes "active" when either of these rows
points at it:

- `leagues.active_sportmonks_league_id` (Serie A app)
- `fm_competition.active_sportmonks_league_id` (FantaMondiale)

The three crons iterate every row with a non-null value here. To
**disable**, set the column to `NULL`. To **flip**, change the
integer. The seed script does this automatically for the trial
competition.

---

## 3. Trial bootstrap (one-time)

```bash
# 1. Verify env locally
echo $SPORTMONKS_API_TOKEN
echo $SUPABASE_SERVICE_ROLE_KEY

# 2. Run the seed
pnpm tsx scripts/seed-sportmonks-trial.ts

# 3. Trigger fixtures-sync manually to confirm the wiring
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://fantacalcio-statistico.vercel.app/api/cron/sportmonks-fixtures-sync
```

The seed is idempotent — safe to re-run.

---

## 4. cron-job.org schedules

Three jobs, all `GET` requests with `Authorization: Bearer <CRON_SECRET>`.

| Route | When (UTC) | Cost | Notes |
|---|---|---|---|
| `/api/cron/sportmonks-fixtures-sync` | daily 04:00 | 1 call/league/day | Pulls next 14 days, auto-creates FM rounds. |
| `/api/cron/sportmonks-ratings-tick` | every 1 min | ~0 when no live games (DB pre-check) | Hits SportMonks only when something is in the kickoff−5 … kickoff+130 window. |
| `/api/cron/sportmonks-reconcile-week` | Mon 03:00 | 1 call/fixture/week | Backfill catch-up for missed live updates. |

All three return JSON. cron-job.org's failure detector understands
HTTP 4xx/5xx; the routes never throw past the catch — they always
return a result object so you can grep history for errors.

### cron-job.org settings (per job)

- **Request method:** GET
- **Request headers:** `Authorization: Bearer <CRON_SECRET>`
- **Timeout:** 30 seconds for the tick, 5 minutes for the others.
- **Notifications:** email on failure (10+ consecutive failures).

---

## 5. Flip procedure

### Scottish trial → World Cup 2026 (June 1, 2026)

1. **Subscribe** to SportMonks **World Cup 2026 Regular** package (€69/mo).
2. **Update env var** in Vercel: `SPORTMONKS_API_TOKEN=<new paid token>`. Trigger redeploy.
3. **Verify access**: `curl "https://api.sportmonks.com/v3/football/leagues?api_token=<token>" | jq '.data[].id'` — confirm the WC league ID is present. Note it (likely `…`).
4. **Inspect WC `season_id`** via `/leagues/<wc_id>?include=currentSeason`.
5. **Seed the existing FM competition** (`FantaMondiale Statistico` already exists with 12 manually-entered teams):
   ```bash
   FM_COMPETITION_ID=<uuid> \
   SPORTMONKS_LEAGUE_ID=<wc_league_id> \
   SPORTMONKS_SEASON_ID=<wc_season_id> \
   node --env-file=.env.local ./node_modules/.bin/tsx scripts/seed-fm-from-sportmonks.ts
   ```
   This: (a) sets `active_sportmonks_league_id` on the competition, (b) matches existing 12 teams by normalized name + alias map, fills in their `sportmonks_team_id`, (c) inserts the missing ~36 nations, (d) fetches all 48 squads → upserts `fm_player` rows. Idempotent.
6. **Disable the trial competition:** set `fm_competition.active_sportmonks_league_id = NULL` on the Scottish trial row. Otherwise both leagues get polled.
7. **Investigate webhooks** — SportMonks paid plans expose webhook delivery. If available, register `/api/webhooks/sportmonks` (route not yet built) and demote the 1-min cron to a fallback reconciler.

### WC 2026 → Serie A 26/27 (August 2026)

1. Cancel WC subscription, subscribe to **SportMonks Starter** (€29/mo).
2. Verify Serie A league ID via `/leagues`.
3. Set `leagues.active_sportmonks_league_id = <serie_a_id>` for the real Serie A league row.
4. Backfill `serie_a_players.sportmonks_player_id` via a one-off script (squad fetch per club).
5. (Optional) Drop `serie_a_players.fotmob_id` and other FotMob-era columns in a cleanup migration.

---

## 6. Engine modes — `normalize_ratings`

`league_engine_config.normalize_ratings`:

- **`false` (default for new rows)** — passthrough. SportMonks rating is canonical.
  `voto_base = clamp(6.0 + role_mult × (rating − 6.0), 3.0, 10.0)`. Minutes
  factor ignored.
- **`true`** — legacy v2.0 z-score. Preserved for any league still
  ingesting FotMob ratings (existing rows backfilled to `true` by
  the migration).

Toggle via the league engine-config admin page once that UI is
extended; for now, direct SQL:

```sql
update league_engine_config set normalize_ratings = false where league_id = '…';
```

---

## 7. Sanity checks during trial

| Check | How |
|---|---|
| Crons firing | cron-job.org dashboard → execution history |
| Fixtures arriving | `select count(*) from sportmonks_fixtures where league_id = 501;` |
| Auto-created rounds | `select * from fm_scoring_round where competition_id = '<trial>';` |
| Ratings populating | `select count(*) from fm_player_match_stats where raw_payload->>'source' = 'sportmonks';` |
| Rate-limit headroom | Inspect cron route JSON output (`rate_limit` snapshot kept in process memory; each fresh boot resets). |
| Engine output | Trigger a round calculation in the admin UI; verify `voto_base` is close to raw SportMonks rating (passthrough mode) instead of compressed by z-normalization. |

