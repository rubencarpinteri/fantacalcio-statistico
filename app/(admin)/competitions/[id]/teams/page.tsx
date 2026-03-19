import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TeamEnrollmentForm } from './TeamEnrollmentForm'

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) notFound()

  // Already enrolled teams with names
  const { data: enrolled } = await supabase
    .from('competition_teams')
    .select('id, team_id, fantasy_teams(name)')
    .eq('competition_id', id)
    .order('id')

  const enrolledTeams = enrolled ?? []
  const enrolledIds = new Set(enrolledTeams.map((e) => e.team_id))

  // All teams in this league not yet enrolled
  const { data: allTeams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  const availableTeams = (allTeams ?? []).filter((t) => !enrolledIds.has(t.id))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href={`/competitions/${id}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {comp.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Squadre iscritte</h1>
        <p className="text-sm text-[#8888aa]">
          Gestisci le squadre partecipanti a questa competizione.
        </p>
      </div>

      <Card>
        <CardHeader title="Iscrizioni" />
        <CardContent>
          <TeamEnrollmentForm
            competitionId={id}
            enrolledTeams={enrolledTeams as unknown as Parameters<typeof TeamEnrollmentForm>[0]['enrolledTeams']}
            availableTeams={availableTeams}
            competitionStatus={comp.status}
          />
        </CardContent>
      </Card>
    </div>
  )
}
