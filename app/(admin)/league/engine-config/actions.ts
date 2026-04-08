'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

// ── Validation schema ────────────────────────────────────────────────────────

const EngineConfigSchema = z.object({
  // Normalizzazione voti
  fotmob_mean:    z.coerce.number().min(5).max(8),
  fotmob_std:     z.coerce.number().min(0.1).max(3),
  sofascore_mean: z.coerce.number().min(5).max(8),
  sofascore_std:  z.coerce.number().min(0.1).max(3),
  fotmob_weight:  z.coerce.number().min(0).max(1),

  // Fattore minuti
  minutes_factor_threshold: z.coerce.number().int().min(1).max(90),
  minutes_factor_partial:   z.coerce.number().min(0).max(1),
  minutes_factor_full:      z.coerce.number().min(0).max(1),

  // Moltiplicatori di ruolo
  role_multiplier_gk:  z.coerce.number().min(0.5).max(2),
  role_multiplier_def: z.coerce.number().min(0.5).max(2),
  role_multiplier_mid: z.coerce.number().min(0.5).max(2),
  role_multiplier_att: z.coerce.number().min(0.5).max(2),

  // Goal bonuses
  goal_bonus_gk:  z.coerce.number().min(0).max(10),
  goal_bonus_def: z.coerce.number().min(0).max(10),
  goal_bonus_mid: z.coerce.number().min(0).max(10),
  goal_bonus_att: z.coerce.number().min(0).max(10),

  penalty_scored_discount: z.coerce.number().min(0).max(5),
  brace_bonus:             z.coerce.number().min(0).max(5),
  hat_trick_bonus:         z.coerce.number().min(0).max(5),

  // Events
  assist:         z.coerce.number().min(-5).max(5),
  own_goal:       z.coerce.number().min(-10).max(0),
  yellow_card:    z.coerce.number().min(-5).max(0),
  red_card:       z.coerce.number().min(-10).max(0),
  penalty_missed: z.coerce.number().min(-10).max(0),
  penalty_saved:  z.coerce.number().min(0).max(10),

  // Clean sheet
  clean_sheet_gk:            z.coerce.number().min(0).max(5),
  clean_sheet_def:           z.coerce.number().min(0).max(5),
  clean_sheet_min_minutes:   z.coerce.number().int().min(1).max(90),

  // Goals conceded
  goals_conceded_gk:               z.coerce.number().min(-5).max(0),
  goals_conceded_def:              z.coerce.number().min(-5).max(0),
  goals_conceded_def_min_minutes:  z.coerce.number().int().min(1).max(90),

  // Target vote distribution (Step 2 of calibration pipeline)
  target_mean_vote: z.coerce.number().min(4).max(8),
  target_vote_std:  z.coerce.number().min(0.1).max(3),
})

export interface SaveEngineConfigResult {
  error: string | null
  success: boolean
}

// ── Action ───────────────────────────────────────────────────────────────────

export async function saveEngineConfigAction(
  _prev: SaveEngineConfigResult,
  formData: FormData
): Promise<SaveEngineConfigResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = Object.fromEntries(formData.entries())
  const parsed = EngineConfigSchema.safeParse(raw)

  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.')}: ${first?.message}`, success: false }
  }

  const values = {
    ...parsed.data,
    league_id:  ctx.league.id,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('league_engine_config')
    .upsert(values, { onConflict: 'league_id' })

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'league_engine_config',
    entityId: ctx.league.id,
    afterJson: parsed.data,
  })

  revalidatePath('/league/engine-config')
  revalidatePath('/methodology')

  return { error: null, success: true }
}
