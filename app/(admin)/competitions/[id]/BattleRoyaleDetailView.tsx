// ============================================================
// app/(admin)/competitions/[id]/BattleRoyaleDetailView.tsx
// ============================================================
// Server component rendered from CompetitionDetailPage when the
// competition type is `battle_royale`. The default detail page
// reads `competition_matchups` (Campionato-only); BR data lives
// in `competition_fixtures` + `competition_standings_snapshots`,
// so it gets its own focused hub view.
// ============================================================

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Competition, FantasyTeam } from '@/types/database.types'

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

const STATUS_COLOR: Record<string, string> = {
  setup:     'text-[#8888aa] bg-[#1a1a24]',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup', active: 'Attiva', completed: 'Conclusa', cancelled: 'Annullata',
}

const ROUND_STATUS_BADGE: Record<string, string> = {
  pending:  'text-[#8888aa] bg-[#1a1a24]',
  computed: 'text-emerald-400 bg-emerald-500/10',
  locked:   'text-indigo-300 bg-indigo-500/10',
}
const ROUND_STATUS_LABEL: Record<string, string> = {
  pending: 'In attesa', computed: 'Calcolato', locked: 'Bloccato',
}

interface Props {
  competition: Competition
  isAdmin: boolean
  myTeamId: string | null
  allTeams: Pick<FantasyTeam, 'id' | 'name'>[]
}

export async function BattleRoyaleDetailView({ competition, isAdmin, myTeamId, allTeams }: Props) {
  const supabase = await createClient()
  const teamNameMap = new Map(allTeams.map((t) => [t.id, t.name]))

  // ---- Rounds for this competition ----
  const { data: roundsRaw } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id, status, computed_at')
    .eq('competition_id', competition.id)
    .order('round_number', { ascending: true })

  const rounds = roundsRaw ?? []
  const computedRounds = rounds.filter((r) => r.status === 'computed' || r.status === 'locked')

  // ---- Latest computed round + its standings snapshot ----
  const latestRound = [...computedRounds].sort(
    (a, b) => (b.round_number as number) - (a.round_number as number)
  )[0] ?? null

  let topStandings: TeamStandingRow[] = []
  let lastSnapshotDate: string | null = null
  if (latestRound) {
    const { data: snap } = await supabase
      .from('competition_standings_snapshots')
      .select('snapshot_json, created_at')
      .eq('competition_id', competition.id)
      .eq('after_round_id', latestRound.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (snap?.snapshot_json) {
      const json = snap.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
      if (json.type === 'table' && Array.isArray(json.rows)) {
        topStandings = json.rows.slice(0, 5)
      }
      lastSnapshotDate = snap.created_at as string
    }
  }

  // ---- Latest round's fixture preview (top scorer + lowest scorer) ----
  let dayWinner: { team_id: string; total_fantavoto: number } | null = null
  let dayLoser: { team_id: string; total_fantavoto: number } | null = null
  if (latestRound) {
    const { data: dayFixtures } = await supabase
      .from('competition_fixtures')
      .select('home_team_id, home_fantavoto, away_team_id, away_fantavoto')
      .eq('round_id', latestRound.id)

    const teamScoreMap = new Map<string, number>()
    for (const f of dayFixtures ?? []) {
      if (f.home_fantavoto != null) teamScoreMap.set(f.home_team_id, Number(f.home_fantavoto))
      if (f.away_fantavoto != null) teamScoreMap.set(f.away_team_id, Number(f.away_fantavoto))
    }
    const sorted = [...teamScoreMap.entries()].sort((a, b) => b[1] - a[1])
    if (sorted.length > 0) {
      const [topId, topScore] = sorted[0]!
      const [botId, botScore] = sorted[sorted.length - 1]!
      dayWinner = { team_id: topId, total_fantavoto: topScore }
      dayLoser = { team_id: botId, total_fantavoto: botScore }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/competitions" className="text-sm text-[#55556a] hover:text-indigo-400">
            ← Competizioni
          </a>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">⚔ {competition.name}</h1>
            {competition.season && <Badge variant="muted">{competition.season}</Badge>}
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[competition.status] ?? ''}`}>
              {STATUS_LABEL[competition.status] ?? competition.status}
            </span>
          </div>
          <p className="text-sm text-[#8888aa]">Battle Royale · ogni squadra contro tutte le altre</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/competitions/${competition.id}/standings`}
            className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors"
          >
            Classifica completa →
          </a>
          {isAdmin && (
            <a
              href={`/competitions/${competition.id}/rounds`}
              className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-white transition-colors"
            >
              Gestisci turni →
            </a>
          )}
        </div>
      </div>

      {/* Empty state */}
      {rounds.length === 0 && (
        <Card>
          <CardContent>
            <div className="py-10 text-center">
              <p className="text-sm text-[#8888aa]">Nessun turno generato.</p>
              {isAdmin && (
                <a
                  href={`/competitions/${competition.id}/rounds`}
                  className="mt-3 inline-block text-sm text-indigo-400 hover:text-indigo-300"
                >
                  Aggiungi giornate →
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest-round hero */}
      {latestRound && (
        <div className="rounded-xl border border-indigo-500/30 bg-[#0d0d1a] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e42]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
                Ultimo turno calcolato
              </span>
              <span className="font-semibold text-white">{latestRound.name}</span>
            </div>
            <a
              href={`/competitions/${competition.id}/rounds/${latestRound.round_number}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Dettaglio →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#1e1e2e]">
            <div className="p-5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500/70">
                🏆 Vincitore di giornata
              </p>
              {dayWinner ? (
                <>
                  <p className={`text-base font-bold ${dayWinner.team_id === myTeamId ? 'text-indigo-300' : 'text-white'}`}>
                    {teamNameMap.get(dayWinner.team_id) ?? '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-[#55556a] tabular-nums">
                    {dayWinner.total_fantavoto.toFixed(1)} fantavoto
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#55556a]">—</p>
              )}
            </div>
            <div className="p-5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-500/70">
                💀 Ultimo di giornata
              </p>
              {dayLoser ? (
                <>
                  <p className={`text-base font-bold ${dayLoser.team_id === myTeamId ? 'text-indigo-300' : 'text-white'}`}>
                    {teamNameMap.get(dayLoser.team_id) ?? '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-[#55556a] tabular-nums">
                    {dayLoser.total_fantavoto.toFixed(1)} fantavoto
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#55556a]">—</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 mini-standings */}
      {topStandings.length > 0 && (
        <Card>
          <CardHeader
            title="Top 5 classifica"
            description={lastSnapshotDate
              ? `Aggiornata al ${new Date(lastSnapshotDate).toLocaleString('it-IT')}`
              : undefined}
            action={
              <a
                href={`/competitions/${competition.id}/standings`}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Classifica completa →
              </a>
            }
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {['Pos', 'Squadra', 'G', 'V', 'N', 'P', 'DR', 'Pt'].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className={`px-4 py-2.5 text-xs font-medium text-[#55556a] ${i < 2 ? 'text-left' : 'text-center'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {topStandings.map((row, idx) => (
                  <tr key={row.team_id} className={`hover:bg-[#0f0f1a] ${row.team_id === myTeamId ? 'bg-indigo-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${
                        idx === 0 ? 'text-amber-400'
                          : idx <= 2 ? 'text-indigo-300'
                          : 'text-[#55556a]'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${row.team_id === myTeamId ? 'text-indigo-200' : 'text-white'}`}>
                      {teamNameMap.get(row.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-[#8888aa] tabular-nums">{row.played}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa] tabular-nums">{row.wins}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa] tabular-nums">{row.draws}</td>
                    <td className="px-4 py-3 text-center text-[#8888aa] tabular-nums">{row.losses}</td>
                    <td className={`px-4 py-3 text-center tabular-nums ${
                      row.goal_difference > 0 ? 'text-emerald-400'
                        : row.goal_difference < 0 ? 'text-red-400'
                        : 'text-[#8888aa]'
                    }`}>
                      {row.goal_difference > 0 ? '+' : ''}{row.goal_difference}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-white tabular-nums">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Rounds list */}
      {rounds.length > 0 && (
        <Card>
          <CardHeader
            title={`Turni (${rounds.length})`}
            description={`${computedRounds.length} calcolati`}
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Turno</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Stato</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#55556a]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {rounds.map((r) => (
                  <tr key={r.id} className="hover:bg-[#0f0f1a]">
                    <td className="px-4 py-2.5 w-12 text-[#55556a] tabular-nums">{r.round_number}</td>
                    <td className="px-4 py-2.5 text-white">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROUND_STATUS_BADGE[r.status] ?? ''}`}>
                        {ROUND_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a
                        href={`/competitions/${competition.id}/rounds/${r.round_number}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Dettaglio →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
