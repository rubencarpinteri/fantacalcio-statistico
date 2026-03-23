'use server'

import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { refreshMatchdayLive } from '@/lib/live/refresh'
import { revalidatePath } from 'next/cache'

export type TriggerLiveResult = { ok: boolean; error?: string; teams_updated?: number }

export async function triggerLiveRefreshAction(
  matchdayId: string
): Promise<TriggerLiveResult> {
  let ctx
  try {
    ctx = await requireLeagueAdmin()
  } catch {
    return { ok: false, error: 'Non autorizzato.' }
  }

  const supabase = await createClient()

  // Verify matchday belongs to this league and is in scoring state
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { ok: false, error: 'Giornata non trovata.' }
  if (matchday.status !== 'scoring') {
    return { ok: false, error: 'Il calcolo live è disponibile solo per giornate in stato "scoring".' }
  }

  const result = await refreshMatchdayLive(supabase, matchdayId, ctx.league.id)

  if (result.ok) {
    revalidatePath(`/matchdays/${matchdayId}/live`)
  }

  return result
}
