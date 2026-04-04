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

/**
 * Permanently ignore a FotMob player — inserts into fotmob_ignored_players so
 * the fetch route never queues them again, and clears all existing unmatched
 * entries for this player across every matchday of this league.
 * The player stays in serie_a_players and can still be linked if later added
 * to a fantasy team via the roster UI.
 */
export async function ignoreForeverAction(
  fotmobPlayerId: number,
  fotmobName: string,
): Promise<LinkResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Add to permanent ignore list
  const { error: ignoreErr } = await supabase
    .from('fotmob_ignored_players')
    .upsert(
      { league_id: ctx.league.id, fotmob_player_id: fotmobPlayerId, fotmob_name: fotmobName },
      { onConflict: 'league_id,fotmob_player_id', ignoreDuplicates: true }
    )
  if (ignoreErr) return { ok: false, error: ignoreErr.message }

  // Clear all existing unmatched entries for this player across all matchdays
  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('id')
    .eq('league_id', ctx.league.id)

  const matchdayIds = (matchdays ?? []).map(m => m.id)
  if (matchdayIds.length > 0) {
    await supabase
      .from('fotmob_unmatched_players')
      .delete()
      .in('matchday_id', matchdayIds)
      .eq('fotmob_player_id', fotmobPlayerId)
  }

  revalidatePath('/pool/link-fotmob')
  return { ok: true }
}

/**
 * Bulk-ignore all currently visible unmatched players at once.
 */
export async function ignoreAllUnmatchedAction(
  entries: Array<{ fotmob_player_id: number; fotmob_name: string }>
): Promise<LinkResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  if (entries.length === 0) return { ok: true }

  const { error: ignoreErr } = await supabase
    .from('fotmob_ignored_players')
    .upsert(
      entries.map(e => ({
        league_id: ctx.league.id,
        fotmob_player_id: e.fotmob_player_id,
        fotmob_name: e.fotmob_name,
      })),
      { onConflict: 'league_id,fotmob_player_id', ignoreDuplicates: true }
    )
  if (ignoreErr) return { ok: false, error: ignoreErr.message }

  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('id')
    .eq('league_id', ctx.league.id)

  const matchdayIds = (matchdays ?? []).map(m => m.id)
  if (matchdayIds.length > 0) {
    const fotmobIds = entries.map(e => e.fotmob_player_id)
    await supabase
      .from('fotmob_unmatched_players')
      .delete()
      .in('matchday_id', matchdayIds)
      .in('fotmob_player_id', fotmobIds)
  }

  revalidatePath('/pool/link-fotmob')
  return { ok: true }
}
