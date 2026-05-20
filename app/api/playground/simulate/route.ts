// ============================================================
// app/api/playground/simulate/route.ts
// ============================================================
// POST /api/playground/simulate
//
// Body: {
//   matchday_id: string,
//   engine_config_overrides?: Partial<LeagueEngineConfig> (column-level),
//   result_rules_overrides?: Partial<ResultRulesConfig>,
//   include_battle_royale?: boolean (default true)
// }
//
// Loads the matchday snapshot, applies overrides, runs recomputeMatchday(),
// and returns the simulated state. NEVER persists.
// ============================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { loadMatchdaySnapshot } from '@/lib/playground/loadSnapshot'
import { buildEngineConfig } from '@/domain/engine/v1/config'
import { recomputeMatchday } from '@/domain/engine/v1/recomputeMatchday'
import type {
  CompetitionRoundInput,
  RecomputeOutput,
} from '@/domain/engine/v1/recomputeMatchday'
import { generateBattleRoyalePairings } from '@/domain/competitions/battleRoyalePairing'
import { DEFAULT_RESULT_RULES, type ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { Database } from '@/types/database.types'

// ---- Request validation ------------------------------------

const goalThresholdSchema = z.object({ min: z.number(), goals: z.number().int().nonnegative() })
const smoothingSchema = z.object({
  drawIfDiffBelow: z.number().nonnegative(),
  drawIf1GoalLeadAndDiffBelow: z.number().nonnegative(),
})
const pointsSchema = z.object({
  win: z.number(),
  draw: z.number(),
  loss: z.number(),
})

const resultRulesOverrideSchema = z.object({
  thresholds: z.array(goalThresholdSchema).optional(),
  smoothing: smoothingSchema.optional(),
  points: pointsSchema.optional(),
})

// Engine overrides mirror the league_engine_config columns. All optional.
const engineOverrideSchema = z
  .object({
    minutes_factor_threshold: z.number(),
    minutes_factor_partial: z.number(),
    minutes_factor_full: z.number(),
    goal_bonus_gk: z.number(),
    goal_bonus_def: z.number(),
    goal_bonus_mid: z.number(),
    goal_bonus_att: z.number(),
    penalty_scored_discount: z.number(),
    brace_bonus: z.number(),
    hat_trick_bonus: z.number(),
    assist: z.number(),
    own_goal: z.number(),
    yellow_card: z.number(),
    red_card: z.number(),
    penalty_missed: z.number(),
    penalty_saved: z.number(),
    clean_sheet_gk: z.number(),
    clean_sheet_def: z.number(),
    clean_sheet_min_minutes: z.number().int(),
    goals_conceded_gk: z.number(),
    goals_conceded_def: z.number(),
    goals_conceded_def_min_minutes: z.number().int(),
    role_multiplier_gk: z.number(),
    role_multiplier_def: z.number(),
    role_multiplier_mid: z.number(),
    role_multiplier_att: z.number(),
    rating_mean: z.number(),
    rating_std: z.number(),
    target_mean_vote: z.number(),
    target_vote_std: z.number(),
    voto_base_cap_min: z.number(),
    voto_base_cap_max: z.number(),
  })
  .partial()

const bodySchema = z.object({
  matchday_id: z.string().uuid(),
  engine_config_overrides: engineOverrideSchema.optional(),
  result_rules_overrides: resultRulesOverrideSchema.optional(),
  include_battle_royale: z.boolean().default(true),
})

// ---- Response shape ----------------------------------------

export interface SimulationResponse {
  matchday_id: string
  team_scores: RecomputeOutput['teamScores']
  competition_results: Array<{
    competition_id: string
    label: string
    fixtures: RecomputeOutput['competitionResults'][number]['fixtures']
    standings: RecomputeOutput['competitionResults'][number]['standings']
  }>
}

// ---- Handler -----------------------------------------------

export async function POST(req: Request) {
  let ctx
  try {
    ctx = await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let parsed
  try {
    parsed = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: String(err) }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify matchday belongs to this league
  const { data: md } = await supabase
    .from('matchdays')
    .select('id, league_id')
    .eq('id', parsed.matchday_id)
    .maybeSingle()

  if (!md || md.league_id !== ctx.league.id) {
    return NextResponse.json({ error: 'Matchday not found' }, { status: 404 })
  }

  const { snapshot, error } = await loadMatchdaySnapshot(supabase, parsed.matchday_id, ctx.league.id)
  if (!snapshot) {
    return NextResponse.json({ error: error ?? 'Snapshot load failed' }, { status: 500 })
  }

  // Merge engine config: DB row → user overrides → buildEngineConfig
  const mergedEngineRow = mergeEngineRow(snapshot.baseEngineConfigRow, parsed.engine_config_overrides)
  const engineConfig = buildEngineConfig(mergedEngineRow)

  // Merge result rules
  const resultRules: ResultRulesConfig = {
    thresholds: parsed.result_rules_overrides?.thresholds ?? snapshot.baseResultRules.thresholds,
    smoothing: parsed.result_rules_overrides?.smoothing ?? snapshot.baseResultRules.smoothing,
    points: parsed.result_rules_overrides?.points ?? snapshot.baseResultRules.points,
  }

  // Build the per-competition slice
  const competitions: CompetitionRoundInput[] = []

  // Campionato fixtures (real, from DB)
  if (snapshot.campionatoFixtures.length > 0) {
    const byCompRound = new Map<string, { competition_id: string; round_id: string; fixtures: Array<{ fixture_id: string; home_team_id: string; away_team_id: string }> }>()
    for (const f of snapshot.campionatoFixtures) {
      const key = `${f.competition_id}:${f.round_id}`
      if (!byCompRound.has(key)) {
        byCompRound.set(key, { competition_id: f.competition_id, round_id: f.round_id, fixtures: [] })
      }
      byCompRound.get(key)!.fixtures.push({
        fixture_id: f.fixture_id,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
      })
    }
    for (const slice of byCompRound.values()) {
      competitions.push({
        competition_id: slice.competition_id,
        round_id: slice.round_id,
        fixtures: slice.fixtures,
        priorStandings: [], // Playground does not aggregate season-long for now
        tiebreakerOrder: ['points', 'goal_difference', 'goals_for', 'total_fantavoto'],
      })
    }
  }

  // Battle Royale (synthetic — no DB rows yet)
  if (parsed.include_battle_royale && snapshot.teamIds.length >= 2) {
    const brFixtures = generateBattleRoyalePairings(
      snapshot.teamIds,
      (h, a) => `br-sim:${h}:${a}`
    )
    competitions.push({
      competition_id: 'br-sim',
      round_id: `br-sim:${parsed.matchday_id}`,
      fixtures: brFixtures,
      priorStandings: [],
      tiebreakerOrder: ['points', 'total_fantavoto', 'goal_difference', 'goals_for'],
    })
  }

  const result = recomputeMatchday({
    engineConfig,
    resultRules,
    playerStats: snapshot.playerStats,
    overrides: snapshot.overrides,
    lineupPlayers: snapshot.lineupPlayers,
    submissionTeamMap: snapshot.submissionTeamMap,
    slotRolesMap: snapshot.slotRolesMap,
    competitions,
  })

  const labelled = result.competitionResults.map((cr) => ({
    competition_id: cr.competition_id,
    label: cr.competition_id === 'br-sim' ? 'Battle Royale (sim)' : 'Campionato',
    fixtures: cr.fixtures,
    standings: cr.standings,
  }))

  const response: SimulationResponse = {
    matchday_id: parsed.matchday_id,
    team_scores: result.teamScores,
    competition_results: labelled,
  }

  return NextResponse.json(response)
}

// ---- Helpers -----------------------------------------------

type EngineRow = Database['public']['Tables']['league_engine_config']['Row']

function mergeEngineRow(
  base: EngineRow | null,
  overrides: z.infer<typeof engineOverrideSchema> | undefined
): EngineRow | null {
  if (!base && !overrides) return null
  if (!base) return null // Without a base row, buildEngineConfig already returns DEFAULT — overrides alone are not enough to satisfy NOT NULL columns
  if (!overrides) return base
  return { ...base, ...overrides } as EngineRow
}
