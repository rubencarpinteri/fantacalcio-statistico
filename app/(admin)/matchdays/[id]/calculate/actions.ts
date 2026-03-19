'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { computeMatchday } from '@/domain/engine/v1/engine'
import { buildEngineConfig } from '@/domain/engine/v1/config'
import { computeRoundAction } from '@/app/(admin)/competitions/[id]/actions'
import type { EnginePlayerInput, PlayerCalculationResult } from '@/domain/engine/v1/types'
import type { Json, RatingClass } from '@/types/database.types'

// ============================================================
// triggerCalculationAction
// ============================================================
// Creates a new DRAFT calculation run for the given matchday.
// Fetches all player_match_stats, runs the pure engine, inserts
// player_calculations rows, and persists the full engine config
// as config_json on the run row.
//
// DOES NOT update matchday_current_calculation.
// The official pointer is only set on publishCalculationAction.
// Draft previews are found via the latest calculation_run row.
// ============================================================

export interface TriggerCalculationResult {
  error: string | null
  run_id: string | null
  run_number: number | null
  scored_count: number
  skipped_count: number
  override_count: number
}

export async function triggerCalculationAction(
  matchdayId: string
): Promise<TriggerCalculationResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const fail = (error: string): TriggerCalculationResult => ({
    error, run_id: null, run_number: null, scored_count: 0, skipped_count: 0, override_count: 0,
  })

  // Verify matchday belongs to this league and is in a calculable status
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return fail('Giornata non trovata.')
  if (!['scoring', 'published'].includes(matchday.status)) {
    return fail(
      `Non è possibile calcolare in stato "${matchday.status}". Porta la giornata in "scoring" prima.`
    )
  }

  // Build per-league engine config (advanced bonuses flag)
  const engineConfig = buildEngineConfig(ctx.league.advanced_bonuses_enabled)

  // Fetch all stat rows for this matchday — all fields needed by engine
  const { data: statsRows } = await supabase
    .from('player_match_stats')
    .select(`
      id,
      player_id,
      minutes_played,
      rating_class_override,
      sofascore_rating,
      whoscored_rating,
      fotmob_rating,
      is_provisional,
      goals_scored,
      assists,
      own_goals,
      yellow_cards,
      red_cards,
      penalties_scored,
      penalties_missed,
      penalties_saved,
      clean_sheet,
      goals_conceded,
      tackles_won,
      interceptions,
      clearances,
      blocks,
      aerial_duels_won,
      dribbled_past,
      saves,
      error_leading_to_goal,
      key_passes,
      expected_assists,
      successful_dribbles,
      dribble_success_rate,
      completed_passes,
      pass_accuracy,
      final_third_passes,
      progressive_passes,
      league_players ( rating_class )
    `)
    .eq('matchday_id', matchdayId)

  if (!statsRows || statsRows.length === 0) {
    return fail('Nessuna statistica trovata. Inserisci i dati prima di calcolare.')
  }

  // Map DB rows to engine inputs
  // Effective rating class: rating_class_override > stored league_players.rating_class
  const engineInputs: EnginePlayerInput[] = statsRows.map((s) => {
    const storedClass = (
      s.league_players as unknown as { rating_class: RatingClass } | null
    )?.rating_class ?? 'MID'

    return {
      player_id:       s.player_id,
      stats_id:        s.id,
      rating_class:    (s.rating_class_override as RatingClass | null) ?? storedClass,
      minutes_played:  s.minutes_played,
      is_provisional:  s.is_provisional,

      sofascore_rating: s.sofascore_rating,
      whoscored_rating: s.whoscored_rating,
      fotmob_rating:    s.fotmob_rating,

      goals_scored:       s.goals_scored,
      assists:            s.assists,
      own_goals:          s.own_goals,
      yellow_cards:       s.yellow_cards,
      red_cards:          s.red_cards,
      penalties_scored:   s.penalties_scored,
      penalties_missed:   s.penalties_missed,
      penalties_saved:    s.penalties_saved,
      clean_sheet:        s.clean_sheet,
      goals_conceded:     s.goals_conceded,

      tackles_won:            s.tackles_won,
      interceptions:          s.interceptions,
      clearances:             s.clearances,
      blocks:                 s.blocks,
      aerial_duels_won:       s.aerial_duels_won,
      dribbled_past:          s.dribbled_past,
      saves:                  s.saves,
      error_leading_to_goal:  s.error_leading_to_goal,

      key_passes:           s.key_passes,
      expected_assists:     s.expected_assists,
      successful_dribbles:  s.successful_dribbles,
      dribble_success_rate: s.dribble_success_rate,
      completed_passes:     s.completed_passes,
      pass_accuracy:        s.pass_accuracy,
      final_third_passes:   s.final_third_passes,
      progressive_passes:   s.progressive_passes,
    }
  })

  // Run the pure domain engine
  const engineResult = computeMatchday(engineInputs, engineConfig)

  // Determine run_number atomically
  const { data: maxRunRow } = await supabase
    .from('calculation_runs')
    .select('run_number')
    .eq('matchday_id', matchdayId)
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const run_number = (maxRunRow?.run_number ?? 0) + 1

  // Insert calculation_run with full config snapshot
  const { data: run, error: runError } = await supabase
    .from('calculation_runs')
    .insert({
      matchday_id: matchdayId,
      run_number,
      status: 'draft',
      engine_version: engineConfig.engine_version,
      config_json: engineConfig as unknown as Json,
      triggered_by: ctx.userId,
    })
    .select('id')
    .single()

  if (runError || !run) {
    return fail(`Errore creazione run: ${runError?.message ?? 'sconosciuto'}`)
  }

  const runId = run.id

  // Build player_calculations insert rows
  const calcRows = engineResult.player_results.map((output) => {
    if (output.kind === 'skipped') {
      return {
        run_id:    runId,
        matchday_id: matchdayId,
        player_id: output.player_id,
        stats_id:  output.stats_id,
        is_provisional: output.is_provisional,
        is_override: false,
        z_sofascore: null, z_whoscored: null, z_fotmob: null,
        z_combined: null, weights_used: null, minutes_factor: null,
        z_adjusted: null, b0: null, role_multiplier: null, b1: null,
        defensive_correction: null, voto_base: null,
        bonus_malus_breakdown: null, total_bonus_malus: null,
        fantavoto: null,
      }
    }

    const r = output as PlayerCalculationResult
    return {
      run_id:     runId,
      matchday_id: matchdayId,
      player_id:  r.player_id,
      stats_id:   r.stats_id,
      is_provisional: r.is_provisional,
      is_override: false,
      z_sofascore:          r.z_sofascore,
      z_whoscored:          r.z_whoscored,
      z_fotmob:             r.z_fotmob,
      z_combined:           r.z_combined,
      weights_used:         r.weights_used as unknown as Json,
      minutes_factor:       r.minutes_factor,
      z_adjusted:           r.z_adjusted,
      b0:                   r.b0,
      role_multiplier:      r.role_multiplier,
      b1:                   r.b1,
      defensive_correction: r.defensive_correction,
      voto_base:            r.voto_base,
      bonus_malus_breakdown: r.bonus_malus_breakdown as unknown as Json,
      total_bonus_malus:    r.total_bonus_malus,
      fantavoto:            r.fantavoto,
    }
  })

  // ----------------------------------------------------------------
  // Apply active score overrides
  // ----------------------------------------------------------------
  // Fetch all active (non-removed) overrides for this matchday.
  // For each overridden player, replace fantavoto with the override value
  // and set is_override = true + override_id.
  // The engine intermediates (z-scores, b0, b1, voto_base) are preserved
  // so the breakdown is still visible in the preview.
  // ----------------------------------------------------------------
  const { data: activeOverrides } = await supabase
    .from('score_overrides')
    .select('id, player_id, override_fantavoto')
    .eq('matchday_id', matchdayId)
    .is('removed_at', null)

  if (activeOverrides && activeOverrides.length > 0) {
    const overrideMap = new Map(
      activeOverrides.map((o) => [o.player_id, { id: o.id, fantavoto: o.override_fantavoto }])
    )
    for (const row of calcRows) {
      const ov = overrideMap.get(row.player_id)
      if (ov) {
        row.fantavoto   = ov.fantavoto
        row.is_override = true
        // override_id is not in the current calcRow shape — add it
        ;(row as Record<string, unknown>)['override_id'] = ov.id
      }
    }
  }

  const { error: calcError } = await supabase
    .from('player_calculations')
    .insert(calcRows)

  if (calcError) {
    return fail(`Errore inserimento calcoli: ${calcError.message}`)
  }

  // NOTE: matchday_current_calculation is NOT updated here.
  // It is updated only in publishCalculationAction.
  // Draft previews are accessed via the latest calculation_run row.

  const overrideCount = activeOverrides?.length ?? 0

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'calculation_draft',
    entityType: 'calculation_run',
    entityId: runId,
    afterJson: {
      run_number,
      engine_version: engineConfig.engine_version,
      scored_count: engineResult.scored_count,
      skipped_count: engineResult.skipped_count,
      override_count: overrideCount,
      advanced_bonus_enabled: engineConfig.advanced_bonus.enabled,
    },
  })

  revalidatePath(`/matchdays/${matchdayId}/calculate`)
  revalidatePath(`/matchdays/${matchdayId}`)

  return {
    error: null,
    run_id: runId,
    run_number,
    scored_count:  engineResult.scored_count,
    skipped_count: engineResult.skipped_count,
    override_count: overrideCount,
  }
}

// ============================================================
// publishCalculationAction
// ============================================================
// Marks the run as published, sets the official current pointer,
// transitions matchday to 'published', writes standings snapshot.
// ============================================================

// Per-round outcome from the competition cascade triggered at publish time.
export interface CompetitionCascadeResult {
  competition_name: string
  round_name: string
  round_id: string
  error: string | null
}

export interface PublishCalculationResult {
  error: string | null
  success: boolean
  competitions_updated: CompetitionCascadeResult[]
}

export async function publishCalculationAction(
  matchdayId: string,
  runId: string
): Promise<PublishCalculationResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const fail = (error: string): PublishCalculationResult => ({
    error, success: false, competitions_updated: [],
  })

  // Verify run belongs to this matchday + league
  const { data: run } = await supabase
    .from('calculation_runs')
    .select('id, run_number, status, matchday_id')
    .eq('id', runId)
    .eq('matchday_id', matchdayId)
    .single()

  if (!run) return fail('Run non trovato.')
  if (run.status === 'published') return fail('Run già pubblicato.')

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return fail('Giornata non trovata.')
  if (matchday.status === 'archived') return fail('La giornata è archiviata.')

  // Mark run as published
  const { error: runUpdateError } = await supabase
    .from('calculation_runs')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: ctx.userId,
    })
    .eq('id', runId)

  if (runUpdateError) return fail(runUpdateError.message)

  // Update official current pointer (ONLY happens at publish)
  const { error: ptrError } = await supabase
    .from('matchday_current_calculation')
    .upsert({
      matchday_id: matchdayId,
      run_id: runId,
      updated_at: new Date().toISOString(),
    })

  if (ptrError) return fail(`Errore puntatore: ${ptrError.message}`)

  // Build standings snapshot — per-team fantavoto sum for non-bench starters
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('team_id, submission_id')
    .eq('matchday_id', matchdayId)

  const submissionIds = (pointers ?? []).map((p) => p.submission_id)

  const { data: lineupPlayers } = submissionIds.length > 0
    ? await supabase
        .from('lineup_submission_players')
        .select('submission_id, player_id, is_bench')
        .in('submission_id', submissionIds)
        .eq('is_bench', false)
    : { data: [] }

  const submissionTeamMap = new Map<string, string>(
    (pointers ?? []).map((p) => [p.submission_id, p.team_id])
  )

  const { data: calculations } = await supabase
    .from('player_calculations')
    .select('player_id, fantavoto')
    .eq('run_id', runId)

  const fantaVotoMap = new Map<string, number | null>(
    (calculations ?? []).map((c) => [c.player_id, c.fantavoto])
  )

  type TeamScore = { team_id: string; total_fantavoto: number; player_count: number; nv_count: number }
  const teamScores: Record<string, TeamScore> = {}

  for (const lp of lineupPlayers ?? []) {
    const teamId = submissionTeamMap.get(lp.submission_id)
    if (!teamId) continue
    if (!teamScores[teamId]) {
      teamScores[teamId] = { team_id: teamId, total_fantavoto: 0, player_count: 0, nv_count: 0 }
    }
    const fv = fantaVotoMap.get(lp.player_id) ?? null
    teamScores[teamId]!.player_count++
    if (fv !== null) {
      teamScores[teamId]!.total_fantavoto += fv
    } else {
      teamScores[teamId]!.nv_count++
    }
  }

  const { data: lastSnapshot } = await supabase
    .from('standings_snapshots')
    .select('version_number')
    .eq('matchday_id', matchdayId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version_number = (lastSnapshot?.version_number ?? 0) + 1

  await supabase.from('standings_snapshots').insert({
    league_id: ctx.league.id,
    matchday_id: matchdayId,
    snapshot_json: {
      run_id: runId,
      engine_version: 'v1',
      team_scores: Object.values(teamScores),
    },
    published_at: new Date().toISOString(),
    version_number,
  })

  // Upsert normalized published_team_scores — operational source for competitions.
  // UNIQUE(matchday_id, team_id): republishing overwrites the previous score.
  const publishedScoreRows = Object.values(teamScores).map((ts) => ({
    league_id:       ctx.league.id,
    matchday_id:     matchdayId,
    team_id:         ts.team_id,
    run_id:          runId,
    total_fantavoto: ts.total_fantavoto,
    player_count:    ts.player_count,
    nv_count:        ts.nv_count,
    published_at:    new Date().toISOString(),
  }))
  if (publishedScoreRows.length > 0) {
    await supabase
      .from('published_team_scores')
      .upsert(publishedScoreRows, { onConflict: 'matchday_id,team_id' })
  }

  // Transition matchday to 'published' if not already
  if (matchday.status !== 'published') {
    await supabase
      .from('matchdays')
      .update({ status: 'published' })
      .eq('id', matchdayId)

    await supabase.from('matchday_status_log').insert({
      matchday_id: matchdayId,
      old_status: matchday.status,
      new_status: 'published',
      changed_by: ctx.userId,
      note: `Pubblicazione run #${run.run_number}`,
    })
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'calculation_publish',
    entityType: 'calculation_run',
    entityId: runId,
    afterJson: { run_number: run.run_number, version_number },
  })

  revalidatePath(`/matchdays/${matchdayId}/calculate`)
  revalidatePath(`/matchdays/${matchdayId}`)
  revalidatePath(`/matchdays`)

  // ----------------------------------------------------------------
  // Competition cascade (non-fatal)
  // ----------------------------------------------------------------
  // After publishing team scores, compute every active competition
  // round that is linked to this matchday and is not yet locked.
  // Failures are collected and returned to the UI but do NOT prevent
  // the publish from succeeding.
  // ----------------------------------------------------------------
  const competitions_updated: CompetitionCascadeResult[] = []

  const { data: linkedRounds } = await supabase
    .from('competition_rounds')
    .select('id, name, competitions(id, name, status, league_id)')
    .eq('matchday_id', matchdayId)
    .neq('status', 'locked')

  for (const round of linkedRounds ?? []) {
    const comp = round.competitions as unknown as {
      id: string; name: string; status: string; league_id: string
    } | null

    // Only cascade to active competitions belonging to this league
    if (!comp || comp.league_id !== ctx.league.id || comp.status !== 'active') continue

    let cascadeError: string | null = null
    try {
      const roundResult = await computeRoundAction(round.id)
      cascadeError = roundResult.error
    } catch (err) {
      cascadeError = err instanceof Error ? err.message : 'Errore sconosciuto'
    }

    competitions_updated.push({
      competition_name: comp.name,
      round_name:       round.name,
      round_id:         round.id,
      error:            cascadeError,
    })
  }

  return { error: null, success: true, competitions_updated }
}
