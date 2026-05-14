/**
 * One-off recompute script for Engine v2.0 migration.
 *
 * Re-runs the v2.0 engine over every historical player_match_stats row,
 * inserts new calculation_runs (engine_version='v2.0', status='published'),
 * and populates player_calculations for them. Existing v1.x runs are left
 * in place as historical record but are no longer the "latest published" run.
 *
 * Requirements:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key>
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/recompute-historical-v2.ts
 *
 * Idempotent: re-running creates new v2.0 runs with incrementing run_number.
 * To completely supersede prior runs, the latest v2.0 run for each matchday
 * becomes the implicit "published" pointer used by the results / standings pages.
 */

import { createClient } from '@supabase/supabase-js'
import { computeMatchday } from '../domain/engine/v1/engine'
import { buildEngineConfig } from '../domain/engine/v1/config'
import type { EnginePlayerInput, PlayerCalculationResult } from '../domain/engine/v1/types'
import type { RatingClass } from '../types/database.types'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // 1. Find every matchday that has at least one player_match_stats row
  const { data: matchdaysWithStats } = await supabase
    .from('player_match_stats')
    .select('matchday_id')
  const matchdayIds = [...new Set((matchdaysWithStats ?? []).map((r) => r.matchday_id))]
  console.log(`Found ${matchdayIds.length} matchdays with stats to recompute`)

  for (const matchdayId of matchdayIds) {
    const { data: matchday } = await supabase
      .from('matchdays')
      .select('id, league_id')
      .eq('id', matchdayId)
      .single()
    if (!matchday) continue

    const { data: dbConfig } = await supabase
      .from('league_engine_config')
      .select('*')
      .eq('league_id', matchday.league_id)
      .maybeSingle()
    const engineConfig = buildEngineConfig(dbConfig ?? null)

    const { data: stats } = await supabase
      .from('player_match_stats')
      .select(`
        id, player_id, rating_class_override, minutes_played, is_provisional,
        fotmob_rating, goals_scored, assists, own_goals, yellow_cards, red_cards,
        penalties_scored, penalties_missed, penalties_saved, clean_sheet, goals_conceded,
        league_players ( rating_class )
      `)
      .eq('matchday_id', matchdayId)
    if (!stats?.length) continue

    const inputs: EnginePlayerInput[] = stats.map((s) => {
      const storedClass = (s.league_players as unknown as { rating_class: RatingClass } | null)?.rating_class ?? 'MID'
      return {
        player_id: s.player_id,
        stats_id: s.id,
        rating_class: (s.rating_class_override as RatingClass | null) ?? storedClass,
        minutes_played: s.minutes_played,
        is_provisional: s.is_provisional,
        fotmob_rating: s.fotmob_rating,
        goals_scored: s.goals_scored,
        assists: s.assists,
        own_goals: s.own_goals,
        yellow_cards: s.yellow_cards,
        red_cards: s.red_cards,
        penalties_scored: s.penalties_scored,
        penalties_missed: s.penalties_missed,
        penalties_saved: s.penalties_saved,
        clean_sheet: s.clean_sheet,
        goals_conceded: s.goals_conceded,
      }
    })

    const result = computeMatchday(inputs, engineConfig)

    const { data: maxRun } = await supabase
      .from('calculation_runs')
      .select('run_number')
      .eq('matchday_id', matchdayId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    const run_number = (maxRun?.run_number ?? 0) + 1

    const { data: run } = await supabase
      .from('calculation_runs')
      .insert({
        matchday_id: matchdayId,
        run_number,
        status: 'published',
        engine_version: engineConfig.engine_version,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config_json: engineConfig as any,
        triggered_by: null,
      })
      .select('id')
      .single()
    if (!run) {
      console.error(`Failed to create run for matchday ${matchdayId}`)
      continue
    }

    const calcRows = result.player_results.map((output) => {
      if (output.kind === 'skipped') {
        return {
          run_id: run.id,
          matchday_id: matchdayId,
          player_id: output.player_id,
          stats_id: output.stats_id,
          is_provisional: output.is_provisional,
          is_override: false,
          z_combined: null, weights_used: null, defensive_correction: null,
          z_fotmob: null, minutes_factor: null,
          z_adjusted: null, b0: null, role_multiplier: null, b1: null,
          voto_base: null,
          bonus_malus_breakdown: null, total_bonus_malus: null,
          fantavoto: null,
        }
      }
      const r = output as PlayerCalculationResult
      return {
        run_id: run.id,
        matchday_id: matchdayId,
        player_id: r.player_id,
        stats_id: r.stats_id,
        is_provisional: r.is_provisional,
        is_override: false,
        z_combined: null, weights_used: null, defensive_correction: null,
        z_fotmob: r.z_fotmob,
        minutes_factor: r.minutes_factor,
        z_adjusted: r.z_adjusted,
        b0: r.b0,
        role_multiplier: r.role_multiplier,
        b1: r.b1,
        voto_base: r.voto_base,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bonus_malus_breakdown: r.bonus_malus_breakdown as any,
        total_bonus_malus: r.total_bonus_malus,
        fantavoto: r.fantavoto,
      }
    })

    const { error } = await supabase.from('player_calculations').insert(calcRows)
    if (error) {
      console.error(`Failed to insert calcs for matchday ${matchdayId}: ${error.message}`)
      continue
    }

    console.log(`✓ Matchday ${matchdayId}: ${result.scored_count} scored, ${result.skipped_count} skipped (run #${run_number})`)
  }

  console.log('Recompute complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
