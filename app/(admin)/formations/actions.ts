'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

const formationSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio').max(60),
  description: z.string().max(300).optional().nullable(),
})

export interface FormationActionState {
  error: string | null
  success: boolean
  formationId?: string
}

export async function createFormationAction(
  _prev: FormationActionState,
  formData: FormData
): Promise<FormationActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || null,
  }

  const parsed = formationSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  const { data: formation, error } = await supabase
    .from('formations')
    .insert({
      league_id: ctx.league.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        error: `Una formazione con nome "${parsed.data.name}" esiste già in questa lega.`,
        success: false,
      }
    }
    return { error: 'Impossibile creare la formazione. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'formation_settings_change',
    entityType: 'formation',
    entityId: formation.id,
    afterJson: { name: parsed.data.name, description: parsed.data.description },
  })

  revalidatePath('/formations')
  redirect(`/formations/${formation.id}`)
}

export async function toggleFormationActiveAction(
  formationId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('formations')
    .update({ is_active: isActive })
    .eq('id', formationId)
    .eq('league_id', ctx.league.id)

  if (error) return { error: 'Impossibile aggiornare la formazione.' }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'formation_settings_change',
    entityType: 'formation',
    entityId: formationId,
    afterJson: { is_active: isActive },
  })

  revalidatePath('/formations')
  return { error: null }
}
