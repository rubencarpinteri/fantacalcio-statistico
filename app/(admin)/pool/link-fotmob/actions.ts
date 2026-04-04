'use server'

import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const LinkSchema = z.object({
  league_player_id: z.string().uuid(),
  fotmob_player_id: z.number().int().positive(),
})

export type LinkResult = { ok: true } | { ok: false; error: string }

export async function linkFotmobPlayerAction(
  leaguePlayerId: string,
  fotmobPlayerId: number
): Promise<LinkResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = LinkSchema.safeParse({ league_player_id: leaguePlayerId, fotmob_player_id: fotmobPlayerId })
  if (!parsed.success) return { ok: false, error: 'Input non valido.' }

  // Verify this league_player belongs to admin's league
  const { data: lp } = await supabase
    .from('league_players')
    .select('id, full_name')
    .eq('id', leaguePlayerId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!lp) return { ok: false, error: 'Giocatore non trovato.' }

  // Check fotmob_id not already assigned to another player in this league
  const { data: conflict } = await supabase
    .from('league_players')
    .select('id, full_name')
    .eq('league_id', ctx.league.id)
    .eq('fotmob_player_id', fotmobPlayerId)
    .neq('id', leaguePlayerId)
    .maybeSingle()

  if (conflict) {
    return { ok: false, error: `ID già assegnato a ${conflict.full_name}.` }
  }

  const { error } = await supabase
    .from('league_players')
    .update({ fotmob_player_id: fotmobPlayerId })
    .eq('id', leaguePlayerId)
    .eq('league_id', ctx.league.id)

  if (error) return { ok: false, error: error.message }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'player_rating_class_change', // closest available
    entityType: 'league_player',
    entityId: leaguePlayerId,
    afterJson: { fotmob_player_id: fotmobPlayerId },
  })

  revalidatePath('/pool/link-fotmob')
  return { ok: true }
}

export async function dismissUnmatchedAction(
  matchdayId: string,
  fotmobPlayerId: number
): Promise<LinkResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify matchday belongs to this league
  const { data: md } = await supabase
    .from('matchdays')
    .select('id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!md) return { ok: false, error: 'Giornata non trovata.' }

  const { error } = await supabase
    .from('fotmob_unmatched_players')
    .delete()
    .eq('matchday_id', matchdayId)
    .eq('fotmob_player_id', fotmobPlayerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/pool/link-fotmob')
  return { ok: true }
}
