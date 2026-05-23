// ============================================================
// FantaMondiale — Server-side data access helpers
// ============================================================
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import type {
  FMCompetition,
  FMPhase,
  FMScoringRound,
  FMNationalTeam,
  FMPlayer,
  FMCoach,
  FMCompetitionConfigRow,
  FMFantasyTeam,
} from '@/types/database.types'

export interface FMContext {
  competition: FMCompetition
  config: FMCompetitionConfigRow | null
  isSuperAdmin: boolean
  userId: string
  fantasyTeamId: string | null
}

// Allows both super_admin and enrolled FM members.
// Super admins get fantasyTeamId=null (they can look up any team).
export async function requireFMContext(competitionId: string): Promise<FMContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.is_super_admin ?? false

  // Look up the user's fantasy team in this competition (if any).
  // Super-admins may also be enrolled as managers — they get the same
  // user-side tabs (Mia Rosa, Formazione, …) when they have a team here.
  const { data: team } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('manager_id', user.id)
    .maybeSingle()

  // Non-admin viewers must be enrolled to access the competition pages.
  if (!isSuperAdmin && !team) redirect('/' as Route)

  const fantasyTeamId: string | null = team?.id ?? null

  const { data: competition } = await supabase
    .from('fm_competition')
    .select('*')
    .eq('id', competitionId)
    .single()

  if (!competition) redirect('/fantamondiale' as Route)

  const { data: config } = await supabase
    .from('fm_competition_config')
    .select('*')
    .eq('competition_id', competitionId)
    .single()

  return {
    competition,
    config: config ?? null,
    isSuperAdmin,
    userId: user.id,
    fantasyTeamId,
  }
}

// Call at the top of admin page.tsx files to gate non-admins.
export function assertSuperAdmin(ctx: FMContext) {
  if (!ctx.isSuperAdmin) redirect('/' as Route)
}

export async function getFMCompetitions(): Promise<FMCompetition[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_competition')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getFMPhases(competitionId: string): Promise<FMPhase[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_phase')
    .select('*')
    .eq('competition_id', competitionId)
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getFMRounds(competitionId: string): Promise<FMScoringRound[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_scoring_round')
    .select('*')
    .eq('competition_id', competitionId)
    .order('display_order', { ascending: true })
  return data ?? []
}

export async function getFMTeams(competitionId: string): Promise<FMNationalTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_national_team')
    .select('*')
    .eq('competition_id', competitionId)
    .order('name', { ascending: true })
  return data ?? []
}

export async function getFMPlayers(
  competitionId: string,
  opts?: { teamId?: string; role?: string }
): Promise<(FMPlayer & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji'> })[]> {
  const supabase = await createClient()
  let q = supabase
    .from('fm_player')
    .select('*, fm_national_team(name, fifa_code, flag_emoji)')
    .eq('competition_id', competitionId)
    .order('name', { ascending: true })
  if (opts?.teamId) q = q.eq('national_team_id', opts.teamId)
  if (opts?.role) q = q.eq('role', opts.role as 'P' | 'D' | 'C' | 'A')
  const { data } = await q
  return (data ?? []) as unknown as (FMPlayer & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji'> })[]
}

export async function getFMCoaches(
  competitionId: string
): Promise<(FMCoach & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji'> })[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_coach')
    .select('*, fm_national_team(name, fifa_code, flag_emoji)')
    .eq('competition_id', competitionId)
    .order('fm_national_team(name)', { ascending: true })
  return (data ?? []) as unknown as (FMCoach & { fm_national_team: Pick<FMNationalTeam, 'name' | 'fifa_code' | 'flag_emoji'> })[]
}

export async function getFMFantasyTeams(competitionId: string): Promise<FMFantasyTeam[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_fantasy_team')
    .select('*')
    .eq('competition_id', competitionId)
    .order('name', { ascending: true })
  return data ?? []
}
