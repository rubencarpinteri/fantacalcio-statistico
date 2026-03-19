'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { validateLineup } from '@/domain/lineup/validateLineup'
import { resolveAssignedRole } from '@/domain/lineup/slotCompatibility'
import type { LeaguePlayer, FormationSlot } from '@/types/database.types'
import { headers } from 'next/headers'

// ---- Payload schema -------------------------------------------------------

const assignmentSchema = z.object({
  player_id: z.string().uuid(),
  slot_id: z.string().uuid(),
  is_bench: z.boolean(),
  bench_order: z.number().int().min(1).nullable(),
})

const submitLineupSchema = z.object({
  matchday_id: z.string().uuid(),
  formation_id: z.string().uuid(),
  is_draft: z.boolean(),
  assignments: z.array(assignmentSchema),
})

export interface SubmitLineupState {
  error: string | null
  validationErrors: string[]
  validationWarnings: string[]
  success: boolean
  submissionNumber?: number
}

function fail(error: string, validationErrors: string[] = []): SubmitLineupState {
  return { error, validationErrors, validationWarnings: [], success: false }
}

/**
 * Submits or saves a draft lineup for the current user's team.
 *
 * Server-side validation enforced here (before the RPC):
 *   1. Zod shape check
 *   2. Matchday is open and belongs to the user's league
 *   3. Formation belongs to the user's league (prevents cross-league spoofing)
 *   4. Every slot_id in the payload belongs to the selected formation
 *      (prevents a crafted request from assigning a slot from a different formation)
 *   5. Every player_id in the payload is in the team's active roster
 *      (released_at IS NULL — prevents assigning unowned players)
 *   6. validateLineup() — for final submission: all starter slots filled with
 *      compatible players; for draft: only warn about incompleteness
 *
 * The RPC (submit_lineup) enforces:
 *   7. Matchday status = 'open' under FOR UPDATE lock (race-condition safe)
 *   8. UNIQUE(submission_id, player_id) — no duplicate players
 *   9. UNIQUE(submission_id, slot_id) — no slot double-fill
 */
export async function submitLineupAction(
  payload: z.infer<typeof submitLineupSchema>
): Promise<SubmitLineupState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  // ---- 1. Zod shape validation ------------------------------------------
  const parsed = submitLineupSchema.safeParse(payload)
  if (!parsed.success) {
    return fail('Dati formazione non validi.', parsed.error.errors.map((e) => e.message))
  }

  const { matchday_id, formation_id, is_draft, assignments } = parsed.data

  // ---- 2. Matchday: open + belongs to league ----------------------------
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status, league_id')
    .eq('id', matchday_id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return fail('Giornata non trovata.')
  if (matchday.status !== 'open') {
    return fail('La giornata non è aperta. Le formazioni non possono essere modificate.')
  }

  // ---- 3. Formation belongs to this league ------------------------------
  const { data: formation } = await supabase
    .from('formations')
    .select('id')
    .eq('id', formation_id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!formation) {
    return fail('Formazione non trovata o non appartenente a questa lega.')
  }

  // ---- Resolve user's team ----------------------------------------------
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .single()

  if (!team) return fail('Nessuna squadra trovata per questo utente.')

  // ---- 4. Fetch formation slots + verify all slot_ids are from this formation
  const { data: slotsRaw } = await supabase
    .from('formation_slots')
    .select('*')
    .eq('formation_id', formation_id)

  if (!slotsRaw || slotsRaw.length === 0) {
    return fail('La formazione selezionata non ha slot configurati.')
  }

  const slots = slotsRaw as FormationSlot[]
  const validSlotIds = new Set(slots.map((s) => s.id))
  const foreignSlots = assignments.filter((a) => !validSlotIds.has(a.slot_id))
  if (foreignSlots.length > 0) {
    return fail(
      'Uno o più slot del payload non appartengono alla formazione selezionata. ' +
        'Ricarica la pagina e riprova.'
    )
  }

  // ---- 5. All players must be in the team's active roster ---------------
  const assignedPlayerIds = assignments.map((a) => a.player_id)

  if (assignedPlayerIds.length > 0) {
    const { data: rosterEntries } = await supabase
      .from('team_roster_entries')
      .select('player_id')
      .eq('team_id', team.id)
      .in('player_id', assignedPlayerIds)
      .is('released_at', null)

    const rosterSet = new Set((rosterEntries ?? []).map((e) => e.player_id))
    const notInRoster = assignedPlayerIds.filter((id) => !rosterSet.has(id))

    if (notInRoster.length > 0) {
      // Fetch names for a readable error message
      const { data: unknownPlayers } = await supabase
        .from('league_players')
        .select('id, full_name')
        .in('id', notInRoster)

      const names = (unknownPlayers ?? []).map((p) => p.full_name).join(', ')
      return fail(
        `I seguenti giocatori non sono nella tua rosa attiva: ${names || notInRoster.join(', ')}.`
      )
    }
  }

  // ---- Fetch player details for validation ------------------------------
  const { data: playersRaw } = await supabase
    .from('league_players')
    .select('id, full_name, mantra_roles')
    .in('id', assignedPlayerIds)
    .eq('league_id', ctx.league.id)

  const playerMap = new Map((playersRaw ?? []).map((p) => [p.id, p as LeaguePlayer]))

  // ---- 6. validateLineup (completeness + role compatibility) ------------
  const validationResult = validateLineup({
    slots,
    players: playerMap,
    assignments: assignments.map((a) => ({
      playerId: a.player_id,
      slotId: a.slot_id,
      isBench: a.is_bench,
      benchOrder: a.bench_order,
      assignedMantraRole: null,
    })),
    isDraft: is_draft,
  })

  // Draft: warn but always allow. Final: block on any error.
  if (!is_draft && !validationResult.valid) {
    return {
      error: 'La formazione non è valida. Correggi gli errori prima di inviare.',
      validationErrors: validationResult.errors,
      validationWarnings: validationResult.warnings,
      success: false,
    }
  }

  // ---- Resolve assigned_mantra_role per assignment ----------------------
  const slotMap = new Map(slots.map((s) => [s.id, s]))

  const enrichedAssignments = assignments.map((a) => ({
    player_id: a.player_id,
    slot_id: a.slot_id,
    is_bench: a.is_bench,
    bench_order: a.bench_order,
    assigned_mantra_role: (() => {
      const player = playerMap.get(a.player_id)
      const slot = slotMap.get(a.slot_id)
      return player && slot ? resolveAssignedRole(player, slot) : null
    })(),
  }))

  // ---- Source IP for audit ----------------------------------------------
  const headersList = await headers()
  const sourceIp =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    null

  // ---- Call transactional RPC -------------------------------------------
  // Steps 7–9 (matchday FOR UPDATE lock, UNIQUE constraints) enforced by DB.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('submit_lineup', {
    p_team_id: team.id,
    p_matchday_id: matchday_id,
    p_formation_id: formation_id,
    p_is_draft: is_draft,
    p_actor_user_id: ctx.userId,
    p_source_ip: sourceIp,
    p_assignments: enrichedAssignments,
  })

  if (rpcError) {
    if (rpcError.message.includes('MATCHDAY_NOT_OPEN')) {
      return fail('La giornata è stata chiusa durante l\'invio. Aggiorna la pagina.')
    }
    if (rpcError.message.includes('DUPLICATE_PLAYER_OR_SLOT')) {
      return fail('Ogni giocatore e ogni slot può essere assegnato una sola volta.')
    }
    return fail(`Errore durante l'invio: ${rpcError.message}`)
  }

  const result = rpcResult as { submission_id: string; submission_number: number }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: is_draft ? 'lineup_save' : 'lineup_submit',
    entityType: 'lineup_submission',
    entityId: result.submission_id,
    afterJson: {
      submission_number: result.submission_number,
      is_draft,
      formation_id,
      team_id: team.id,
      matchday_id,
    },
  })

  revalidatePath(`/matchdays/${matchday_id}/lineup`)
  revalidatePath(`/matchdays/${matchday_id}`)

  return {
    error: null,
    validationErrors: [],
    validationWarnings: validationResult.warnings,
    success: true,
    submissionNumber: result.submission_number,
  }
}
