'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'

// ---------------------------------------------------------------------------
// Toggle freeze state on a matchday (only allowed when status is locked or scoring)
// ---------------------------------------------------------------------------

export async function toggleFreezeAction(
  matchdayId: string
): Promise<{ error?: string; frozen?: boolean }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status, is_frozen, league_id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.' }

  if (!['open', 'closed'].includes(matchday.status)) {
    return { error: 'Il congelamento è disponibile solo quando la giornata è aperta o chiusa.' }
  }

  const newFrozen = !matchday.is_frozen

  const { error } = await supabase
    .from('matchdays')
    .update({ is_frozen: newFrozen })
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)

  if (error) return { error: 'Impossibile aggiornare lo stato di congelamento. Riprova.' }

  revalidatePath(`/matchdays/${matchdayId}`)
  revalidatePath('/matchdays')

  return { frozen: newFrozen }
}
