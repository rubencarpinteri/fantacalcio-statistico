'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { DEFAULT_MANTRA_THRESHOLDS } from '@/domain/competitions/goalThresholds'
import type { CompetitionType, Json } from '@/types/database.types'

// ---- Shared result type ------------------------------------

export interface ActionResult {
  error: string | null
  success: boolean
}

// ============================================================
// createCompetitionAction
// ============================================================

export async function createCompetitionAction(
  formData: FormData
): Promise<ActionResult & { competition_id?: string }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const name   = (formData.get('name') as string | null)?.trim()
  const type   = formData.get('type') as CompetitionType | null
  const season = (formData.get('season') as string | null)?.trim() || null
  const method = formData.get('scoring_method') as string | null

  if (!name) return { error: 'Il nome della competizione è obbligatorio.', success: false }
  if (!type || !['campionato', 'battle_royale', 'coppa'].includes(type)) {
    return { error: 'Tipo di competizione non valido.', success: false }
  }

  // Build scoring_config
  const pointsWin  = Number(formData.get('points_win')  ?? 3)
  const pointsDraw = Number(formData.get('points_draw') ?? 1)
  const pointsLoss = Number(formData.get('points_loss') ?? 0)
  const pointsCfg  = { win: pointsWin, draw: pointsDraw, loss: pointsLoss }

  let scoring_config: Json
  if (method === 'direct_comparison') {
    scoring_config = { method: 'direct_comparison', points: pointsCfg }
  } else {
    // goal_thresholds (default)
    const thresholdsRaw = formData.get('thresholds_json') as string | null
    let thresholds = DEFAULT_MANTRA_THRESHOLDS
    if (thresholdsRaw) {
      try {
        const parsed = JSON.parse(thresholdsRaw)
        if (Array.isArray(parsed) && parsed.length > 0) thresholds = parsed
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
