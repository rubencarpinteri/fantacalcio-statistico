'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { resolveAssignedRole } from '@/domain/lineup/slotCompatibility'
import type { LeaguePlayer, FormationSlot } from '@/types/database.types'

export interface AdminSlotAssignment {
  player_id: string
  slot_id: string
  is_bench: boolean
  bench_order: number | null
}

export interface AdminOverrideResult {
  error: string | null
  submissionNumber?: number
}

/**
 * Admin-only: creates a new lineup submission on behalf of any team,
 * bypassing the matchday status gate that normally requires status = 'open'.
 * Preserves append-only invariant by always inserting a new submission row.
 */
export async function adminOverrideLineupAction(
  matchdayId: string,
  teamId: string,
  formationId: string,
  assignments: AdminSlotAssignment[]
): Promise<AdminOverrideResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify matchday belongs to this league
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.' }
  if (matchday.status === 'archived') return { error: 'Impossibile modificare formazioni di una giornata archiviata.' }

  // Verify team belongs to this league
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('id', teamId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!team) return { error: 'Squadra non trovata.' }

  // Verify formation belongs to this league
  const { data: formation } = await supabase
    .from('formations')
    .select('id')
    .eq('id', formationId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!formation) return { error: 'Formazione non trovata.' }

  // Fetch formation slots to validate and resolve assigned roles
  const { data: slotsRaw } = await supabase
    .from('formation_slots')
    .select('*')
    .eq('formation_id', formationId)

  if (!slotsRaw || slotsRaw.length === 0) return { error: 'Nessuno slot trovato per questa formazione.' }

  const slots = slotsRaw as FormationSlot[]
  const slotMap = new Map(slots.map((s) => [s.id, s]))
  const validSlotIds = new Set(slots.map((s) => s.id))

  const badSlots = assignments.filter((a) => !validSlotIds.has(a.slot_id))
  if (badSlots.length > 0) return { error: 'Alcuni slot non appartengono a questa formazione.' }

  // Fetch player details to resolve assigned_mantra_role
  const playerIds = assignments.map((a) => a.player_id)
  const { data: playersRaw } = await supabase
    .from('league_players')
    .select('id, full_name, mantra_roles')
    .in('id', playerIds)
    .eq('league_id', ctx.league.id)

  const playerMap = new Map((playersRaw ?? []).map((p) => [p.id, p as LeaguePlayer]))

  // Get next submission_number for this team + matchday
  const { data: maxRow } = await supabase
    .from('lineup_submissions')
    .select('submission_number')
    .eq('team_id', teamId)
    .eq('matchday_id', matchdayId)
    .order('submission_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextNumber = (maxRow?.submission_number ?? 0) + 1
  const now = new Date().toISOString()

  // Insert new lineup_submissions row
  const { data: newSub, error: subError } = await supabase
    .from('lineup_submissions')
    .insert({
      team_id: teamId,
      matchday_id: matchdayId,
      formation_id: formationId,
      status: 'submitted',
      submission_number: nextNumber,
      submitted_at: now,
      actor_user_id: ctx.userId,
      source_ip: null,
    })
    .select('id')
    .single()

  if (subError || !newSub) return { error: `Errore creazione submission: ${subError?.message}` }

  // Insert lineup_submission_players
  const playerRows = assignments.map((a) => {
    const player = playerMap.get(a.player_id)
    const slot = slotMap.get(a.slot_id)
    return {
      submission_id: newSub.id,
      player_id: a.player_id,
      slot_id: a.slot_id,
      is_bench: a.is_bench,
      bench_order: a.bench_order,
      assigned_mantra_role: player && slot ? resolveAssignedRole(player, slot) : null,
    }
  })

  const { error: slotsError } = await supabase
    .from('lineup_submission_players')
    .insert(playerRows)

  if (slotsError) return { error: `Errore inserimento giocatori: ${slotsError.message}` }

  // Upsert lineup_current_pointers
  const { error: ptrError } = await supabase
    .from('lineup_current_pointers')
    .upsert(
      { team_id: teamId, matchday_id: matchdayId, submission_id: newSub.id, updated_at: now },
      { onConflict: 'team_id,matchday_id' }
    )

  if (ptrError) return { error: `Errore aggiornamento puntatore: ${ptrError.message}` }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'lineup_submit',
    entityType: 'lineup_submission',
    entityId: newSub.id,
    afterJson: {
      submission_number: nextNumber,
      is_draft: false,
      formation_id: formationId,
      team_id: teamId,
      matchday_id: matchdayId,
      admin_override: true,
    },
  })

  revalidatePath(`/matchdays/${matchdayId}/all-lineups`)
  revalidatePath(`/matchdays/${matchdayId}`)

  return { error: null, submissionNumber: nextNumber }
}
