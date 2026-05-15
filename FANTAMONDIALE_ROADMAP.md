# FantaMondiale Statistico 2026 — Build Roadmap

Read this file at the start of every session to know what's done and what's next.
Check off items as they're completed.

---

## DONE

- [x] DB schema: 23 `fm_` tables + enums (migration applied to prod Supabase)
- [x] RLS policies for all fm_ tables
- [x] Zod config schema (`domain/fantamondiale/config/schema.ts`) + WC defaults (`/defaults.ts`)
- [x] TypeScript types regenerated + FM* aliases appended (`types/database.types.ts`)
- [x] `lib/fantamondiale/server.ts` — `requireFMContext`, `assertSuperAdmin`, data helpers
- [x] Admin module — 9 tabs: overview, phases, rounds, teams, players, coaches, prices, config, members
- [x] User module — 5 tabs: overview, rosa (squad builder), formazione (lineup picker), classifica, regole
- [x] AdminSidebar — globe icon + FantaMondiale nav entry
- [x] FotMob WC ingest — ratings + MVP + match results → `fm_player_match_stats`, `fm_real_match`
- [x] Step 1 — Ownership snapshot at round lock (`rounds/actions.ts` → `snapshotOwnership`)
- [x] Step 2 — Scoring engine (`domain/fantamondiale/engine/index.ts` → `runRoundEngine`)
- [x] Step 3 — Battle Royale + standings (included in `runRoundEngine`)
- [x] Step 4 — Admin pipeline trigger UI (`FMRoundActions.tsx` + `/api/fm/calculate-round` → delegates to `runRoundEngine`)
- [x] Step 5 — Score breakdown UI (`app/(admin)/fantamondiale/[id]/risultati/page.tsx` + Risultati tab in `FMUserTabNav`)
- [x] Step 6 — Polish: no-lineup zero-score padding in engine; SquadBuilder + LineupPicker mobile; overview countdown timer

---

## NEXT STEPS (in order)

### Step 1 — Ownership snapshot at round lock
**What:** When a round is locked (status → 'locked'), freeze a snapshot of who fielded each player.
**Where:** `app/(admin)/fantamondiale/[id]/rounds/actions.ts` — inside `setRoundStatusAction`, when transitioning to 'locked', run the ownership calc.
**Logic:**
- For each fantasy team that has a lineup for this round, get their 11 starters from `fm_matchday_lineup_player`
- For each player who appears in at least one lineup: count how many teams fielded them / total teams with lineups = ownership_pct
- Upsert into `fm_round_player_ownership` (columns: `scoring_round_id`, `player_id`, `teams_fielding`, `total_teams`, `ownership_pct`)
**Note:** This must run BEFORE score calculation (scores depend on ownership).

---

### Step 2 — Scoring engine
**Where:** `domain/fantamondiale/engine/index.ts` (new file)
**Input:** For a given `scoring_round_id`, read:
- `fm_player_match_stats` (fotmob ratings, goals, assists, cards, MVP flag, minutes)
- `fm_matchday_lineup_player` (which players each team started)
- `fm_round_player_ownership` (ownership % per player)
- `fm_phase_squad` (coach_id per team)
- `fm_coach_match_score` inputs: coach tier from `fm_phase_coach_tier`, match result from `fm_real_match`
- `fm_competition_config` (all scoring rules)

**Per-player calc:**
```
z = (fotmob_rating - engine.fotmob_mean) / engine.fotmob_std
minutes_factor = minutes < engine.minutes_threshold ? engine.minutes_partial : engine.minutes_full
b0 = engine.target_mean_vote + engine.target_vote_std * z * minutes_factor
b1 = engine.target_mean_vote + role_multiplier[role] * (b0 - engine.target_mean_vote)
voto_base = clamp(b1, engine.voto_base_min, engine.voto_base_max)

football_bonus = goal_bonus + assist_bonus + clean_sheet_bonus + card_malus + ...
subtotal = voto_base + football_bonus

# calc_order: 'mvp_then_penalty' (default)
# MVP bonus (only if player was man of match):
ownership_pct = fm_round_player_ownership.ownership_pct
mvp_bonus = lookup(mvp_bonus_brackets, ownership_pct)  # e.g. pct=80 → +80% of subtotal
subtotal_after_mvp = subtotal + subtotal * mvp_bonus / 100

# Popularity penalty:
penalty_pct = lookup(popularity_brackets, ownership_pct)
final_score = subtotal_after_mvp * (1 - penalty_pct / 100)
```

**Per-coach calc:**
```
result = win | draw | loss  (from fm_real_match)
tier = fm_phase_coach_tier.tier  (tier_1..tier_4)
coach_score = config.coach_tier_matrix[tier][result]
```

**Round aggregation (per fantasy team):**
```
raw_score = sum(final_score for all 11 starters) + coach_score
```

**Output:** Upsert into:
- `fm_player_match_score` (one row per player per round per fantasy team — includes `calc_snapshot` JSONB with the config used)
- `fm_coach_match_score` (one row per team per round)
- `fm_fantasy_team_round_score` (one row per team per round: `raw_score`)

---

### Step 3 — Battle Royale calculation
**Where:** Same engine file or `domain/fantamondiale/engine/battleRoyale.ts`
**Logic:**
```
For each team: goals = count(thresholds where raw_score >= threshold)
  using config.battle_royale.goal_thresholds (ascending list)

Round-robin: for every pair (team_a, team_b) where team_a.id < team_b.id:
  if goals_a > goals_b → A wins (W=3 pts, L=0 pts)
  if goals_a == goals_b → draw (D=1 pt each)
  if goals_a < goals_b → B wins

Upsert fm_battle_royale_matchup (scoring_round_id, team_a_id, team_b_id, goals_a, goals_b, result_a)
```

**Standings update:**
```
Aggregate across all published rounds per team:
  br_points_total = sum of BR points earned
  round_wins = count of rounds where team had highest raw_score
  raw_score_total = sum of raw_score across all rounds
  best_round_score = max raw_score in a single round
  rank = rank by br_points_total (tiebreak by raw_score_total)

Upsert fm_competition_standing
```

---

### Step 4 — Admin pipeline trigger UI
**Where:** `app/(admin)/fantamondiale/[id]/rounds/page.tsx` + new server action
**What:** A button on each round (when status = 'scoring') that runs the full pipeline:
1. Calculate scores for all teams in this round (Step 2)
2. Run Battle Royale for this round (Step 3)
3. Recompute standings
4. Then admin manually clicks "Pubblica" (status → 'published')

Similar pattern to existing `QuickFetchAndCalculateButton.tsx` in the Serie A engine.

---

### Step 5 — Score breakdown UI (user-facing)
**Where:** New page `app/(admin)/fantamondiale/[id]/risultati/page.tsx`
**What:** After a round is published, users can see:
- Their round score breakdown (per player: voto_base, bonuses, MVP, penalty, final)
- Their coach score
- Their BR matchups (who they beat/lost to)
- Compare with other teams' scores (now public since round is published)

Add 'Risultati' tab to `FMUserTabNav.tsx`.

---

### Step 6 — Polish + edge cases
- Handle teams with no lineup submitted (score = 0, still participates in BR as 0 goals)
- Handle players with no FotMob rating (absent / not in squad) — skip gracefully
- Mobile-optimize SquadBuilder and LineupPicker
- Competition overview page: show active round countdown timer

---

## KEY SCHEMA FACTS (don't get these wrong)

| What you think | Actual column name |
|---|---|
| `squad_id` | `phase_squad_id` (in fm_phase_squad_player) |
| `price_paid` | `purchase_price` (in fm_phase_squad_player) |
| `config.squad.max_players` | `config.squad.pool_size` |
| `config.squad.budget_credits` | `config.squad.budget_default` |
| `config.squad.allowed_formations` | `config.formations` (top-level) |
| `config.football_bonuses` | `config.football` |
| `config.football.goal_by_role.P` | `config.football.goal.P` |
| `config.battle_royale.score_to_goals_thresholds` | `config.battle_royale.goal_thresholds` |
| `config.battle_royale.win_pts` | `config.battle_royale.win_points` |
| `standings.total_points` | `standings.br_points_total` |
| `standings.wins` | `standings.round_wins` |

fm_matchday_lineup INSERT requires: `phase_squad_id` (look up via phase_id + fantasy_team_id from fm_phase_squad)

---

## TECH STACK REMINDER
- Next.js 15 App Router, React 19, TypeScript strict (`noUncheckedIndexedAccess: true`)
- Supabase project: `yqaxcpkjqvtroxinjjvw` (eu-central-1)
- Tailwind v4, CSS vars: `text-ink-1..5`, `bg-glass-1..3`, `border-hairline`
- `redirect()` and Link `href` need `as Route` cast from `'next'` (typed routes enabled)
- JSONB config fields need `as unknown as Json` cast (import `Json` from `@/types/database.types`)
- `cookies()` from `next/headers` must be awaited
- UI strings in Italian, code in English
