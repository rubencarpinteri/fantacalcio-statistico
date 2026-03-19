import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

interface TeamStandingRow {
  team_id: string
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  total_fantavoto: number
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('competitions').select('name').eq('id', id).single()
  return { title: `Classifica — ${data?.name ?? 'Competizione'}` }
}

export default async function CompetitionStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('id, name, type, status, scoring_config')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) notFound()

  // Latest snapshot (the most recently computed round)
  const { data: latestSnapshot } = await supabase
    .from('competition_standings_snapshots')
    .select('snapshot_json, after_round_id, version_number, created_at')
    .eq('competition_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Resolve the round info for the snapshot
  const { data: afterRound } = latestSnapshot?.after_round_id
    ? await supabase
        .from('competition_rounds')
        .select('round_number, name')
        .eq('id', latestSnapshot.after_round_id)
        .single()
    : { data: null }

  const standingRows: TeamStandingRow[] = []
  if (latestSnapshot?.snapshot_json) {
    const json = latestSnapshot.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
    if (json.type === 'table' && Array.isArray(json.rows)) {
      standingRows.push(...json.rows)
    }
  }

  const teamIds = standingRows.map((r) => r.team_id)
  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  const sc = comp.scoring_config as { method?: string } | null
  const hasGoals = sc?.method !== 'direct_comparison'

  const TYPE_LABEL: Record<string, string> = {
    campionato: 'Campionato', battle_royale: 'Battle Royale', coppa: 'Coppa',
  }

  return (
    <div className="space-y-6">
      <div>
        <a href={`/competitions/${id}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {comp.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Classifica</h1>
        <p className="text-sm text-[#8888aa]">
          {TYPE_LABEL[comp.type] ?? comp.type}
          {afterRound ? ` · aggiornata al turno ${afterRound.round_number} (${afterRound.name})` : ''}
        </p>
      </div>

      {standingRows.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessun dato disponibile. Calcola almeno un turno per vedere la classifica.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={`Classifica — ${standingRows.length} squadre`}
            description={latestSnapshot?.created_at
              ? `Aggiornata il ${new Date(latestSnapshot.created_at).toLocaleString('it-IT')}`
              : undefined}
            action={
              <a
                href={`/competitions/${id}/rounds`}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Gestisci turni →
              </a>
            }
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {[
                    'Pos', 'Squadra', 'G', 'V', 'N', 'P',
                    ...(hasGoals ? ['GF', 'GS', 'DR'] : []),
                    'Pt', 'FV',
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className={`px-4 py-2.5 text-xs font-medium text-[#55556a] ${
                        i < 2 ? 'text-left' : 'text-center'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {standingRows.map((row, idx) => (
                  <tr key={row.team_id} className="hover:bg-[#0f0f1a]">
                    <td className="w-12 px-4 py-3 text-left">
                      <span
                        className={`text-sm font-semibold ${
                          idx === 0
                            ? 'text-amber-400'
                            : idx <= 2
                              ? 'text-indigo-300'
                              : 'text-[#55556a]'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-left font-medium text-white">
                      {teamNameMap.get(row.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-[#8888aa]">{row.played}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa]">{row.wins}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa]">{row.draws}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa]">{row.losses}</td>
                    {hasGoals && (
                      <>
                        <td className="px-4 py-3 text-center text-[#8888aa]">{row.goals_for}</td>
                        <td className="px-4 py-3 text-center text-[#8888aa]">{row.goals_against}</td>
                        <td
                          className={`px-4 py-3 text-center ${
                            row.goal_difference > 0
                              ? 'text-emerald-400'
                              : row.goal_difference < 0
                                ? 'text-red-400'
                                : 'text-[#8888aa]'
                          }`}
                        >
                          {row.goal_difference > 0 ? '+' : ''}
                          {row.goal_difference}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-center font-bold text-white">{row.points}</td>
                    <td className="px-4 py-3 text-center text-[#55556a]">
                      {row.total_fantavoto.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="text-right">
        <a
          href={`/competitions/${id}`}
          className="text-sm text-[#55556a] hover:text-indigo-400"
        >
          ← Torna alla competizione
        </a>
      </div>
    </div>
  )
}
