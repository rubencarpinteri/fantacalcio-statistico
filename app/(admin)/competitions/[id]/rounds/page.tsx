import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RoundsManager } from './RoundsManager'
import type { CompetitionRound, Matchday } from '@/types/database.types'

export default async function CompetitionRoundsPage({
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

  const { data: rounds } = await supabase
    .from('competition_rounds')
    .select('*')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const roundList = (rounds ?? []) as CompetitionRound[]

  // For campionato / coppa: published matchdays available to link
  const { data: publishedMatchdays } = await supabase
    .from('matchdays')
    .select('id, name, matchday_number, status')
    .eq('league_id', ctx.league.id)
    .eq('status', 'published')
    .order('matchday_number', { ascending: true, nullsFirst: false })

  const matchdays = (publishedMatchdays ?? []) as Matchday[]

  // Team count for battle_royale min-check
  const { count: teamCount } = await supabase
    .from('competition_teams')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', id)

  return (
    <div className="space-y-6">
      <div>
        <a href={`/competitions/${id}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {comp.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Turni e incontri</h1>
        <p className="text-sm text-[#8888aa]">
          {comp.type === 'campionato' && 'Genera il calendario, collega le giornate e calcola ogni turno.'}
          {comp.type === 'battle_royale' && 'Aggiungi ogni giornata pubblicata per calcolare il Battle Royale.'}
          {comp.type === 'coppa' && 'Gestisci i turni di Coppa (gironi e fase ad eliminazione).'}
        </p>
      </div>

      <RoundsManager
        competitionId={id}
        competitionType={comp.type}
        competitionStatus={comp.status}
        rounds={roundList}
        publishedMatchdays={matchdays}
        teamCount={teamCount ?? 0}
      />
    </div>
  )
}
