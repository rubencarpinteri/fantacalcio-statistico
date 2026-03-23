import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { RosaBuilder } from './RosaBuilder'
import type { RosterPlayer } from './RosaBuilder'

export const metadata = { title: 'Gestione Rose' }

export default async function RosterPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Check if pool has any players (to show onboarding hint)
  const { count: poolCount } = await supabase
    .from('serie_a_players')
    .select('id', { count: 'exact', head: true })
    .eq('season', '2024-25')

  // Fetch all fantasy teams with manager profiles
  const { data: teamsData } = await supabase
    .from('fantasy_teams')
    .select('id, name, manager_id, profiles!inner(full_name, username)')
    .eq('league_id', ctx.league.id)
    .order('name', { ascending: true })

  const teams = (teamsData ?? []).map((t) => {
    const profile = t.profiles as unknown as { full_name: string; username: string }
    return {
      id: t.id,
      name: t.name,
      manager_name: profile.full_name || profile.username,
    }
  })

  // Build initial rosters map: teamId → RosterPlayer[]
  const initialRosters: Record<string, RosterPlayer[]> = {}
  for (const team of teams) {
    initialRosters[team.id] = []
  }

  if (teams.length > 0) {
    const teamIds = teams.map((t) => t.id)

    const { data: rosterEntries } = await supabase
      .from('team_roster_entries')
      .select(`
        id,
        team_id,
        player_id,
        league_players!inner(
          id,
          full_name,
          club,
          mantra_roles,
          rating_class,
          serie_a_player_id
        )
      `)
      .in('team_id', teamIds)
      .is('released_at', null)
      .order('team_id', { ascending: true })

    for (const entry of rosterEntries ?? []) {
      const lp = entry.league_players as unknown as {
        id: string
        full_name: string
        club: string
        mantra_roles: string[]
        rating_class: string
        serie_a_player_id: string | null
      }

      const roster = initialRosters[entry.team_id]
      if (roster) {
        roster.push({
          entry_id: entry.id,
          player_id: lp.id,
          full_name: lp.full_name,
          club: lp.club,
          mantra_roles: lp.mantra_roles,
          rating_class: lp.rating_class,
        })
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gestione Rose</h1>
          <p className="text-sm text-[#8888aa]">
            Assegna giocatori dal pool Serie A alle rose delle squadre.
          </p>
        </div>
        <Link
          href={"/pool" as Route}
          className="rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-[#f0f0fa] transition-colors"
        >
          ⚽ Pool Giocatori
        </Link>
      </div>

      {/* Pool empty callout */}
      {(poolCount ?? 0) === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
          <p className="text-sm font-medium text-amber-400">
            Nessun giocatore nel pool.
          </p>
          <p className="mt-1 text-sm text-amber-400/70">
            Importa prima i giocatori dal Pool prima di assegnarli alle rose.{' '}
            <Link href={"/pool" as Route} className="underline hover:text-amber-300">
              Vai al Pool →
            </Link>
          </p>
        </div>
      )}

      {/* No teams callout */}
      {teams.length === 0 && (
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] px-6 py-10 text-center">
          <p className="text-[#8888aa]">Nessuna squadra trovata in questa lega.</p>
          <p className="mt-1 text-sm text-[#55556a]">
            Crea le squadre prima di poter gestire le rose.
          </p>
        </div>
      )}

      {/* Rosa builder */}
      {teams.length > 0 && (
        <RosaBuilder
          teams={teams}
          initialRosters={initialRosters}
          leagueId={ctx.league.id}
        />
      )}
    </div>
  )
}
