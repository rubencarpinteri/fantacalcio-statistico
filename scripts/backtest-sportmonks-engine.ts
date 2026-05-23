/**
 * Engine v3.1 backtest against real SportMonks ratings.
 *
 * Pulls finished fixtures for a SportMonks league (default 501 — Scottish
 * Premiership) over a date range, applies the v3.1 player score formula
 * (pivot + bonus/malus + popularity penalty), and reports the rating /
 * voto_base / raw_subtotal distributions.
 *
 * No DB writes. No lineups required — this is a pure read-only validation
 * of the engine against the rating source itself.
 *
 * Usage:
 *   SPORTMONKS_API_TOKEN=… pnpm tsx scripts/backtest-sportmonks-engine.ts
 *
 * Env knobs:
 *   SPORTMONKS_BT_LEAGUE_ID   default 501  (Scottish Premiership)
 *   SPORTMONKS_BT_FROM        default today - 60 days, "YYYY-MM-DD"
 *   SPORTMONKS_BT_TO          default today, "YYYY-MM-DD"
 *   SPORTMONKS_BT_MAX_FIX     cap on fixtures to fetch (default 30)
 */

import { listFixturesBetween, fetchFixtureWithDetail } from '../lib/sportmonks/fixtures'
import { parseFixture } from '../lib/sportmonks/parse'
import { positionIdToFMRole } from '../lib/sportmonks/positions'
import type { ParsedPlayerStat } from '../lib/sportmonks/types'

// ---- v3.1 engine constants (Regole di gioco defaults) ----------------------
const PIVOT_RATING = 6.50
const PIVOT_VOTE = 6.00
const VOTO_MIN = 1.0
const VOTO_MAX = 10.0
const MIN_MINUTES = 15
const BASE_SCORE = 6.0
const SLOPE = (VOTO_MAX - PIVOT_VOTE) / (VOTO_MAX - PIVOT_RATING)

const GOAL_BONUS: Record<'P' | 'D' | 'C' | 'A', number> = { P: 4.0, D: 2.8, C: 2.2, A: 1.8 }
const PENALTY_SCORED_DISCOUNT = 0.3
const ASSIST = 1.0
const YELLOW = 0.3
const RED = 1.5
const BRACE = 0.5
const HAT = 1.0
const CS_GK = 0.8
const CS_DEF = 0.5
const CS_MIN_MIN = 60
const PEN_SAVED = 2.0
const PEN_MISSED = 1.5
const OWN_GOAL = 1.5
const GC_GK = 0.4
const GC_DEF = 0.15
const GC_DEF_MIN_MIN = 60

const POP_BRACKETS: Array<[number, number]> = [
  [10, 0], [25, 10], [50, 25], [75, 40], [100, 50],
]
const GOAL_THRESHOLDS = [0, 55, 58, 61, 64, 68, 72]

// ---- Helpers ---------------------------------------------------------------

function pivotVotoBase(rating: number): number {
  return Math.max(VOTO_MIN, Math.min(VOTO_MAX, PIVOT_VOTE + SLOPE * (rating - PIVOT_RATING)))
}

function popPct(ownership: number): number {
  for (const [upper, pct] of POP_BRACKETS) if (ownership <= upper) return pct
  return 50
}

function classify(p: ParsedPlayerStat): 'P' | 'D' | 'C' | 'A' {
  const role = positionIdToFMRole(p.position_id) ?? positionIdToFMRole(p.detailed_position_id ?? null)
  return role ?? 'C'
}

function scorePlayer(
  p: ParsedPlayerStat,
  ownership: number,
): { rating: number | null; voto_base: number | null; raw: number; final: number; role: string } {
  const role = classify(p)
  const decisive =
    p.goals_scored + p.assists + p.own_goals + p.yellow_cards + p.red_cards +
    p.penalties_saved + p.penalties_missed + (p.penalties_scored ?? 0) > 0

  let voto_base: number | null
  if (p.minutes_played < MIN_MINUTES && !decisive) voto_base = null
  else if (p.minutes_played < MIN_MINUTES) voto_base = BASE_SCORE
  else if (p.rating == null) voto_base = BASE_SCORE
  else voto_base = pivotVotoBase(p.rating)

  if (voto_base == null) {
    return { rating: p.rating, voto_base: null, raw: 0, final: 0, role }
  }

  // Bonus
  const penScored = p.penalties_scored ?? 0
  const regGoals = Math.max(0, p.goals_scored - penScored)
  let bonus = regGoals * GOAL_BONUS[role] + penScored * (GOAL_BONUS[role] - PENALTY_SCORED_DISCOUNT)
  bonus += p.assists * ASSIST
  if (p.goals_scored >= 3) bonus += HAT
  else if (p.goals_scored === 2) bonus += BRACE
  if (role === 'P' && p.clean_sheet && p.minutes_played >= CS_MIN_MIN) bonus += CS_GK
  else if (role === 'D' && p.clean_sheet && p.minutes_played >= CS_MIN_MIN) bonus += CS_DEF
  if (role === 'P') bonus += p.penalties_saved * PEN_SAVED

  // Malus
  let malus = p.yellow_cards * YELLOW + p.red_cards * RED + p.own_goals * OWN_GOAL
    + p.penalties_missed * PEN_MISSED
  if (role === 'P') malus += p.goals_conceded * GC_GK
  else if (role === 'D' && p.minutes_played >= GC_DEF_MIN_MIN) malus += p.goals_conceded * GC_DEF

  const raw = voto_base + bonus - malus
  const pen = Math.abs(raw) * popPct(ownership) / 100
  const final = raw - pen // no MVP simulation; popularity-only

  return { rating: p.rating, voto_base, raw, final, role }
}

// ---- Stats helpers ----------------------------------------------------------

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function summarize(values: number[], label: string) {
  if (values.length === 0) {
    console.log(`  ${label}: no data`)
    return
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const std = Math.sqrt(variance)
  const fmt = (n: number) => n.toFixed(2).padStart(6)
  console.log(
    `  ${label.padEnd(14)} n=${values.length.toString().padStart(4)}` +
    `  mean=${fmt(mean)}  std=${fmt(std)}  ` +
    `min=${fmt(sorted[0]!)}  p10=${fmt(quantile(sorted, 0.10))}  ` +
    `p50=${fmt(quantile(sorted, 0.50))}  p90=${fmt(quantile(sorted, 0.90))}  ` +
    `max=${fmt(sorted[sorted.length - 1]!)}`
  )
}

// ---- Main -----------------------------------------------------------------

function shiftDate(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

async function main() {
  const leagueId = Number(process.env.SPORTMONKS_BT_LEAGUE_ID ?? 501)
  const today = new Date()
  const fromStr = process.env.SPORTMONKS_BT_FROM ?? shiftDate(today, -60).toISOString().slice(0, 10)
  const toStr = process.env.SPORTMONKS_BT_TO ?? today.toISOString().slice(0, 10)
  const maxFix = Number(process.env.SPORTMONKS_BT_MAX_FIX ?? 30)

  console.log(`▸ Backtest: league ${leagueId}  ${fromStr} → ${toStr}  (cap ${maxFix} fixtures)`)

  const fixtures = await listFixturesBetween(leagueId, fromStr, toStr)
  // Keep only those whose result is in (state_id 5 = finished in SportMonks)
  const finished = fixtures
    .filter((f) => f.state_id === 5)
    .sort((a, b) => (a.starting_at ?? '').localeCompare(b.starting_at ?? ''))
    .slice(0, maxFix)

  console.log(`  ${finished.length} finished fixtures of ${fixtures.length} returned`)
  if (finished.length === 0) {
    console.log('  Nothing to backtest. Try a different date range or league.')
    return
  }

  const ratings: number[] = []
  const votos: number[] = []
  const raws: number[] = []
  const finalsByPop = new Map<number, number[]>()
  const allPlayers: ReturnType<typeof scorePlayer>[] = []

  let fetched = 0
  for (const f of finished) {
    try {
      const detail = await fetchFixtureWithDetail(f.id)
      const parsed = parseFixture(detail)
      for (const p of parsed.players) {
        if (p.rating != null) ratings.push(p.rating)
        // Run scoring at four ownership levels to see the spread
        for (const owner of [5, 30, 60, 90]) {
          const sc = scorePlayer(p, owner)
          if (sc.voto_base != null) {
            if (owner === 30) {
              votos.push(sc.voto_base)
              raws.push(sc.raw)
              allPlayers.push(sc)
            }
            if (!finalsByPop.has(owner)) finalsByPop.set(owner, [])
            finalsByPop.get(owner)!.push(sc.final)
          }
        }
      }
      fetched++
      if (fetched % 5 === 0) console.log(`  …processed ${fetched}/${finished.length}`)
    } catch (err) {
      console.warn(`  ! skipped fixture ${f.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`\n══ Distributions across ${fetched} fixtures ══`)
  summarize(ratings, 'SM rating')
  summarize(votos, 'voto_base')
  summarize(raws, 'raw_subtotal')

  console.log('\n══ final_score by simulated ownership ══')
  for (const owner of [5, 30, 60, 90]) {
    summarize(finalsByPop.get(owner) ?? [], `final @${owner}%`)
  }

  // Synthetic team aggregation. We pre-score every player at 4 ownership
  // levels so each draw can mix realistic ownership across a lineup:
  // a typical 10-manager league lineup has 2 popular stars, 5 mid-tier,
  // 4 differentials.
  const eligibles = allPlayers.filter((s) => s.voto_base != null)
  if (eligibles.length < 11) {
    console.log('  Not enough eligible players for synthetic teams.')
    return
  }

  function drawTeam(ownershipMix: number[]): number {
    let sum = 0
    for (const owner of ownershipMix) {
      const p = eligibles[Math.floor(Math.random() * eligibles.length)]!
      const pen = Math.abs(p.raw) * popPct(owner) / 100
      sum += p.raw - pen
    }
    return sum
  }

  function simulateBucketing(label: string, mix: number[]) {
    console.log(`\n══ Synthetic team totals — ${label} ══`)
    const totals: number[] = []
    for (let i = 0; i < 1000; i++) totals.push(drawTeam(mix))
    summarize(totals, 'team total')

    console.log(`  Goal distribution under ${GOAL_THRESHOLDS.join('/')}:`)
    const buckets = new Array(GOAL_THRESHOLDS.length).fill(0) as number[]
    for (const t of totals) {
      let g = 0
      for (let i = 0; i < GOAL_THRESHOLDS.length; i++) if (t >= GOAL_THRESHOLDS[i]!) g = i
      buckets[g]! += 1
    }
    for (let i = 0; i < buckets.length; i++) {
      const pct = (100 * buckets[i]! / totals.length).toFixed(1)
      console.log(`    ${i} goals (≥${GOAL_THRESHOLDS[i]}):  ${buckets[i]!.toString().padStart(4)}  (${pct}%)`)
    }
  }

  // Uniform — kept for comparison.
  simulateBucketing('uniform @30% ownership', new Array(11).fill(30))

  // Realistic 10-team league lineup. Sample ownership levels matching:
  //   2 stars at 70-80% (popular)
  //   5 mid at 30-50%   (typical)
  //   4 diff at 5-15%   (rare)
  const realisticMix: number[] = [75, 75, 40, 40, 40, 40, 40, 10, 10, 10, 10]
  simulateBucketing('realistic mix (2×popular + 5×mid + 4×diff)', realisticMix)

  // Light-ownership mix — what a "small league" with lots of differentials looks like.
  const lightMix: number[] = [60, 40, 40, 30, 30, 20, 20, 10, 10, 5, 5]
  simulateBucketing('light mix (mostly differentials)', lightMix)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
