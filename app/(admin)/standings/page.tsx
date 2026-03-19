import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Competition } from '@/types/database.types'

export const metadata = { title: 'Classifica' }

const TYPE_LABEL: Record<string, string> = {
  campionato:    'Campionato',
  battle_royale: 'Battle Royale',
  coppa:         'Coppa',
}
const TYPE_ICON: Record<string, string> = {
  campionato:    '🏟',
  battle_royale: '⚔',
  coppa:         '🏆',
}
const STATUS_BADGE: Record<string, string> = {
  setup:     'text-[#8888aa] bg-[#1a1a24]',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup', active: 'Attiva', completed: 'Conclusa', cancelled: 'Annullata',
}

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

export default async function StandingsPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .eq('league_id', ctx.league.id)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: true })

  const list = (competitions ?? []) as Competition[]

  // Fetch latest standings snapshot for each active/completed competition
  const snapshots: Record<string, { rows: TeamStandingRow[]; round_name: string | null }> = {}

  for (const comp of list) {
    const { data: snap } = await supabase
      .from('competition_standings_snapshots')
      .select('snapshot_json, after_round_id')
      .eq('competition_id', comp.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!snap?.snapshot_json) {
      snapshots[comp.id] = { rows: [], round_name: null }
      continue
    }

    const json = snap.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
    const rows = json.type === 'table' && Array.isArray(json.rows) ? json.rows : []

    // Get round name
    const { data: round } = snap.after_round_id
      ? await supabase
          .from('competition_rounds')
          .select('name')
          .eq('id', snap.after_round_id)
          .single()
      : { data: null }

    snapshots[comp.id] = { rows: rows.slice(0, 5), round_name: round?.name ?? null }
  }

  // Collect all team IDs across all snapshots and resolve names once
  const allTeamIds = [
    ...new Set(
      Object.values(snapshots).flatMap((s) => s.rows.map((r) => r.team_id))
    ),
  ]
  const { data: teams } = allTeamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', allTeamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Setup competitions (no rounds computed yet)
  const { data: setupComps } = await supabase
    .from('competitions')
    .select('id, name, type, status, season')
    .eq('league_id', ctx.league.id)
    .eq('status', 'setup')
    .order('created_at', { ascending: true })
  const setupList = (setupComps ?? []) as Competition[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Classifiche</h1>
        <p className="text-sm text-[#8888aa]">
          Panoramica delle competizioni attive · {ctx.league.name}
        </p>
      </div>

      {list.length === 0 && setupList.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessuna competizione configurata.
              {ctx.role === 'league_admin' && (
                <> <a href="/competitions/new" className="text-indigo-400 hover:underline">Crea la prima competizione →</a></>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active / completed competitions with standings */}
      {list.map((comp) => {
        const snap = snapshots[comp.id] ?? { rows: [], round_name: null }
        const sc = comp.scoring_config as { method?: string } | null
        const hasGoals = sc?.method !== 'direct_comparison'

        return (
          <Card key={comp.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span>{TYPE_ICON[comp.type] ?? '🏆'}</span>
                  <span>{comp.name}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[comp.status] ?? ''}`}>
                    {STATUS_LABEL[comp.status] ?? comp.status}
                  </span>
                </span>
              }
              description={
                snap.round_name
                  ? `${TYPE_LABEL[comp.type] ?? comp.type}${comp.season ? ` · ${comp.season}` : ''} · aggiornata al ${snap.round_name}`
                  : `${TYPE_LABEL[comp.type] ?? comp.type}${comp.season ? ` · ${comp.season}` : ''}`
              }
              action={
                ctx.role === 'league_admin' ? (
                  <a
                    href={`/competitions/${comp.id}/standings`}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Classifica completa →
                  </a>
                ) : undefined
              }
            />

            {snap.rows.length === 0 ? (
              <CardContent>
                <p className="text-sm text-[#55556a]">
                  Nessun turno calcolato ancora.
                </p>
              </CardContent>
            ) : (
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
                    {snap.rows.map((row, idx) => (
                      <tr key={row.team_id} className="hover:bg-[#0f0f1a]">
                        <td className="w-12 px-4 py-2.5 text-left">
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
                        <td className="px-4 py-2.5 text-left font-medium text-white">
                          {teamNameMap.get(row.team_id) ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.played}</td>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.wins}</td>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.draws}</td>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.losses}</td>
                        {hasGoals && (
                          <>
                            <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.goals_for}</td>
                            <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.goals_against}</td>
                            <td
                              className={`px-4 py-2.5 text-center ${
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
                        <td className="px-4 py-2.5 text-center font-bold text-white">{row.points}</td>
                        <td className="px-4 py-2.5 text-center text-[#55556a]">
                          {row.total_fantavoto.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {ctx.role === 'league_admin' && (
                  <div className="border-t border-[#1e1e2e] px-4 py-2">
                    <a
                      href={`/competitions/${comp.id}/standings`}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      Classifica completa →
                    </a>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Setup competitions (no standings yet, just a placeholder) */}
      {setupList.length > 0 && (
        <Card>
          <CardHeader title="Competizioni in configurazione" />
          <CardContent>
            <div className="space-y-2">
              {setupList.map((comp) => (
                <div
                  key={comp.id}
                  className="flex items-center justify-between rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span>{TYPE_ICON[comp.type] ?? '🏆'}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{comp.name}</p>
                      <p className="text-xs text-[#55556a]">
                        {TYPE_LABEL[comp.type] ?? comp.type}
                        {comp.season ? ` · ${comp.season}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="rounded px-2 py-0.5 text-xs font-medium text-[#8888aa] bg-[#1a1a24]">
                    Setup
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
