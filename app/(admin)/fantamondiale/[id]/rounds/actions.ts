'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'

const RoundSchema = z.object({
  competition_id: z.string().uuid(),
  phase_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  display_order: z.coerce.number().int().positive(),
  lineup_open_at: z.string().optional(),
  lock_at: z.string().optional(),
})

export async function createRoundAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const parsed = RoundSchema.safeParse({
    competition_id: fd.get('competition_id'),
    phase_id: fd.get('phase_id'),
    name: fd.get('name'),
    display_order: fd.get('display_order'),
    lineup_open_at: fd.get('lineup_open_at') || undefined,
    lock_at: fd.get('lock_at') || undefined,
  })
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dati non validi')

  await supabase.from('fm_scoring_round').insert({ ...parsed.data, status: 'draft' as const })
  revalidatePath(`/fantamondiale/${parsed.data.competition_id}/rounds`)
}

export async function updateRoundAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const id = fd.get('id') as string
  const competitionId = fd.get('competition_id') as string
  const name = fd.get('name') as string
  const lineup_open_at = (fd.get('lineup_open_at') as string) || null
  const lock_at = (fd.get('lock_at') as string) || null

  await supabase.from('fm_scoring_round').update({ name, lineup_open_at, lock_at }).eq('id', id)
  revalidatePath(`/fantamondiale/${competitionId}/rounds`)
}

export async function setRoundStatusAction(
  roundId: string,
  competitionId: string,
  status: 'draft' | 'open' | 'locked' | 'scoring' | 'published'
) {
  await requireSuperAdmin()
  const supabase = await createClient()

  if (status === 'locked') {
    await snapshotOwnership(supabase, roundId)
  }

  const updates: Record<string, unknown> = { status }
  if (status === 'published') updates.published_at = new Date().toISOString()

  await supabase.from('fm_scoring_round').update(updates).eq('id', roundId)
  revalidatePath(`/fantamondiale/${competitionId}/rounds`)
}

async function snapshotOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roundId: string
) {
  // Fetch all submitted lineups for this round with their starters
  const { data: lineups, error: lineupsErr } = await supabase
    .from('fm_matchday_lineup')
    .select('id, fantasy_team_id, fm_matchday_lineup_player(player_id, is_starter)')
    .eq('scoring_round_id', roundId)
    .not('submitted_at', 'is', null)

  if (lineupsErr) throw new Error(`Ownership snapshot failed: ${lineupsErr.message}`)
  if (!lineups || lineups.length === 0) return

  const totalTeams = lineups.length

  // Count how many teams field each player as a starter
  const ownershipMap = new Map<string, number>()
  for (const lineup of lineups) {
    for (const lp of lineup.fm_matchday_lineup_player) {
      if (!lp.is_starter) continue
      ownershipMap.set(lp.player_id, (ownershipMap.get(lp.player_id) ?? 0) + 1)
    }
  }

  if (ownershipMap.size === 0) return

  const rows = Array.from(ownershipMap.entries()).map(([player_id, teams_owning]) => ({
    scoring_round_id: roundId,
    player_id,
    teams_owning,
    teams_total: totalTeams,
    ownership_pct: parseFloat(((teams_owning / totalTeams) * 100).toFixed(3)),
  }))

  const { error: upsertErr } = await supabase
    .from('fm_round_player_ownership')
    .upsert(rows, { onConflict: 'scoring_round_id,player_id' })

  if (upsertErr) throw new Error(`Ownership upsert failed: ${upsertErr.message}`)
}

export async function deleteRoundAction(roundId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_scoring_round').delete().eq('id', roundId)
  revalidatePath(`/fantamondiale/${competitionId}/rounds`)
}
