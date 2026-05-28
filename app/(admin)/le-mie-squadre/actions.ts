'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

export interface RenameTeamState {
  error: string | null
  success: boolean
}

const renameSchema = z.object({
  team_id: z.string().uuid('ID squadra non valido'),
  name:    z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri').max(60, 'Massimo 60 caratteri'),
})

/** Rename a Serie A fantasy team owned by the current user. */
export async function renameSerieATeamAction(
  _prev: RenameTeamState,
  formData: FormData
): Promise<RenameTeamState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = renameSchema.safeParse({
    team_id: formData.get('team_id'),
    name:    formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, name } = parsed.data

  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id, league_id')
    .eq('id', team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi rinominare solo le tue squadre.', success: false }
  }
  if (team.name === name) {
    return { error: null, success: true }
  }

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ name })
    .eq('id', team_id)

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una squadra con questo nome nella Lega.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fantasy_team',
    entityId:    team_id,
    afterJson:   { action: 'rename', old: team.name, new: name },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

/** Rename a FantaMondiale fantasy team owned by the current user. */
export async function renameFMTeamAction(
  _prev: RenameTeamState,
  formData: FormData
): Promise<RenameTeamState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = renameSchema.safeParse({
    team_id: formData.get('team_id'),
    name:    formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { team_id, name } = parsed.data

  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id, name, manager_id')
    .eq('id', team_id)
    .maybeSingle()
  if (!team) return { error: 'Squadra non trovata.', success: false }
  if (team.manager_id !== ctx.userId) {
    return { error: 'Puoi rinominare solo le tue squadre.', success: false }
  }
  if (team.name === name) {
    return { error: null, success: true }
  }

  const { error } = await supabase
    .from('fm_fantasy_team')
    .update({ name })
    .eq('id', team_id)

  if (error) {
    const msg = error.message.toLowerCase().includes('unique')
      ? 'Esiste già una squadra con questo nome in questa competizione.'
      : error.message
    return { error: msg, success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'user_role_change',
    entityType:  'fm_fantasy_team',
    entityId:    team_id,
    afterJson:   { action: 'rename', old: team.name, new: name },
  })

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface UpdateProfileState {
  error: string | null
  success: boolean
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Il nome deve avere almeno 2 caratteri').max(60),
  username:  z.string()
    .trim()
    .min(2, 'Lo username deve avere almeno 2 caratteri')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, punti, trattini e underscore'),
})

export async function updateProfileAction(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name'),
    username:  formData.get('username'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }
  const { full_name, username } = parsed.data

  const { data: current } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', ctx.userId)
    .single()

  // Username uniqueness check (only if changed)
  if (current?.username !== username) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', ctx.userId)
      .maybeSingle()
    if (existing) {
      return { error: `Lo username "${username}" è già in uso.`, success: false }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name, username })
    .eq('id', ctx.userId)

  if (error) return { error: error.message, success: false }

  revalidatePath('/le-mie-squadre')
  return { error: null, success: true }
}
