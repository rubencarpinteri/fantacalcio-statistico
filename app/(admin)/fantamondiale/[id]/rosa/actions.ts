'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getTeamId(competitionId: string, userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.id ?? null
}

async function ensureSquad(
  phaseId: string,
  fantasyTeamId: string,
  budgetTotal: number
): Promise<string> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('fm_phase_squad')
    .select('id')
    .eq('phase_id', phaseId)
    .eq('fantasy_team_id', fantasyTeamId)
    .maybeSingle()
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('fm_phase_squad')
    .insert({
      phase_id: phaseId,
      fantasy_team_id: fantasyTeamId,
      budget_total: budgetTotal,
      budget_spent: 0,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create squad')
  return data.id
}

async function recalcBudgetSpent(supabase: Awaited<ReturnType<typeof createClient>>, squadId: string) {
  const { data: players } = await supabase
    .from('fm_phase_squad_player')
    .select('purchase_price')
    .eq('phase_squad_id', squadId)
  const spent = (players ?? []).reduce((s, p) => s + (p.purchase_price ?? 0), 0)
  await supabase.from('fm_phase_squad').update({ budget_spent: spent }).eq('id', squadId)
}

export async function toggleSquadPlayerAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const playerId = fd.get('player_id') as string
  const playerPrice = Number(fd.get('player_price') ?? 0)
  const budgetTotal = Number(fd.get('budget_total') ?? 500)

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) throw new Error('Non sei iscritto a questa competizione')

  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') throw new Error('La fase non è aperta per la selezione della rosa')

  const squadId = await ensureSquad(phaseId, fantasyTeamId, budgetTotal)

  const { data: existing } = await supabase
    .from('fm_phase_squad_player')
    .select('id')
    .eq('phase_squad_id', squadId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    await supabase.from('fm_phase_squad_player').delete().eq('id', existing.id)
    await recalcBudgetSpent(supabase, squadId)
  } else {
    const { count } = await supabase
      .from('fm_phase_squad_player')
      .select('id', { count: 'exact', head: true })
      .eq('phase_squad_id', squadId)
    if ((count ?? 0) >= 25) throw new Error('Rosa piena (massimo 25 giocatori)')

    const { data: squad } = await supabase
      .from('fm_phase_squad')
      .select('budget_spent, budget_total')
      .eq('id', squadId)
      .single()
    if (squad && squad.budget_spent + playerPrice > squad.budget_total) {
      throw new Error(`Budget insufficiente (rimasti ${squad.budget_total - squad.budget_spent} cr)`)
    }

    await supabase
      .from('fm_phase_squad_player')
      .insert({ phase_squad_id: squadId, player_id: playerId, purchase_price: playerPrice })
    await recalcBudgetSpent(supabase, squadId)
  }

  revalidatePath(`/fantamondiale/${competitionId}/rosa`)
}

export async function setSquadCoachAction(fd: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')

  const competitionId = fd.get('competition_id') as string
  const phaseId = fd.get('phase_id') as string
  const coachId = (fd.get('coach_id') as string) || null

  const fantasyTeamId = await getTeamId(competitionId, user.id)
  if (!fantasyTeamId) throw new Error('Non sei iscritto a questa competizione')

  const { data: phase } = await supabase
    .from('fm_phase')
    .select('status')
    .eq('id', phaseId)
    .single()
  if (!phase || phase.status !== 'open') throw new Error('La fase non è aperta per la selezione della rosa')

  const squadId = await ensureSquad(phaseId, fantasyTeamId, 500)
  await supabase.from('fm_phase_squad').update({ coach_id: coachId }).eq('id', squadId)

  revalidatePath(`/fantamondiale/${competitionId}/rosa`)
}
