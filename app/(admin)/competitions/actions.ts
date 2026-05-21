'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { DEFAULT_MANTRA_THRESHOLDS } from '@/domain/competitions/goalThresholds'
import type { Json } from '@/types/database.types'
import type { ActionResult } from '@/lib/actionResult'

const uuid = z.string().uuid('ID non valido')

const createCompetitionSchema = z.object({
  name: z.string().trim().min(1, 'Nome obbligatorio').max(100),
  type: z.enum(['campionato', 'battle_royale', 'coppa']),
  season: z.string().trim().max(20).nullable(),
  scoring_method: z.enum(['direct_comparison', 'goal_thresholds']),
  points_win: z.coerce.number().int().min(0).max(100),
  points_draw: z.coerce.number().int().min(0).max(100),
  points_loss: z.coerce.number().int().min(0).max(100),
  thresholds_json: z.string().nullable(),
})

// ============================================================
// createCompetitionAction
// ============================================================

export async function createCompetitionAction(
  formData: FormData
): Promise<ActionResult & { competition_id?: string }> {
  const parsed = createCompetitionSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    season: (formData.get('season') as string | null)?.trim() || null,
    scoring_method: formData.get('scoring_method'),
    points_win: formData.get('points_win') ?? 3,
    points_draw: formData.get('points_draw') ?? 1,
    points_loss: formData.get('points_loss') ?? 0,
    thresholds_json: formData.get('thresholds_json'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Input non valido.', success: false }
  }
  const { name, type, season, scoring_method, points_win, points_draw, points_loss, thresholds_json } = parsed.data

  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const pointsCfg = { win: points_win, draw: points_draw, loss: points_loss }

  let scoring_config: Json
  if (scoring_method === 'direct_comparison') {
    scoring_config = { method: 'direct_comparison', points: pointsCfg }
  } else {
    let thresholds = DEFAULT_MANTRA_THRESHOLDS
    if (thresholds_json) {
      try {
        const parsedThresholds = JSON.parse(thresholds_json)
        if (Array.isArray(parsedThresholds) && parsedThresholds.length > 0) thresholds = parsedThresholds
      } catch {
        return { error: 'Formato soglie non valido.', success: false }
      }
    }
    // Json is recursive; TS can't verify a plain object literal satisfies it.
    scoring_config = { method: 'goal_thresholds', thresholds, points: pointsCfg } as unknown as Json
  }

  const { data: competition, error } = await supabase
    .from('competitions')
    .insert({
      league_id:      ctx.league.id,
      name,
      type,
      season,
      scoring_config,
      created_by:     ctx.userId,
    })
    .select('id')
    .single()

  if (error || !competition) {
    return { error: error?.message ?? 'Errore creazione competizione.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_create',
    entityType:  'competition',
    entityId:    competition.id,
    afterJson:   { name, type, season },
  })

  revalidatePath('/competitions')
  redirect(`/competitions/${competition.id}`)
}

// ============================================================
// updateCompetitionStatusAction
// ============================================================

export async function updateCompetitionStatusAction(
  competitionId: string,
  newStatus: 'active' | 'completed' | 'cancelled'
): Promise<ActionResult> {
  const parsed = z.object({
    competitionId: uuid,
    newStatus: z.enum(['active', 'completed', 'cancelled']),
  }).safeParse({ competitionId, newStatus })
  if (!parsed.success) return { error: 'Input non valido.', success: false }

  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, status')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) return { error: 'Competizione non trovata.', success: false }

  // Guard: cannot reactivate a completed competition
  if (comp.status === 'completed' && newStatus === 'active') {
    return { error: 'Una competizione completata non può essere riattivata.', success: false }
  }

  const { error } = await supabase
    .from('competitions')
    .update({ status: newStatus })
    .eq('id', competitionId)

  if (error) return { error: error.message, success: false }

  await writeAuditLog({
    supabase,
    leagueId:    ctx.league.id,
    actorUserId: ctx.userId,
    actionType:  'competition_status_change',
    entityType:  'competition',
    entityId:    competitionId,
    afterJson:   { old_status: comp.status, new_status: newStatus },
  })

  revalidatePath(`/competitions/${competitionId}`)
  revalidatePath('/competitions')

  return { error: null, success: true }
}
