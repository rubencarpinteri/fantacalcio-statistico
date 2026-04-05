'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { generateRoundRobin } from '@/domain/competitions/roundRobin'
import { computeRound } from '@/domain/competitions/computeRound'
import type { ScoringConfig, FixtureInput, TeamStandingRow } from '@/domain/competitions/computeRound'
import type { Json } from '@/types/database.types'

// ---- Shared result type ------------------------------------

export interface ActionResult {
  error: string | null
  success: boolean
}

// ============================================================
// enrollTeamsAction
// ============================================================
// Bulk-enrolls a list of fantasy team IDs into the competition.
// Ignores teams already enrolled (upsert on conflict do nothing).
// ============================================================

export async function enrollTeamsAction(
  competitionId: string,
  teamIds: string[]
): Promise<ActionResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  if (teamIds.length === 0) return { error: 'Seleziona almeno una squadra.', success: false }

  const { data: comp } = await supabase
    .from('competitions')
    .select('id')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return { error: 'Competizione non trovata.', success: false }

  const rows = teamIds.map((tid) => ({ competition_id: competitionId, team_id: tid }))
  const { error } = await supabase
    .from('competition_teams')
    .upsert(rows, { onConflict: 'competition_id,team_id', ignoreDuplicates: true })

  if (error) return { error: error.message, success: false }

  revalidatePath(`/competitions/${competitionId}/teams`)
  revalidatePath(`/competitions/${competitionId}`)
  return { error: null, success: true }
}

// ============================================================
// unenrollTeamAction
// ============================================================

export async function unenrollTeamAction(
  competitionId: string,
  teamId: string
): Promise<ActionResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, status')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return { error: 'Competizione non trovata.', success: false }
  if (comp.status === 'active') {
    return { error: 'Non è possibile rimuovere squadre da una competizione attiva.', success: false }
  }

  await supabase
    .from('competition_teams')
    .delete()
    .eq('competition_id', competitionId)
    .eq('team_id', teamId)

  revalidatePath(`/competitions/${competitionId}/teams`)
  return { error: null, success: true }
}

// ============================================================
// generateCalendarioAction
// ============================================================
// Generates a full round-robin schedule for a Campionato.
// Creates competition_rounds + competition_fixtures (shell rows, no scores yet).
// Idempotent: deletes existing rounds/fixtures for this competition first.
// legs: 1 = single round-robin (N-1 rounds); 2 = double-leg (2*(N-1) rounds).
// ============================================================

export interface GenerateCalendarioResult extends ActionResult {
  rounds_created: number
  fixtures_created: number
}

export async function generateCalendarioAction(
  competitionId: string,
  legs: 1 | 2
): Promise<GenerateCalendarioResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const fail = (error: string): GenerateCalendarioResult => ({
    error, success: false, rounds_created: 0, fixtures_created: 0,
  })

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, type, status')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return fail('Competizione non trovata.')
  if (comp.type !== 'campionato') {
    return fail('Genera calendario è disponibile solo per il Campionato.')
  }
  if (comp.status === 'active') {
    return fail(
      'Non è possibile rigenerare il calendario con la competizione attiva. Riportala in "setup" prima.'
    )
  }

  const { data: enrolledTeams } = await supabase
    .from('competition_teams')
    .select('team_id')
    .eq('competition_id', competitionId)

  if (!enrolledTeams || enrolledTeams.length < 2) {
    return fail('Iscrivi almeno 2 squadre prima di generare il calendario.')
  }

  const teamIds = enrolledTeams.map((t) => t.team_id)
  const schedule = generateRoundRobin(teamIds, legs)

  if (schedule.length === 0) return fail('Impossibile generare il calendario.')

  // Delete existing rounds (cascades to fixtures)
  await supabase.from('competition_rounds').delete().eq('competition_id', competitionId)

  // Determine unique round numbers
  const roundNumbers = [...new Set(schedule.map((s) => s.round_number))].sort((a, b) => a - b)

  // Insert rounds
  const roundRows = roundNumbers.map((n) => ({
    competition_id: competitionId,
    round_number:   n,
    name:           `Giornata ${n}`,
    phase:          'regular',
    status:         'pending' as const,
  }))

  const { data: insertedRounds, error: roundErr } = await supabase
    .from('competition_rounds')
    .insert(roundRows)
    .select('id, round_number')

  if (roundErr || !insertedRounds) {
    return fail(`Errore inserimento turni: ${roundErr?.message ?? 'sconosciuto'}`)
  }

  const roundMap = new Map(insertedRounds.map((r) => [r.round_number, r.id]))

  // Insert fixture shells
  const fixtureRows = schedule.map((s) => ({
    competition_id: competitionId,
    round_id:       roundMap.get(s.round_number)!,
    home_team_id:   s.home_team_id,
    away_team_id:   s.away_team_id,
  }))

  const { error: fixErr } = await supabase.from('competition_fixtures').insert(fixtureRows)
  if (fixErr) return fail(`Errore inserimento incontri: ${fixErr.message}`)

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_calendario_generate',
    entityType:  'competition',
    entityId:    competitionId,
    afterJson:   { legs, teams: teamIds.length, rounds: roundNumbers.length, fixtures: schedule.length },
  })

  revalidatePath(`/competitions/${competitionId}/rounds`)
  revalidatePath(`/competitions/${competitionId}`)

  return { error: null, success: true, rounds_created: roundNumbers.length, fixtures_created: schedule.length }
}

// ============================================================
// linkRoundToMatchdayAction
// ============================================================

export async function linkRoundToMatchdayAction(
  roundId: string,
  matchdayId: string
): Promise<ActionResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify round belongs to league
  const { data: round } = await supabase
    .from('competition_rounds')
    .select('id, competition_id, status, competitions(league_id)')
    .eq('id', roundId)
    .single()

  if (!round) return { error: 'Turno non trovato.', success: false }
  // Join result: Relationships: never[] means the query-parser can't infer
  // the joined shape; we assert the exact fields we access at runtime.
  const comp = round.competitions as unknown as { league_id: string } | null
  if (comp?.league_id !== ctx.league.id) return { error: 'Non autorizzato.', success: false }
  if (round.status === 'locked') return { error: 'Il turno è bloccato.', success: false }
  if (round.status === 'computed') {
    return {
      error:   'Il turno è già stato calcolato e non può essere ricollegato a una giornata diversa. Usa "Ricalcola" per aggiornare i risultati con la giornata già collegata.',
      success: false,
    }
  }

  // Verify matchday belongs to same league
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.', success: false }

  await supabase
    .from('competition_rounds')
    .update({ matchday_id: matchdayId })
    .eq('id', roundId)

  revalidatePath(`/competitions/${round.competition_id}/rounds`)
  return { error: null, success: true }
}

// ============================================================
// computeRoundAction
// ============================================================
// Core computation action. Works for all competition types:
//   campionato / coppa: reads pre-existing competition_fixtures
//   battle_royale:      auto-generates all N*(N-1)/2 fixture pairs,
//                       upserts them, then computes
// ============================================================

export interface ComputeRoundResult extends ActionResult {
  fixtures_computed: number
}

export async function computeRoundAction(
  roundId: string
): Promise<ComputeRoundResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const fail = (error: string): ComputeRoundResult => ({ error, success: false, fixtures_computed: 0 })

  // 1. Fetch round + competition
  const { data: round } = await supabase
    .from('competition_rounds')
    .select('*, competitions(*)')
    .eq('id', roundId)
    .single()

  if (!round) return fail('Turno non trovato.')

  // Join result: same Relationships: never[] limitation — assert exact shape.
  const competition = round.competitions as unknown as {
    id: string; league_id: string; type: string
    scoring_config: unknown; tiebreaker_config: unknown
  } | null
  if (!competition) return fail('Competizione non trovata.')
  if (competition.league_id !== ctx.league.id) return fail('Non autorizzato.')

  if (!round.matchday_id) {
    return fail('Collega una giornata a questo turno prima di calcolare.')
  }

  // 2. Verify matchday is published
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', round.matchday_id)
    .single()

  if (!matchday) return fail('Giornata collegata non trovata.')
  if (matchday.status === 'draft') return fail('La giornata è ancora in bozza: aggiungi statistiche e calcola prima.')

  // 3. Fetch published_team_scores for the matchday
  // Scores are written by publishCalculationAction regardless of matchday status (open/scoring/published/archived).
  const { data: scores } = await supabase
    .from('published_team_scores')
    .select('team_id, total_fantavoto')
    .eq('matchday_id', round.matchday_id)
    .eq('league_id', ctx.league.id)

  if (!scores || scores.length === 0) {
    return fail('Nessun punteggio calcolato per questa giornata. Vai su Calcolo punteggi e pubblica un run prima.')
  }

  const fantaVotoMap = new Map<string, number>(
    scores.map((s) => [s.team_id, Number(s.total_fantavoto)])
  )

  // 4. Build fixture inputs
  let fixtureInputs: FixtureInput[]

  if (competition.type === 'battle_royale') {
    // Auto-generate all N*(N-1)/2 pairs from enrolled teams
    const { data: enrolled } = await supabase
      .from('competition_teams')
      .select('team_id')
      .eq('competition_id', competition.id)

    const teamIds = (enrolled ?? []).map((t) => t.team_id)
    if (teamIds.length < 2) return fail('Iscrivi almeno 2 squadre per calcolare il Battle Royale.')

    // Delete previous fixtures for this round (recompute)
    await supabase.from('competition_fixtures').delete().eq('round_id', roundId)

    const insertRows = []
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        insertRows.push({
          competition_id: competition.id,
          round_id:       roundId,
          home_team_id:   teamIds[i]!,
          away_team_id:   teamIds[j]!,
        })
      }
    }

    const { data: created, error: insErr } = await supabase
      .from('competition_fixtures')
      .insert(insertRows)
      .select('id, home_team_id, away_team_id')

    if (insErr || !created) {
      return fail(`Errore creazione incontri BR: ${insErr?.message ?? 'sconosciuto'}`)
    }

    fixtureInputs = created.map((f) => ({
      fixture_id:   f.id,
      home_team_id: f.home_team_id,
      away_team_id: f.away_team_id,
    }))
  } else {
    // Campionato / Coppa: pre-existing fixtures
    const { data: existing } = await supabase
      .from('competition_fixtures')
      .select('id, home_team_id, away_team_id')
      .eq('round_id', roundId)

    if (!existing || existing.length === 0) {
      return fail('Nessun incontro trovato. Genera il calendario prima di calcolare.')
    }

    fixtureInputs = existing.map((f) => ({
      fixture_id:   f.id,
      home_team_id: f.home_team_id,
      away_team_id: f.away_team_id,
    }))
  }

  // 5. Load prior standings from the immediately preceding computed round.
  // Two-step to avoid the created_at trap: a recomputed earlier round gets a
  // newer created_at and would be incorrectly preferred over a later round's
  // snapshot if we sort by created_at across all prior rounds.
  // Correct rule: highest round_number < current that has a snapshot → latest
  // version_number for that specific round.
  const priorStandings: TeamStandingRow[] = []

  if (round.round_number > 1) {
    // Step A: which prior rounds have at least one snapshot?
    const { data: snapshotRoundRows } = await supabase
      .from('competition_standings_snapshots')
      .select('after_round_id')
      .eq('competition_id', competition.id)

    const roundIdsWithSnapshot = [...new Set(
      (snapshotRoundRows ?? []).map((s) => s.after_round_id)
    )]

    if (roundIdsWithSnapshot.length > 0) {
      // Step B: among those, pick the highest round_number strictly below current
      const { data: precedingRound } = await supabase
        .from('competition_rounds')
        .select('id')
        .eq('competition_id', competition.id)
        .lt('round_number', round.round_number)
        .in('id', roundIdsWithSnapshot)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (precedingRound) {
        // Step C: latest snapshot version for that specific round
        const { data: priorSnap } = await supabase
          .from('competition_standings_snapshots')
          .select('snapshot_json')
          .eq('competition_id', competition.id)
          .eq('after_round_id', precedingRound.id)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (priorSnap?.snapshot_json) {
          const json = priorSnap.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
          if (json.type === 'table' && Array.isArray(json.rows)) {
            priorStandings.push(...json.rows)
          }
        }
      }
    }
  }

  // 6. Parse config
  const scoringConfig = competition.scoring_config as ScoringConfig
  const tiebreakerOrder = (competition.tiebreaker_config as string[] | null) ??
    ['points', 'goal_difference', 'goals_for', 'total_fantavoto']

  // 7. Run pure computation
  const result = computeRound(fixtureInputs, fantaVotoMap, scoringConfig, priorStandings, tiebreakerOrder)

  // 8. Upsert fixture results
  for (const fr of result.fixtures) {
    await supabase
      .from('competition_fixtures')
      .update({
        home_fantavoto: fr.home_fantavoto,
        away_fantavoto: fr.away_fantavoto,
        home_score:     fr.home_score,
        away_score:     fr.away_score,
        result:         fr.result,
        home_points:    fr.home_points,
        away_points:    fr.away_points,
        computed_at:    new Date().toISOString(),
      })
      .eq('id', fr.fixture_id)
  }

  // 9. Mark round as computed
  await supabase
    .from('competition_rounds')
    .update({ status: 'computed', computed_at: new Date().toISOString() })
    .eq('id', roundId)

  // 10. Get next snapshot version for this (competition, round) pair
  const { data: lastSnap } = await supabase
    .from('competition_standings_snapshots')
    .select('version_number')
    .eq('competition_id', competition.id)
    .eq('after_round_id', roundId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const version_number = (lastSnap?.version_number ?? 0) + 1

  // 11. Insert standings snapshot (append-only)
  await supabase.from('competition_standings_snapshots').insert({
    competition_id: competition.id,
    league_id:      ctx.league.id,
    after_round_id: roundId,
    version_number,
    // Json is a recursive union type; TS can't verify a plain object literal
    // satisfies it without the double-cast (object doesn't overlap with Json).
    snapshot_json:  { type: 'table', rows: result.standings } as unknown as Json,
  })

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_round_compute',
    entityType:  'competition_round',
    entityId:    roundId,
    afterJson:   {
      competition_id:    competition.id,
      matchday_id:       round.matchday_id,
      fixtures_computed: result.fixtures.length,
      version_number,
    },
  })

  revalidatePath(`/competitions/${competition.id}`)
  revalidatePath(`/competitions/${competition.id}/rounds`)
  revalidatePath(`/competitions/${competition.id}/standings`)

  return { error: null, success: true, fixtures_computed: result.fixtures.length }
}

// ============================================================
// createBattleRoyaleRoundAction
// ============================================================
// Creates a new Battle Royale round linked to a matchday and
// immediately computes all results.
// ============================================================

export async function createBattleRoyaleRoundAction(
  competitionId: string,
  matchdayId: string
): Promise<ComputeRoundResult & { round_id?: string }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const fail = (error: string) => ({ error, success: false, fixtures_computed: 0 })

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, type')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return fail('Competizione non trovata.')
  if (comp.type !== 'battle_royale') {
    return fail('Questa azione è disponibile solo per il Battle Royale.')
  }

  // Check matchday not already linked to a round in this competition
  const { data: existing } = await supabase
    .from('competition_rounds')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  if (existing) {
    return fail('Questa giornata ha già un turno Battle Royale associato.')
  }

  // Determine next round_number
  const { data: maxRound } = await supabase
    .from('competition_rounds')
    .select('round_number')
    .eq('competition_id', competitionId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const round_number = (maxRound?.round_number ?? 0) + 1

  // Fetch matchday name for round label
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('name')
    .eq('id', matchdayId)
    .single()

  const { data: round, error: roundErr } = await supabase
    .from('competition_rounds')
    .insert({
      competition_id: competitionId,
      round_number,
      name:           matchday?.name ?? `Giornata BR ${round_number}`,
      matchday_id:    matchdayId,
      phase:          'regular',
      status:         'pending' as const,
    })
    .select('id')
    .single()

  if (roundErr || !round) {
    return fail(`Errore creazione turno: ${roundErr?.message ?? 'sconosciuto'}`)
  }

  // Compute immediately
  const computeResult = await computeRoundAction(round.id)
  return { ...computeResult, round_id: round.id }
}
