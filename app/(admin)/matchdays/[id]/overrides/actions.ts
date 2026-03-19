'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

// ============================================================
// createOverrideAction
// ============================================================
// Creates a score override for one player on one matchday.
// If an active override already exists for (matchday_id, player_id)
// the action rejects — remove the existing one first.
//
// Attempts to populate original_fantavoto from the latest
// published calculation run; falls back to null if none exists.
// ============================================================

const createSchema = z.object({
  matchday_id:        z.string().uuid(),
  player_id:          z.string().uuid(),
  override_fantavoto: z.number().min(-20).max(30),
  reason:             z.string().min(1).max(500).trim(),
})

export interface CreateOverrideResult {
  error: string | null
  success: boolean
}

export async function createOverrideAction(
  raw: z.input<typeof createSchema>
): Promise<CreateOverrideResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join('; '), success: false }
  }

  const { matchday_id, player_id, override_fantavoto, reason } = parsed.data

  // Verify matchday belongs to this league and is not archived
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchday_id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.', success: false }
  if (matchday.status === 'archived') {
    return { error: 'Non è possibile aggiungere override su una giornata archiviata.', success: false }
  }

  // Verify player belongs to this league
  const { data: player } = await supabase
    .from('league_players')
    .select('id, full_name')
    .eq('id', player_id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!player) return { error: 'Giocatore non trovato in questa lega.', success: false }

  // Guard against duplicate active overrides for the same (matchday, player)
  const { data: existing } = await supabase
    .from('score_overrides')
    .select('id')
    .eq('matchday_id', matchday_id)
    .eq('player_id', player_id)
    .is('removed_at', null)
    .maybeSingle()

  if (existing) {
    return {
      error: `Esiste già un override attivo per ${player.full_name}. Rimuovilo prima di crearne uno nuovo.`,
      success: false,
    }
  }

  // Try to populate original_fantavoto from the latest published calculation
  let original_fantavoto: number | null = null
  const { data: currentPtr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchday_id)
    .maybeSingle()

  if (currentPtr?.run_id) {
    const { data: calc } = await supabase
      .from('player_calculations')
      .select('fantavoto')
      .eq('run_id', currentPtr.run_id)
      .eq('player_id', player_id)
      .maybeSingle()
    original_fantavoto = calc?.fantavoto ?? null
  }

  const { data: created, error: insertError } = await supabase
    .from('score_overrides')
    .insert({
      matchday_id,
      player_id,
      original_fantavoto,
      override_fantavoto,
      reason,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insertError || !created) {
    return { error: `Errore durante la creazione: ${insertError?.message ?? 'sconosciuto'}`, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'override_create',
    entityType: 'score_override',
    entityId: created.id,
    afterJson: {
      matchday_id,
      player_id,
      player_name: player.full_name,
      original_fantavoto,
      override_fantavoto,
      reason,
    },
  })

  revalidatePath(`/matchdays/${matchday_id}/overrides`)
  revalidatePath(`/matchdays/${matchday_id}/calculate`)

  return { error: null, success: true }
}

// ============================================================
// removeOverrideAction
// ============================================================
// Soft-deletes an override by setting removed_at + removed_by.
// ============================================================

export interface RemoveOverrideResult {
  error: string | null
  success: boolean
}

export async function removeOverrideAction(
  overrideId: string,
  matchdayId: string
): Promise<RemoveOverrideResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch the override and verify league ownership via matchday
  const { data: override } = await supabase
    .from('score_overrides')
    .select('id, matchday_id, player_id, removed_at')
    .eq('id', overrideId)
    .eq('matchday_id', matchdayId)
    .single()

  if (!override) return { error: 'Override non trovato.', success: false }
  if (override.removed_at !== null) return { error: 'Override già rimosso.', success: false }

  // Verify matchday belongs to this league
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.', success: false }
  if (matchday.status === 'archived') {
    return { error: 'Non è possibile modificare override su una giornata archiviata.', success: false }
  }

  const { error: updateError } = await supabase
    .from('score_overrides')
    .update({ removed_at: new Date().toISOString(), removed_by: ctx.userId })
    .eq('id', overrideId)

  if (updateError) return { error: updateError.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'override_remove',
    entityType: 'score_override',
    entityId: overrideId,
    afterJson: { matchday_id: matchdayId, player_id: override.player_id },
  })

  revalidatePath(`/matchdays/${matchdayId}/overrides`)
  revalidatePath(`/matchdays/${matchdayId}/calculate`)

  return { error: null, success: true }
}
