// ============================================================
// Retroactive recompute helpers
// ============================================================
// Pulled out of app/api/recompute-all/route.ts so the route
// handler is a thin orchestrator over engine glue.
//
// Two main exports:
//   - recomputeOneMatchday(): runs the v1 engine over a single
//     matchday's snapshot and persists the result.
//   - recomputeCompetitionRounds(): for each affected matchday,
//     re-runs the competition engine on every linked round.
//
// Plus a couple of internal helpers (loadPriorStandings,
// parseResultRules) that live here for the same reason.

import { loadMatchdaySnapshot } from '@/lib/playground/loadSnapshot'
import { recomputeMatchday } from '@/domain/engine/v1/recomputeMatchday'
import { computeRound } from '@/domain/competitions/computeRound'
import { DEFAULT_RESULT_RULES, type ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { CompetitionRoundInput } from '@/domain/engine/v1/recomputeMatchday'
import type { FixtureInput, TeamStandingRow, ScoringConfig } from '@/domain/competitions/computeRound'
import type { EngineConfig, PlayerCalculationResult } from '@/domain/engine/v1/types'
import type { Database, Json } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

type Supabase = SupabaseClient<Database>

// ============================================================
// Per-matchday recompute + persist
// ============================================================

export interface RecomputeOneInput {
  supabase: Supabase
  matchdayId: string
  leagueId: string
  userId: string
  engineConfig: EngineConfig
  resultRules: ResultRulesConfig
  applyRounding: (v: number | null) => number | null
}

export async function recomputeOneMatchday(
  input: RecomputeOneInput
): Promise<{ status: 'ok' | 'skipped' | 'error'; run_id?: string; error?: string }> {
  const { supabase, matchdayId, leagueId, userId, engineConfig, resultRules, applyRounding } = input

  const { snapshot, error: snapshotError } = await loadMatchdaySnapshot(
    supabase,
    matchdayId,
    leagueId
  )

  if (!snapshot) {
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
        z_rating: null as number | null,
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
      z_rating: r.z_rating,
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

export async function recomputeCompetitionRounds({
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

  const { data: activeComps } = await supabase
    .from('competitions')
    .select('id, type, tiebreaker_config')
    .eq('league_id', leagueId)
    .eq('status', 'active')

  if (!activeComps || activeComps.length === 0) return 0

  for (const comp of activeComps) {
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

      const { data: scores } = await supabase
        .from('published_team_scores')
        .select('team_id, total_fantavoto')
        .eq('matchday_id', round.matchday_id)
        .eq('league_id', leagueId)

      if (!scores || scores.length === 0) continue

      const fantaVotoMap = new Map<string, number>(
        scores.map((s) => [s.team_id, Number(s.total_fantavoto)])
      )

      let fixtureInputs: FixtureInput[]

      if (comp.type === 'battle_royale') {
        const { data: enrolled } = await supabase
          .from('competition_teams')
          .select('team_id')
          .eq('competition_id', comp.id)

        const teamIds = (enrolled ?? []).map((t) => t.team_id)
        if (teamIds.length < 2) continue

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

      const priorStandings = await loadPriorStandings(supabase, comp.id, round.round_number)

      const roundResult = computeRound(fixtureInputs, fantaVotoMap, scoringConfig, priorStandings, tiebreakerOrder)

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

      await supabase
        .from('competition_rounds')
        .update({ status: 'computed', computed_at: new Date().toISOString() })
        .eq('id', round.id)

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

  const { data: snapshotRoundRows } = await supabase
    .from('competition_standings_snapshots')
    .select('after_round_id')
    .eq('competition_id', competitionId)

  const roundIdsWithSnapshot = [...new Set((snapshotRoundRows ?? []).map((s) => s.after_round_id))]
  if (roundIdsWithSnapshot.length === 0) return []

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

export function parseResultRules(raw: unknown): ResultRulesConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_RESULT_RULES
  const r = raw as Partial<ResultRulesConfig>
  return {
    thresholds: Array.isArray(r.thresholds) ? r.thresholds : DEFAULT_RESULT_RULES.thresholds,
    smoothing: r.smoothing ?? DEFAULT_RESULT_RULES.smoothing,
    points: r.points ?? DEFAULT_RESULT_RULES.points,
  }
}
