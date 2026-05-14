// ============================================================
// app/api/recompute-all/route.ts
// ============================================================
// POST /api/recompute-all
//
// Saves new engine config + result rules to the league, then
// retroactively recomputes every matchday that has published
// team scores, and recomputes all active competition rounds.
//
// Body: {
//   engine_config_overrides?: Partial<LeagueEngineConfig>,
//   result_rules_overrides?: Partial<ResultRulesConfig>,
//   dry_run?: boolean   // if true: count affected matchdays, no writes
// }
//
// Response: {
//   dry_run: boolean,
//   matchdays_found: number,
//   matchdays_ok: number,
//   matchdays_skipped: number,
//   matchdays_errored: number,
//   competitions_rounds_recomputed: number,
//   results: MatchdayResult[],
// }
// ============================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { loadMatchdaySnapshot } from '@/lib/playground/loadSnapshot'
import { buildEngineConfig } from '@/domain/engine/v1/config'
import { recomputeMatchday } from '@/domain/engine/v1/recomputeMatchday'
import { computeRound } from '@/domain/competitions/computeRound'
import { writeAuditLog } from '@/lib/audit'
import { DEFAULT_RESULT_RULES, type ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { Database, Json } from '@/types/database.types'
import type { CompetitionRoundInput } from '@/domain/engine/v1/recomputeMatchday'
import type { FixtureInput, TeamStandingRow, ScoringConfig } from '@/domain/competitions/computeRound'
import type { EngineConfig, PlayerCalculationResult } from '@/domain/engine/v1/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type Supabase = SupabaseClient<Database>

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
    fotmob_mean: z.number(),
    fotmob_std: z.number(),
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

  // Fetch matchday metadata ordered by matchday_number for sequential processing
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

  // Save result_rules back to leagues (cast through unknown — result_rules not in generated types yet)
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

// ============================================================
// Per-matchday recompute + persist
// ============================================================

interface RecomputeOneInput {
  supabase: Supabase
  matchdayId: string
  leagueId: string
  userId: string
  engineConfig: EngineConfig
  resultRules: ResultRulesConfig
  applyRounding: (v: number | null) => number | null
}

async function recomputeOneMatchday(
  input: RecomputeOneInput
): Promise<{ status: 'ok' | 'skipped' | 'error'; run_id?: string; error?: string }> {
  const { supabase, matchdayId, leagueId, userId, engineConfig, resultRules, applyRounding } = input

  // Load the full snapshot for this matchday
  const { snapshot, error: snapshotError } = await loadMatchdaySnapshot(
    supabase,
    matchdayId,
    leagueId
  )

  if (!snapshot) {
    // No stats / no players — skip silently
    return { status: 'skipped', error: snapshotError ?? 'No snapshot data' }
  }

  if (snapshot.playerStats.length === 0) {
    return { status: 'skipped', error: 'No player stats' }
  }

  // Build competition inputs from campionato fixtures in the snapshot
  const competitions: CompetitionRoundInput[] = []
  if (snapshot.campionatoFixtures.length > 0) {
    const byCompRound = new Map<
      string,
      { competition_id: string; round_id: string; fixtures: Array<{ fixture_id: string; home_team_id: string; away_team_id: string }> }
    >()
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
        priorStandings: [],
        tiebreakerOrder: ['points', 'goal_difference', 'goals_for', 'total_fantavoto'],
      })
    }
  }

  // Run the pure engine
  const recomputed = recomputeMatchday({
    engineConfig,
    resultRules,
    playerStats: snapshot.playerStats,
    overrides: snapshot.overrides,
    lineupPlayers: snapshot.lineupPlayers,
    submissionTeamMap: snapshot.submissionTeamMap,
    slotRolesMap: snapshot.slotRolesMap,
    competitions,
  })

  // ---- Persist: calculation_run (published) ---------------
  const { data: maxRunRow } = await supabase
    .from('calculation_runs')
    .select('run_number')
    .eq('matchday_id', matchdayId)
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const run_number = (maxRunRow?.run_number ?? 0) + 1

  const { data: run, error: runError } = await supabase
    .from('calculation_runs')
    .insert({
      matchday_id: matchdayId,
      run_number,
      status: 'published',
      engine_version: engineConfig.engine_version,
      config_json: engineConfig as unknown as Json,
      triggered_by: userId,
      published_at: new Date().toISOString(),
      published_by: userId,
    })
    .select('id')
    .single()

  if (runError || !run) {
    return { status: 'error', error: `Errore creazione run: ${runError?.message ?? 'sconosciuto'}` }
  }

  const runId = run.id

  // ---- Persist: player_calculations -----------------------
  // Fetch override IDs from DB (we need the actual row IDs for override_id FK)
  const { data: dbOverrides } = await supabase
    .from('score_overrides')
    .select('id, player_id')
    .eq('matchday_id', matchdayId)
    .is('removed_at', null)

  const overrideDbIdMap = new Map((dbOverrides ?? []).map((o) => [o.player_id, o.id]))

  const calcRows = recomputed.playerCalculations.map((pc) => {
    const output = pc.output
    const roundedFv = applyRounding(pc.effective_fantavoto)

    if (output.kind === 'skipped') {
      return {
        run_id: runId,
        matchday_id: matchdayId,
        player_id: output.player_id,
        stats_id: output.stats_id,
        is_provisional: output.is_provisional,
        is_override: false,
        override_id: null as string | null,
        z_fotmob: null as number | null,
        z_combined: null as number | null,
        z_adjusted: null as number | null,
        b0: null as number | null,
        b1: null as number | null,
        voto_base: null as number | null,
        minutes_factor: null as number | null,
        role_multiplier: null as number | null,
        bonus_malus_breakdown: null as Json | null,
        total_bonus_malus: null as number | null,
        fantavoto: null as number | null,
        weights_used: null as Json | null,
        defensive_correction: null as number | null,
      }
    }

    const r = output as PlayerCalculationResult
    return {
      run_id: runId,
      matchday_id: matchdayId,
      player_id: r.player_id,
      stats_id: r.stats_id,
      is_provisional: r.is_provisional,
      is_override: pc.is_override,
      override_id: pc.is_override ? (overrideDbIdMap.get(r.player_id) ?? null) : null,
      z_fotmob: r.z_fotmob,
      z_combined: null,
      z_adjusted: r.z_adjusted,
      b0: r.b0,
      b1: r.b1,
      voto_base: r.voto_base,
      minutes_factor: r.minutes_factor,
      role_multiplier: r.role_multiplier,
      bonus_malus_breakdown: r.bonus_malus_breakdown as unknown as Json,
      total_bonus_malus: r.total_bonus_malus,
      fantavoto: roundedFv,
      weights_used: null,
      defensive_correction: null,
    }
  })

  const { error: calcError } = await supabase.from('player_calculations').insert(calcRows)
  if (calcError) {
    return { status: 'error', error: `Errore inserimento calcoli: ${calcError.message}` }
  }

  // ---- Persist: matchday_current_calculation pointer ------
  await supabase.from('matchday_current_calculation').upsert({
    matchday_id: matchdayId,
    run_id: runId,
    updated_at: new Date().toISOString(),
  })

  // ---- Persist: published_team_scores ---------------------
  // Derive from the bench-substituted team scores produced by recomputeMatchday
  const publishedScoreRows = recomputed.teamScores.map((ts) => ({
    league_id: leagueId,
    matchday_id: matchdayId,
    team_id: ts.team_id,
    run_id: runId,
    total_fantavoto: ts.total_fantavoto,
    player_count: ts.player_count,
    nv_count: ts.nv_count,
    published_at: new Date().toISOString(),
  }))

  if (publishedScoreRows.length > 0) {
    const { error: scoreError } = await supabase
      .from('published_team_scores')
      .upsert(publishedScoreRows, { onConflict: 'matchday_id,team_id' })

    if (scoreError) {
      return { status: 'error', error: `Errore upsert punteggi: ${scoreError.message}` }
    }
  }

  // ---- Persist: standings_snapshot for this matchday ------
  const { data: lastSnap } = await supabase
    .from('standings_snapshots')
    .select('version_number')
    .eq('matchday_id', matchdayId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version_number = (lastSnap?.version_number ?? 0) + 1

  await supabase.from('standings_snapshots').insert({
    league_id: leagueId,
    matchday_id: matchdayId,
    snapshot_json: {
      run_id: runId,
      engine_version: engineConfig.engine_version,
      team_scores: recomputed.teamScores,
    } as unknown as Json,
    published_at: new Date().toISOString(),
    version_number,
  })

  return { status: 'ok', run_id: runId }
}

// ============================================================
// Recompute all active competition rounds linked to matchdays
// ============================================================

async function recomputeCompetitionRounds({
  supabase,
  leagueId,
  matchdayIds,
  scoringConfig,
}: {
  supabase: Supabase
  leagueId: string
  matchdayIds: string[]
  scoringConfig: ScoringConfig
}): Promise<number> {
  let roundsRecomputed = 0

  // Find all active competitions in the league
  const { data: activeComps } = await supabase
    .from('competitions')
    .select('id, type, tiebreaker_config')
    .eq('league_id', leagueId)
    .eq('status', 'active')

  if (!activeComps || activeComps.length === 0) return 0

  for (const comp of activeComps) {
    // Get all rounds for this competition that are linked to one of our matchdays,
    // ordered by round_number so prior standings are built up correctly.
    const { data: rounds } = await supabase
      .from('competition_rounds')
      .select('id, round_number, matchday_id, status')
      .eq('competition_id', comp.id)
      .in('matchday_id', matchdayIds)
      .neq('status', 'locked')
      .order('round_number', { ascending: true })

    if (!rounds || rounds.length === 0) continue

    const tiebreakerOrder =
      (comp.tiebreaker_config as string[] | null) ??
      ['points', 'goal_difference', 'goals_for', 'total_fantavoto']

    for (const round of rounds) {
      if (!round.matchday_id) continue

      // Fetch published team scores for this matchday
      const { data: scores } = await supabase
        .from('published_team_scores')
        .select('team_id, total_fantavoto')
        .eq('matchday_id', round.matchday_id)
        .eq('league_id', leagueId)

      if (!scores || scores.length === 0) continue

      const fantaVotoMap = new Map<string, number>(
        scores.map((s) => [s.team_id, Number(s.total_fantavoto)])
      )

      // Build fixture inputs
      let fixtureInputs: FixtureInput[]

      if (comp.type === 'battle_royale') {
        // Auto-generate all pairs from enrolled teams
        const { data: enrolled } = await supabase
          .from('competition_teams')
          .select('team_id')
          .eq('competition_id', comp.id)

        const teamIds = (enrolled ?? []).map((t) => t.team_id)
        if (teamIds.length < 2) continue

        // Delete previous fixtures for this round and regenerate
        await supabase.from('competition_fixtures').delete().eq('round_id', round.id)

        const insertRows: Array<{ competition_id: string; round_id: string; home_team_id: string; away_team_id: string }> = []
        for (let i = 0; i < teamIds.length; i++) {
          for (let j = i + 1; j < teamIds.length; j++) {
            insertRows.push({
              competition_id: comp.id,
              round_id: round.id,
              home_team_id: teamIds[i]!,
              away_team_id: teamIds[j]!,
            })
          }
        }

        const { data: created, error: insErr } = await supabase
          .from('competition_fixtures')
          .insert(insertRows)
          .select('id, home_team_id, away_team_id')

        if (insErr || !created) continue

        fixtureInputs = created.map((f) => ({
          fixture_id: f.id,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,
        }))
      } else {
        // Campionato / Coppa: use existing fixture shells
        const { data: existing } = await supabase
          .from('competition_fixtures')
          .select('id, home_team_id, away_team_id')
          .eq('round_id', round.id)

        if (!existing || existing.length === 0) continue

        fixtureInputs = existing.map((f) => ({
          fixture_id: f.id,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,
        }))
      }

      // Load prior standings from the previous computed round
      const priorStandings = await loadPriorStandings(supabase, comp.id, round.round_number)

      // Run pure computation
      const roundResult = computeRound(fixtureInputs, fantaVotoMap, scoringConfig, priorStandings, tiebreakerOrder)

      // Upsert fixture results
      for (const fr of roundResult.fixtures) {
        await supabase
          .from('competition_fixtures')
          .update({
            home_fantavoto: fr.home_fantavoto,
            away_fantavoto: fr.away_fantavoto,
            home_score: fr.home_score,
            away_score: fr.away_score,
            result: fr.result,
            home_points: fr.home_points,
            away_points: fr.away_points,
            computed_at: new Date().toISOString(),
          })
          .eq('id', fr.fixture_id)
      }

      // Mark round as computed
      await supabase
        .from('competition_rounds')
        .update({ status: 'computed', computed_at: new Date().toISOString() })
        .eq('id', round.id)

      // Write new standings snapshot (append-only)
      const { data: lastSnap } = await supabase
        .from('competition_standings_snapshots')
        .select('version_number')
        .eq('competition_id', comp.id)
        .eq('after_round_id', round.id)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const version_number = (lastSnap?.version_number ?? 0) + 1

      await supabase.from('competition_standings_snapshots').insert({
        competition_id: comp.id,
        league_id: leagueId,
        after_round_id: round.id,
        version_number,
        snapshot_json: { type: 'table', rows: roundResult.standings } as unknown as Json,
      })

      roundsRecomputed++
    }
  }

  return roundsRecomputed
}

// ---- Load prior standings for a competition round ----------

async function loadPriorStandings(
  supabase: Supabase,
  competitionId: string,
  currentRoundNumber: number
): Promise<TeamStandingRow[]> {
  if (currentRoundNumber <= 1) return []

  // Find rounds with snapshots for this competition
  const { data: snapshotRoundRows } = await supabase
    .from('competition_standings_snapshots')
    .select('after_round_id')
    .eq('competition_id', competitionId)

  const roundIdsWithSnapshot = [...new Set((snapshotRoundRows ?? []).map((s) => s.after_round_id))]
  if (roundIdsWithSnapshot.length === 0) return []

  // Pick the highest round_number strictly below current
  const { data: precedingRound } = await supabase
    .from('competition_rounds')
    .select('id')
    .eq('competition_id', competitionId)
    .lt('round_number', currentRoundNumber)
    .in('id', roundIdsWithSnapshot)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!precedingRound) return []

  // Latest snapshot for that round
  const { data: priorSnap } = await supabase
    .from('competition_standings_snapshots')
    .select('snapshot_json')
    .eq('competition_id', competitionId)
    .eq('after_round_id', precedingRound.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!priorSnap?.snapshot_json) return []

  const json = priorSnap.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
  if (json.type === 'table' && Array.isArray(json.rows)) {
    return json.rows
  }
  return []
}

// ---- Helpers -----------------------------------------------

function parseResultRules(raw: unknown): ResultRulesConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_RESULT_RULES
  const r = raw as Partial<ResultRulesConfig>
  return {
    thresholds: Array.isArray(r.thresholds) ? r.thresholds : DEFAULT_RESULT_RULES.thresholds,
    smoothing: r.smoothing ?? DEFAULT_RESULT_RULES.smoothing,
    points: r.points ?? DEFAULT_RESULT_RULES.points,
  }
}
