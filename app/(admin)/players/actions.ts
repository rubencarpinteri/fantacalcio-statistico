'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { RatingClass } from '@/types/database.types'

const playerSchema = z.object({
  full_name: z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(100),
  club: z.string().min(1, 'Il club è obbligatorio').max(60),
  mantra_roles: z
    .string()
    .min(1, 'Almeno un ruolo Mantra è obbligatorio')
    .transform((s) =>
      s
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    ),
  primary_mantra_role: z.string().optional().nullable(),
  rating_class: z.enum(['GK', 'DEF', 'MID', 'ATT']),
  notes: z.string().max(500).optional().nullable(),
})

export interface PlayerActionState {
  error: string | null
  success: boolean
  fieldErrors?: Record<string, string>
}

export async function createPlayerAction(
  _prev: PlayerActionState,
  formData: FormData
): Promise<PlayerActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    full_name: formData.get('full_name'),
    club: formData.get('club'),
    mantra_roles: formData.get('mantra_roles'),
    primary_mantra_role: formData.get('primary_mantra_role') || null,
    rating_class: formData.get('rating_class'),
    notes: formData.get('notes') || null,
  }

  const parsed = playerSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    parsed.error.errors.forEach((e) => {
      const field = e.path[0]?.toString()
      if (field) fieldErrors[field] = e.message
    })
    return { error: 'Correggi gli errori nel modulo.', success: false, fieldErrors }
  }

  const { data: player, error } = await supabase
    .from('league_players')
    .insert({
      league_id: ctx.league.id,
      full_name: parsed.data.full_name,
      club: parsed.data.club,
      mantra_roles: parsed.data.mantra_roles,
      primary_mantra_role: parsed.data.primary_mantra_role ?? null,
      rating_class: parsed.data.rating_class as RatingClass,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        error: `Il giocatore "${parsed.data.full_name}" del club "${parsed.data.club}" è già presente in questa lega.`,
        success: false,
      }
    }
    return { error: 'Impossibile creare il giocatore. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'player_create',
    entityType: 'league_player',
    entityId: player.id,
    afterJson: {
      full_name: parsed.data.full_name,
      club: parsed.data.club,
      mantra_roles: parsed.data.mantra_roles,
      rating_class: parsed.data.rating_class,
    },
  })

  revalidatePath('/players')
  return { error: null, success: true }
}

export async function updatePlayerAction(
  _prev: PlayerActionState,
  formData: FormData
): Promise<PlayerActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const playerId = formData.get('player_id')?.toString()
  if (!playerId) return { error: 'ID giocatore mancante.', success: false }

  const raw = {
    full_name: formData.get('full_name'),
    club: formData.get('club'),
    mantra_roles: formData.get('mantra_roles'),
    primary_mantra_role: formData.get('primary_mantra_role') || null,
    rating_class: formData.get('rating_class'),
    notes: formData.get('notes') || null,
  }

  const parsed = playerSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    parsed.error.errors.forEach((e) => {
      const field = e.path[0]?.toString()
      if (field) fieldErrors[field] = e.message
    })
    return { error: 'Correggi gli errori nel modulo.', success: false, fieldErrors }
  }

  // Capture before state for audit
  const { data: before } = await supabase
    .from('league_players')
    .select('*')
    .eq('id', playerId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!before) return { error: 'Giocatore non trovato.', success: false }

  const roleChanged =
    JSON.stringify(before.mantra_roles) !== JSON.stringify(parsed.data.mantra_roles) ||
    before.primary_mantra_role !== parsed.data.primary_mantra_role

  const ratingClassChanged = before.rating_class !== parsed.data.rating_class

  const { error } = await supabase
    .from('league_players')
    .update({
      full_name: parsed.data.full_name,
      club: parsed.data.club,
      mantra_roles: parsed.data.mantra_roles,
      primary_mantra_role: parsed.data.primary_mantra_role ?? null,
      rating_class: parsed.data.rating_class as RatingClass,
      notes: parsed.data.notes ?? null,
    })
    .eq('id', playerId)
    .eq('league_id', ctx.league.id)

  if (error) {
    return { error: 'Impossibile aggiornare il giocatore. Riprova.', success: false }
  }

  // Write role history if roles or class changed
  if (roleChanged || ratingClassChanged) {
    await supabase.from('player_role_history').insert({
      player_id: playerId,
      changed_by: ctx.userId,
      old_mantra_roles: before.mantra_roles,
      new_mantra_roles: parsed.data.mantra_roles,
      old_rating_class: before.rating_class,
      new_rating_class: parsed.data.rating_class as RatingClass,
      reason: formData.get('change_reason')?.toString() || null,
    })
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: ratingClassChanged ? 'player_rating_class_change' : 'player_role_change',
    entityType: 'league_player',
    entityId: playerId,
    beforeJson: before,
    afterJson: parsed.data,
  })

  revalidatePath('/players')
  return { error: null, success: true }
}

export async function togglePlayerActiveAction(
  playerId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('league_players')
    .update({ is_active: isActive })
    .eq('id', playerId)
    .eq('league_id', ctx.league.id)

  if (error) return { error: 'Impossibile aggiornare lo stato del giocatore.' }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'roster_edit',
    entityType: 'league_player',
    entityId: playerId,
    afterJson: { is_active: isActive },
  })

  revalidatePath('/players')
  return { error: null }
}
