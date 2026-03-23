'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

const leagueSettingsSchema = z.object({
  name: z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(80),
  season_name: z.string().min(1, 'Il nome stagione è obbligatorio').max(40),
  timezone: z.string().min(1, 'Il fuso orario è obbligatorio'),
  scoring_mode: z.enum(['head_to_head', 'points_only', 'both']),
  display_rounding: z.enum(['one_decimal', 'nearest_half']),
  lock_behavior: z.enum(['auto', 'manual']),
  advanced_bonuses_enabled: z.coerce.boolean(),
  bench_size: z.coerce.number().int().min(1).max(10),
  source_weight_sofascore: z.coerce.number().int().min(0).max(100),
  source_weight_fotmob:    z.coerce.number().int().min(0).max(100),
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
    season_name: formData.get('season_name'),
    timezone: formData.get('timezone'),
    scoring_mode: formData.get('scoring_mode'),
    display_rounding: formData.get('display_rounding'),
    lock_behavior: formData.get('lock_behavior'),
    advanced_bonuses_enabled: formData.get('advanced_bonuses_enabled') === 'true',
    bench_size: formData.get('bench_size'),
    source_weight_sofascore: formData.get('source_weight_sofascore'),
    source_weight_fotmob:    formData.get('source_weight_fotmob'),
  }

  const parsed = leagueSettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? 'Dati non validi',
      success: false,
    }
  }

  const weightSum =
    parsed.data.source_weight_sofascore +
    parsed.data.source_weight_fotmob
  if (weightSum !== 100) {
    return {
      error: `I pesi delle fonti devono sommare a 100% (attuale: ${weightSum}%).`,
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
