'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

// League-level settings form. Only the fields actually consumed by the
// rest of the app are accepted here. Dead columns (scoring_mode,
// lock_behavior, advanced_bonuses_enabled, bench_size) are intentionally
// not surfaced — they were never wired and only added noise.
const leagueSettingsSchema = z.object({
  // Identity (truly league-wide)
  name: z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(80),
  timezone: z.string().min(1, 'Il fuso orario è obbligatorio'),
  display_rounding: z.enum(['one_decimal', 'nearest_half']),
  // Serie A side
  season_name: z.string().min(1, 'L\'etichetta stagione è obbligatoria').max(40),
  weekly_budget: z.coerce.number().int().min(50).max(10000),
})

export interface LeagueSettingsState {
  error: string | null
  success: boolean
}

export async function updateLeagueSettingsAction(
  _prev: LeagueSettingsState,
  formData: FormData
): Promise<LeagueSettingsState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    name: formData.get('name'),
    timezone: formData.get('timezone'),
    display_rounding: formData.get('display_rounding'),
    season_name: formData.get('season_name'),
    weekly_budget: formData.get('weekly_budget'),
  }

  const parsed = leagueSettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? 'Dati non validi',
      success: false,
    }
  }

  // Capture before state for audit
  const { data: before } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', ctx.league.id)
    .single()

  const { error } = await supabase
    .from('leagues')
    .update(parsed.data)
    .eq('id', ctx.league.id)

  if (error) {
    return { error: 'Impossibile salvare le impostazioni. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'league',
    entityId: ctx.league.id,
    beforeJson: before ?? null,
    afterJson: parsed.data,
  })

  revalidatePath('/league')
  revalidatePath('/dashboard')

  return { error: null, success: true }
}
