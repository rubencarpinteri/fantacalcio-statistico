'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext, isSuperAdmin } from '@/lib/league'

/**
 * Opt the current Lega into a global FM tournament (WC/Euros/Nations/CL).
 * League admins (or super admins) only. Creates the per-Lega instance row
 * and redirects to its detail page.
 */
export async function optLegaIntoFMCompetitionAction(
  fmCompetitionId: string,
): Promise<never> {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const allowed = ctx.role === 'league_admin' || (await isSuperAdmin())
  if (!allowed) throw new Error('Solo gli amministratori della Lega possono iscrivere la Lega.')

  const { data: comp } = await supabase
    .from('fm_competition')
    .select('id, status')
    .eq('id', fmCompetitionId)
    .maybeSingle()
  if (!comp) throw new Error('Competizione non trovata.')
  if (comp.status === 'completed' || comp.status === 'archived') {
    throw new Error('Le iscrizioni a questa competizione sono chiuse.')
  }

  // Idempotent: if the Lega is already opted in, navigate to the existing instance.
  const { data: existing } = await supabase
    .from('fm_league_competition')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('fm_competition_id', fmCompetitionId)
    .maybeSingle()

  if (existing) {
    revalidatePath('/dashboard')
    redirect(`/fantamondiale/${existing.id}` as Route)
  }

  const { data: inserted, error } = await supabase
    .from('fm_league_competition')
    .insert({
      league_id: ctx.league.id,
      fm_competition_id: fmCompetitionId,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message ?? "Impossibile iscrivere la Lega.")
  }

  revalidatePath('/dashboard')
  redirect(`/fantamondiale/${inserted.id}` as Route)
}
