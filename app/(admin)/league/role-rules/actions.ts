'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { RatingClass } from '@/types/database.types'

const ruleSchema = z.object({
  mantra_role: z.string().min(1).max(10),
  default_rating_class: z.enum(['GK', 'DEF', 'MID', 'ATT']),
})

export interface RoleRuleState {
  error: string | null
  success: boolean
}

/**
 * Upserts a role classification rule for an ambiguous Mantra role.
 * If the rule already exists for this (league, mantra_role) pair, it is updated.
 */
export async function upsertRoleRuleAction(
  _prev: RoleRuleState,
  formData: FormData
): Promise<RoleRuleState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    mantra_role: formData.get('mantra_role'),
    default_rating_class: formData.get('default_rating_class'),
  }

  const parsed = ruleSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  // Capture existing rule for audit
  const { data: existing } = await supabase
    .from('role_classification_rules')
    .select('*')
    .eq('league_id', ctx.league.id)
    .eq('mantra_role', parsed.data.mantra_role)
    .maybeSingle()

  const { error } = await supabase
    .from('role_classification_rules')
    .upsert(
      {
        league_id: ctx.league.id,
        mantra_role: parsed.data.mantra_role,
        default_rating_class: parsed.data.default_rating_class as RatingClass,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,mantra_role' }
    )

  if (error) {
    return { error: 'Impossibile salvare la regola. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'ambiguous_role_change',
    entityType: 'role_classification_rule',
    entityId: existing?.id,
    beforeJson: existing ?? null,
    afterJson: {
      mantra_role: parsed.data.mantra_role,
      default_rating_class: parsed.data.default_rating_class,
    },
  })

  revalidatePath('/league/role-rules')

  return { error: null, success: true }
}

/**
 * Deletes a role classification rule.
 * After deletion, the role becomes ambiguous again and requires manual admin
 * confirmation during player import.
 */
export async function deleteRoleRuleAction(ruleId: string): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('role_classification_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!existing) {
    return { error: 'Regola non trovata.' }
  }

  const { error } = await supabase
    .from('role_classification_rules')
    .delete()
    .eq('id', ruleId)
    .eq('league_id', ctx.league.id)

  if (error) {
    return { error: 'Impossibile eliminare la regola. Riprova.' }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'ambiguous_role_change',
    entityType: 'role_classification_rule',
    entityId: ruleId,
    beforeJson: existing,
    afterJson: null,
  })

  revalidatePath('/league/role-rules')

  return { error: null }
}
