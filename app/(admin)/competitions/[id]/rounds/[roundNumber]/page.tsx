import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RoundManager } from './RoundManager'
import type { CompetitionRound, CompetitionFixture } from '@/types/database.types'

export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string; roundNumber: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id, roundNumber } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status, scoring_config')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) notFound()

  const { data: round } = await supabase
    .from('competition_rounds')
    .select('*')
    .eq('competition_id', id)
    .eq('round_number', Number(roundNumber))
    .single()

  if (!round) notFound()

  const { data: fixtures } = await supabase
    .from('competition_fixtures')
    .select('*')
    .eq('round_id', round.id)
    .order('id')

  const fixtureList = (fixtures ?? []) as CompetitionFixture[]

  // Team name resolution
  const teamIds = [
    ...new Set(fixtureList.flatMap((f) => [f.home_team_id, f.away_team_id])),
  ]
  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Linked matchday info
  const { data: matchday } = round.matchday_id
    ? await supabase.from('matchdays').select('id, name, status').eq('id', round.matchday_id).single()
    : { data: null }

  const sc = comp.scoring_config as { method?: string } | null
  const hasGoals = sc?.method !== 'direct_comparison'

  return (
    <div className="space-y-6">
      <div>
        <a href={`/competitions/${id}/rounds`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← Turni
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">{(round as CompetitionRound).name}</h1>
        <p className="text-sm text-[#8888aa]">
          {comp.name}
          {matchday ? ` · ${matchday.name}` : ''}
        </p>
      </div>

      <RoundManager
        round={round as CompetitionRound}
        competitionId={id}
        matchday={matchday}
        hasGoals={hasGoals}
      />

      {/* Fixtures table */}
      {fixtureList.length > 0 && (
        <Card>
          <CardHeader title={`Incontri (${fixtureList.length})`} />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Casa</th>
                  {hasGoals && <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Reti</th>}
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Fantavoto</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Risultato</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Fantavoto</th>
                  {hasGoals && <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Reti</th>}
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#55556a]">Ospite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {fixtureList.map((f) => {
                  const homeName = teamNameMap.get(f.home_team_id) ?? '—'
                  const awayName = teamNameMap.get(f.away_team_id) ?? '—'
                  const resultColorMap = {
                    home_win:  { home: 'text-emerald-400 font-bold', away: 'text-[#55556a]' },
                    away_win:  { home: 'text-[#55556a]', away: 'text-emerald-400 font-bold' },
                    draw:      { home: 'text-amber-400', away: 'text-amber-400' },
                  } as const
                  const resultColor = (f.result ? resultColorMap[f.result] : undefined) ?? { home: 'text-white', away: 'text-white' }

                  return (
                    <tr key={f.id} className="hover:bg-[#0f0f1a]">
                      <td className={`px-4 py-2.5 ${resultColor.home}`}>{homeName}</td>
                      {hasGoals && (
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{f.home_score ?? '—'}</td>
                      )}
                      <td className="px-4 py-2.5 text-center text-[#8888aa]">
                        {f.home_fantavoto != null ? f.home_fantavoto.toFixed(1) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {f.result ? (
                          <span className={`text-xs font-medium ${
                            f.result === 'draw' ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {f.result === 'home_win' ? `${f.home_points}–${f.away_points}` :
                             f.result === 'away_win' ? `${f.home_points}–${f.away_points}` :
                             `${f.home_points}–${f.away_points}`}
                          </span>
                        ) : (
                          <span className="text-xs text-[#55556a]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-[#8888aa]">
                        {f.away_fantavoto != null ? f.away_fantavoto.toFixed(1) : '—'}
                      </td>
                      {hasGoals && (
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{f.away_score ?? '—'}</td>
                      )}
                      <td className={`px-4 py-2.5 text-right ${resultColor.away}`}>{awayName}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {fixtureList.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessun incontro disponibile per questo turno.
              {comp.type === 'campionato' && ' Genera prima il calendario.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
