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

// ── Seed Mantra presets ────────────────────────────────────────────────────────

export async function seedMantraFormationsAction(): Promise<{ error?: string; created: number; skipped: number }> {
  const { MANTRA_FORMATION_PRESETS } = await import('@/domain/formations/mantraPresets')
  const supabase = await createClient()
  const ctx = await requireLeagueAdmin()

  // Fetch existing formation names to avoid duplicates
  const { data: existing } = await supabase
    .from('formations')
    .select('name')
    .eq('league_id', ctx.league.id)

  const existingNames = new Set((existing ?? []).map((f) => f.name))

  let created = 0
  let skipped = 0

  for (const preset of MANTRA_FORMATION_PRESETS) {
    if (existingNames.has(preset.name)) {
      skipped++
      continue
    }

    // Insert formation
    const { data: formation, error: fErr } = await supabase
      .from('formations')
      .insert({
        league_id: ctx.league.id,
        name: preset.name,
        description: preset.description,
        is_active: true,
      })
      .select('id')
      .single()

    if (fErr || !formation) {
      return { error: `Errore creando ${preset.name}: ${fErr?.message}`, created, skipped }
    }

    // Insert all slots
    const slotsToInsert = preset.slots.map((s) => ({
      formation_id: formation.id,
      slot_name: s.slot_name,
      slot_order: s.slot_order,
      allowed_mantra_roles: s.allowed_mantra_roles,
      extended_mantra_roles: s.extended_mantra_roles,
      is_bench: s.is_bench,
      bench_order: s.bench_order,
    }))

    const { error: sErr } = await supabase.from('formation_slots').insert(slotsToInsert)

    if (sErr) {
      return { error: `Errore creando slot per ${preset.name}: ${sErr.message}`, created, skipped }
    }

    await writeAuditLog({
      supabase,
      leagueId: ctx.league.id,
      actorUserId: ctx.userId,
      actionType: 'formation_settings_change',
      entityType: 'formation',
      entityId: formation.id,
      afterJson: { preset: preset.name, slots: preset.slots.length },
    })

    created++
  }

  return { created, skipped }
}
