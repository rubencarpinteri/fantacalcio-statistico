// ============================================================
// app/api/recompute-all/route.ts
// ============================================================
// POST /api/recompute-all
//
// Saves new engine config + result rules to the league, then
// retroactively recomputes every matchday that has published
// team scores, and recomputes all active competition rounds.
//
// All engine glue lives in lib/engine/retroactiveRecompute.ts —
// this route handler is purely orchestration: parse → save
// config → loop → audit → respond.
//
// Body: {
//   engine_config_overrides?: Partial<LeagueEngineConfig>,
//   result_rules_overrides?: Partial<ResultRulesConfig>,
//   dry_run?: boolean   // if true: count affected matchdays, no writes
// }
// ============================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { buildEngineConfig } from '@/domain/engine/v1/config'
import { writeAuditLog } from '@/lib/audit'
import type { ResultRulesConfig } from '@/domain/competitions/resultRules'
import {
  recomputeOneMatchday,
  recomputeCompetitionRounds,
  parseResultRules,
} from '@/lib/engine/retroactiveRecompute'
import type { Database, Json } from '@/types/database.types'
import type { ScoringConfig } from '@/domain/competitions/computeRound'

// ---- Zod schemas (mirror simulate route) --------------------

const goalThresholdSchema = z.object({ min: z.number(), goals: z.number().int().nonnegative() })
const smoothingSchema = z.object({
  drawIfDiffBelow: z.number().nonnegative(),
  drawIf1GoalLeadAndDiffBelow: z.number().nonnegative(),
})
const pointsSchema = z.object({ win: z.number(), draw: z.number(), loss: z.number() })

const resultRulesOverrideSchema = z.object({
  thresholds: z.array(goalThresholdSchema).optional(),
  smoothing: smoothingSchema.optional(),
  points: pointsSchema.optional(),
})

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
  engine_config_overrides: engineOverrideSchema.optional(),
  result_rules_overrides: resultRulesOverrideSchema.optional(),
  dry_run: z.boolean().default(false),
})

// ---- Response types ----------------------------------------

export interface MatchdayResult {
  matchday_id: string
  label: string
  status: 'ok' | 'skipped' | 'error'
  run_id?: string
  error?: string
}

export interface RecomputeAllResponse {
  dry_run: boolean
  matchdays_found: number
  matchdays_ok: number
  matchdays_skipped: number
  matchdays_errored: number
  competitions_rounds_recomputed: number
  results: MatchdayResult[]
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
  const leagueId = ctx.league.id
  const dryRun = parsed.dry_run

  // ---- 1. Determine affected matchdays ---------------------
  // Load all matchdays that have published_team_scores (only these
  // need recomputing — they are the ones competitions depend on).
  const { data: publishedScoreRows } = await supabase
    .from('published_team_scores')
    .select('matchday_id')
    .eq('league_id', leagueId)

  const affectedMatchdayIds = [...new Set((publishedScoreRows ?? []).map((r) => r.matchday_id))]

  if (affectedMatchdayIds.length === 0) {
    return NextResponse.json<RecomputeAllResponse>({
      dry_run: dryRun,
      matchdays_found: 0,
      matchdays_ok: 0,
      matchdays_skipped: 0,
      matchdays_errored: 0,
      competitions_rounds_recomputed: 0,
      results: [],
    })
  }

  const { data: matchdayMeta } = await supabase
    .from('matchdays')
    .select('id, matchday_number, name')
    .in('id', affectedMatchdayIds)
    .eq('league_id', leagueId)
    .order('matchday_number', { ascending: true })

  if (dryRun) {
    return NextResponse.json<RecomputeAllResponse>({
      dry_run: true,
      matchdays_found: matchdayMeta?.length ?? 0,
      matchdays_ok: 0,
      matchdays_skipped: 0,
      matchdays_errored: 0,
      competitions_rounds_recomputed: 0,
      results: (matchdayMeta ?? []).map((m) => ({
        matchday_id: m.id,
        label: m.name ?? `Giornata ${m.matchday_number}`,
        status: 'ok',
      })),
    })
  }

  // ---- 2. Save new configs to DB --------------------------

  // 2a. Engine config — update only the keys specified in overrides
  if (parsed.engine_config_overrides && Object.keys(parsed.engine_config_overrides).length > 0) {
    await supabase
      .from('league_engine_config')
      .update(parsed.engine_config_overrides)
      .eq('league_id', leagueId)
  }

  // 2b. Result rules — merge onto current leagues.result_rules
  const { data: leagueRaw } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .maybeSingle()

  const leagueAny = leagueRaw as unknown as { result_rules?: unknown } | null
  const currentRules = parseResultRules(leagueAny?.result_rules)
  const newResultRules: ResultRulesConfig = {
    thresholds: parsed.result_rules_overrides?.thresholds ?? currentRules.thresholds,
    smoothing: parsed.result_rules_overrides?.smoothing ?? currentRules.smoothing,
    points: parsed.result_rules_overrides?.points ?? currentRules.points,
  }

  if (parsed.result_rules_overrides) {
    await supabase
      .from('leagues')
      .update(
        { result_rules: newResultRules } as unknown as Database['public']['Tables']['leagues']['Update']
      )
      .eq('id', leagueId)
  }

  // 2c. Update all active competitions' scoring_config to match new result rules
  const scoringConfig: ScoringConfig = {
    method: 'goal_thresholds',
    thresholds: newResultRules.thresholds,
    smoothing: newResultRules.smoothing,
    points: newResultRules.points,
  }

  await supabase
    .from('competitions')
    .update({ scoring_config: scoringConfig as unknown as Json })
    .eq('league_id', leagueId)
    .eq('status', 'active')

  // ---- 3. Load fresh engine config from DB ----------------
  const { data: freshEngineRow } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle()

  const engineConfig = buildEngineConfig(freshEngineRow ?? null)

  // ---- 4. Display rounding helper -------------------------
  const roundingMode = ctx.league.display_rounding
  function applyRounding(value: number | null): number | null {
    if (value === null) return null
    if (roundingMode === 'nearest_half') return Math.round(value * 2) / 2
    return Math.round(value * 10) / 10 // one_decimal (default)
  }

  // ---- 5. Recompute each matchday -------------------------
  const results: MatchdayResult[] = []
  let matchdaysOk = 0
  let matchdaysSkipped = 0
  let matchdaysErrored = 0
  const recomputedMatchdayIds: string[] = []

  for (const md of matchdayMeta ?? []) {
    const mdLabel = md.name ?? `Giornata ${md.matchday_number}`
    const mdResult = await recomputeOneMatchday({
      supabase,
      matchdayId: md.id,
      leagueId,
      userId: ctx.userId,
      engineConfig,
      resultRules: newResultRules,
      applyRounding,
    })

    if (mdResult.status === 'ok') {
      matchdaysOk++
      recomputedMatchdayIds.push(md.id)
    } else if (mdResult.status === 'skipped') {
      matchdaysSkipped++
    } else {
      matchdaysErrored++
    }

    results.push({ matchday_id: md.id, label: mdLabel, ...mdResult })
  }

  // ---- 6. Recompute competition rounds -------------------
  let roundsRecomputed = 0

  if (recomputedMatchdayIds.length > 0) {
    roundsRecomputed = await recomputeCompetitionRounds({
      supabase,
      leagueId,
      matchdayIds: recomputedMatchdayIds,
      scoringConfig,
    })
  }

  // ---- 7. Audit log --------------------------------------
  await writeAuditLog({
    supabase,
    leagueId,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'league',
    entityId: leagueId,
    afterJson: {
      action: 'recompute_all',
      matchdays_ok: matchdaysOk,
      matchdays_skipped: matchdaysSkipped,
      matchdays_errored: matchdaysErrored,
      rounds_recomputed: roundsRecomputed,
      engine_overrides_applied: !!parsed.engine_config_overrides,
      result_rules_overrides_applied: !!parsed.result_rules_overrides,
    },
  })

  return NextResponse.json<RecomputeAllResponse>({
    dry_run: false,
    matchdays_found: matchdayMeta?.length ?? 0,
    matchdays_ok: matchdaysOk,
    matchdays_skipped: matchdaysSkipped,
    matchdays_errored: matchdaysErrored,
    competitions_rounds_recomputed: roundsRecomputed,
    results,
  })
}
