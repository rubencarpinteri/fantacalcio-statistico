/**
 * FantaMondiale synthetic-round dry-run.
 *
 * Lets you exercise the full FM scoring pipeline (snapshotOwnership →
 * runRoundEngine → publish) without waiting for live SportMonks data.
 * Useful to:
 *   - confirm Jun 1 readiness against the Scottish trial competition
 *   - smoke-test engine changes
 *   - debug Battle Royale + standings flows offline
 *
 * What it does, given an existing fm_scoring_round_id with:
 *   - 1+ fm_real_match rows
 *   - 1+ fm_matchday_lineup with submitted_at set (starters chosen)
 *
 * 1. Sets fake scores on each fm_real_match (1-0 home win unless set)
 * 2. Inserts a synthetic fm_player_match_stats row for every player
 *    on either national team (rating 5.5..8.0, minutes 0..90, occasional
 *    goals/assists). Idempotent — clears existing rows for those matches.
 * 3. Imports and calls runRoundEngine(roundId, db)
 * 4. Prints the result
 *
 * Usage:
 *   FM_ROUND_ID=<uuid> \
 *   node --env-file=.env.local ./node_modules/.bin/tsx \
 *     scripts/fm-synthetic-round.ts
 *
 * Optional env:
 *   FM_RESET=1   wipe fm_player_match_stats for these matches first
 *                (default — set to 0 to skip)
 *
 * Safe to re-run. Never runs in production by mistake unless you point
 * FM_ROUND_ID at a real round — keep it on the trial competition.
 */

import { createServiceClient } from '../lib/supabase/service'
import { runRoundEngine } from '../domain/fantamondiale/engine/index'

const ROUND_ID = process.env.FM_ROUND_ID
const RESET = process.env.FM_RESET !== '0'

if (!ROUND_ID) {
  console.error('Required env: FM_ROUND_ID (uuid of an fm_scoring_round)')
  process.exit(1)
}

// Deterministic pseudo-random so output is reproducible.
function rand(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!
}

async function main() {
  const db = createServiceClient()
  const r = rand(0xc0ffee)

  console.log(`▸ Synthetic dry-run for round ${ROUND_ID}`)

  // 1. Load round + real matches
  const { data: round } = await db
    .from('fm_scoring_round')
    .select('id, competition_id')
    .eq('id', ROUND_ID!)
    .maybeSingle()
  if (!round) throw new Error(`round ${ROUND_ID} not found`)

  const { data: matches } = await db
    .from('fm_real_match')
    .select('id, home_team_id, away_team_id, home_score, away_score')
    .eq('scoring_round_id', ROUND_ID!)
  if (!matches?.length) throw new Error('no fm_real_match rows for this round')
  console.log(`  ${matches.length} real match(es)`)

  // 2. Force scores if missing
  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) {
      await db
        .from('fm_real_match')
        .update({ home_score: 1, away_score: 0, status: 'finished' })
        .eq('id', m.id)
      console.log(`  set 1-0 on match ${m.id.slice(0, 8)}…`)
    }
  }

  // 3. Reset stats if asked
  if (RESET) {
    const matchIds = matches.map((m) => m.id)
    const { error } = await db
      .from('fm_player_match_stats')
      .delete()
      .in('real_match_id', matchIds)
    if (error) throw new Error(`reset stats: ${error.message}`)
    console.log(`  wiped existing fm_player_match_stats for ${matchIds.length} matches`)
  }

  // 4. Insert synthetic stats for every player on each match's teams
  let inserted = 0
  for (const m of matches) {
    const teamIds = [m.home_team_id, m.away_team_id]
    const { data: players } = await db
      .from('fm_player')
      .select('id, national_team_id, role')
      .in('national_team_id', teamIds)
    if (!players?.length) {
      console.log(`  (no players for match ${m.id.slice(0, 8)}…)`)
      continue
    }

    const rows = players.map((p) => {
      const onPitch = r() < 0.75
      const minutes = onPitch ? Math.floor(45 + r() * 45) : 0
      const rating = onPitch ? Math.round((5.5 + r() * 2.5) * 10) / 10 : null
      const scored = onPitch && r() < 0.08
      const assisted = onPitch && r() < 0.1
      const yellow = onPitch && r() < 0.1 ? 1 : 0
      const isHome = p.national_team_id === m.home_team_id
      const conceded = onPitch ? (isHome ? (m.away_score ?? 0) : (m.home_score ?? 0)) : 0
      return {
        real_match_id: m.id,
        player_id: p.id,
        minutes_played: minutes,
        rating,
        goals: scored ? 1 : 0,
        assists: assisted ? 1 : 0,
        yellow_cards: yellow,
        red_cards: 0,
        penalties_missed: 0,
        penalties_saved: 0,
        own_goals: 0,
        goals_conceded: conceded,
        clean_sheet: onPitch && minutes >= 60 && conceded === 0,
        is_mvp: false,
        raw_payload: { source: 'synthetic-dry-run' } as unknown,
      }
    })

    // Pick a random MVP per match from on-pitch players
    const onPitchIdx = rows.map((row, i) => (row.minutes_played > 0 ? i : -1)).filter((i) => i >= 0)
    if (onPitchIdx.length) {
      const idx = pick(onPitchIdx, r)
      rows[idx]!.is_mvp = true
      rows[idx]!.rating = Math.max(rows[idx]!.rating ?? 0, 8.0)
    }

    const { error } = await db.from('fm_player_match_stats').insert(rows as never)
    if (error) throw new Error(`insert stats for match ${m.id}: ${error.message}`)
    inserted += rows.length
  }
  console.log(`  inserted ${inserted} fm_player_match_stats rows`)

  // 5. Run the engine
  console.log(`\n▸ Running engine…`)
  const result = await runRoundEngine(ROUND_ID!, db as never)
  console.log(`\n✓ Engine done:`)
  console.log(`  teamsScored:          ${result.teamsScored}`)
  console.log(`  playerScoresWritten:  ${result.playerScoresWritten}`)
  console.log(`  coachScoresWritten:   ${result.coachScoresWritten}`)
  console.log(`  brMatchupsWritten:    ${result.brMatchupsWritten}`)

  console.log(`\nNext: open the FM admin UI, navigate to this round's Risultati`)
  console.log(`tab, and confirm scores + standings look sensible. If yes,`)
  console.log(`the Jun 1 pipeline is wired correctly.`)
}

main().catch((e) => {
  console.error('synthetic round failed:', e)
  process.exit(1)
})
