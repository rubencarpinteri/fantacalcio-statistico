'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

const slotSchema = z.object({
  slot_name: z.string().min(1, 'Il nome dello slot è obbligatorio').max(30),
  slot_order: z.coerce.number().int().min(1),
  allowed_mantra_roles: z
    .string()
    .min(1, 'Almeno un ruolo Mantra è richiesto')
    .transform((s) =>
      s
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    ),
  is_bench: z.coerce.boolean(),
  bench_order: z.coerce.number().int().min(1).optional().nullable(),
})

export interface SlotActionState {
  error: string | null
  success: boolean
}

/**
 * Validates that the formation belongs to the current user's league.
 */
async function assertFormationOwnership(formationId: string, leagueId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('formations')
    .select('id')
    .eq('id', formationId)
    .eq('league_id', leagueId)
    .single()
  return !!data
}

export async function createSlotAction(
  _prev: SlotActionState,
  formData: FormData
): Promise<SlotActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const formationId = formData.get('formation_id')?.toString()
  if (!formationId) return { error: 'ID formazione mancante.', success: false }

  const owned = await assertFormationOwnership(formationId, ctx.league.id)
  if (!owned) return { error: 'Formazione non trovata.', success: false }

  const isBench = formData.get('is_bench') === 'true'

  const raw = {
    slot_name: formData.get('slot_name'),
    slot_order: formData.get('slot_order'),
    allowed_mantra_roles: formData.get('allowed_mantra_roles'),
    is_bench: isBench,
    bench_order: isBench ? formData.get('bench_order') : null,
  }

  const parsed = slotSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  if (parsed.data.is_bench && !parsed.data.bench_order) {
    return { error: "L'ordine panchina è obbligatorio per gli slot panchina.", success: false }
  }

  const { error } = await supabase.from('formation_slots').insert({
    formation_id: formationId,
    slot_name: parsed.data.slot_name,
    slot_order: parsed.data.slot_order,
    allowed_mantra_roles: parsed.data.allowed_mantra_roles,
    is_bench: parsed.data.is_bench,
    bench_order: parsed.data.is_bench ? (parsed.data.bench_order ?? null) : null,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: `Uno slot con nome "${parsed.data.slot_name}" esiste già.`, success: false }
    }
    return { error: 'Impossibile creare lo slot. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'formation_settings_change',
    entityType: 'formation_slot',
    entityId: formationId,
    afterJson: {
      slot_name: parsed.data.slot_name,
      allowed_mantra_roles: parsed.data.allowed_mantra_roles,
      is_bench: parsed.data.is_bench,
    },
  })

  revalidatePath(`/formations/${formationId}`)
  return { error: null, success: true }
}

export async function updateSlotAction(
  _prev: SlotActionState,
  formData: FormData
): Promise<SlotActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const slotId = formData.get('slot_id')?.toString()
  const formationId = formData.get('formation_id')?.toString()

  if (!slotId || !formationId) return { error: 'Dati mancanti.', success: false }

  const owned = await assertFormationOwnership(formationId, ctx.league.id)
  if (!owned) return { error: 'Formazione non trovata.', success: false }

  const isBench = formData.get('is_bench') === 'true'

  const raw = {
    slot_name: formData.get('slot_name'),
    slot_order: formData.get('slot_order'),
    allowed_mantra_roles: formData.get('allowed_mantra_roles'),
    is_bench: isBench,
    bench_order: isBench ? formData.get('bench_order') : null,
  }

  const parsed = slotSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  const { error } = await supabase
    .from('formation_slots')
    .update({
      slot_name: parsed.data.slot_name,
      slot_order: parsed.data.slot_order,
      allowed_mantra_roles: parsed.data.allowed_mantra_roles,
      is_bench: parsed.data.is_bench,
      bench_order: parsed.data.is_bench ? (parsed.data.bench_order ?? null) : null,
    })
    .eq('id', slotId)
    .eq('formation_id', formationId)

  if (error) {
    return { error: 'Impossibile aggiornare lo slot. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'formation_settings_change',
    entityType: 'formation_slot',
    entityId: slotId,
    afterJson: {
      slot_name: parsed.data.slot_name,
      allowed_mantra_roles: parsed.data.allowed_mantra_roles,
    },
  })

  revalidatePath(`/formations/${formationId}`)
  return { error: null, success: true }
}

export async function deleteSlotAction(
  slotId: string,
  formationId: string
): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const owned = await assertFormationOwnership(formationId, ctx.league.id)
  if (!owned) return { error: 'Formazione non trovata.' }

  const { error } = await supabase
    .from('formation_slots')
    .delete()
    .eq('id', slotId)
    .eq('formation_id', formationId)

  if (error) return { error: 'Impossibile eliminare lo slot.' }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'formation_settings_change',
    entityType: 'formation_slot',
    entityId: slotId,
    afterJson: { deleted: true, formation_id: formationId },
  })

  revalidatePath(`/formations/${formationId}`)
  return { error: null }
}
