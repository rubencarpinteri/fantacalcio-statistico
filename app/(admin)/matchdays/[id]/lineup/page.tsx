import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { LineupBuilder } from './LineupBuilder'

export const metadata = { title: 'Inserisci Formazione' }

export default async function LineupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  // Validate matchday
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, locks_at, league_id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Admins can inspect lineups; managers can only edit when open
  if (ctx.role === 'manager' && matchday.status !== 'open') {
    redirect(`/matchdays/${matchdayId}`)
  }

  // Resolve team
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .single()

  // For admins: allow picking any team
  // For now, always use the user's own team
  if (!team && ctx.role === 'manager') {
    return (
      <div className="py-12 text-center text-sm text-[#55556a]">
        Nessuna squadra trovata per il tuo account. Contatta l&apos;admin.
      </div>
    )
  }

  // Fetch active formations for this league
  const { data: formations } = await supabase
    .from('formations')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('name')

  if (!formations || formations.length === 0) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-amber-400">
          Nessuna formazione attiva configurata. L&apos;admin deve prima configurare le formazioni.
        </p>
      </div>
    )
  }

  // Fetch the team's current submission (if any) for pre-filling
  let currentSubmission: {
    formation_id: string
    submission_number: number
    status: string
    players: Array<{
      player_id: string
      slot_id: string
      is_bench: boolean
      bench_order: number | null
    }>
  } | null = null

  if (team) {
    const { data: pointer } = await supabase
      .from('lineup_current_pointers')
      .select('submission_id')
      .eq('team_id', team.id)
      .eq('matchday_id', matchdayId)
      .single()

    if (pointer) {
      const { data: sub } = await supabase
        .from('lineup_submissions')
        .select('id, formation_id, submission_number, status')
        .eq('id', pointer.submission_id)
        .single()

      if (sub) {
        const { data: subPlayers } = await supabase
          .from('lineup_submission_players')
          .select('player_id, slot_id, is_bench, bench_order')
          .eq('submission_id', sub.id)

        currentSubmission = {
          formation_id: sub.formation_id,
          submission_number: sub.submission_number,
          status: sub.status,
          players: subPlayers ?? [],
        }
      }
    }
  }

  // Fetch the team's roster players (active only)
  const rosterPlayers = team
    ? await (async () => {
        const { data: roster } = await supabase
          .from('team_roster_entries')
          .select('player_id, league_players(id, full_name, club, mantra_roles, primary_mantra_role, rating_class)')
          .eq('team_id', team.id)
          .is('released_at', null)

        return (roster ?? [])
          .map((r) => (r as unknown as { league_players: unknown }).league_players)
          .filter(Boolean) as Array<{
          id: string
          full_name: string
          club: string
          mantra_roles: string[]
          primary_mantra_role: string | null
          rating_class: string
        }>
      })()
    : []

  return (
    <div className="space-y-4">
      <div>
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">
          {ctx.role === 'manager' ? 'La tua formazione' : `Formazione — ${team?.name ?? ''}`}
        </h1>
        {matchday.locks_at && (
          <p className="text-sm text-amber-400">
            Scadenza:{' '}
            {new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(matchday.locks_at)
            )}
          </p>
        )}
      </div>

      <LineupBuilder
        matchdayId={matchdayId}
        formations={formations}
        rosterPlayers={rosterPlayers}
        currentSubmission={currentSubmission}
        isReadOnly={matchday.status !== 'open'}
      />
    </div>
  )
}
