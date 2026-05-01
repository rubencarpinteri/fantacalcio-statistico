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
  setup:     'text-[#9095b8] bg-white/[0.06]',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup', active: 'Attiva', completed: 'Conclusa', cancelled: 'Annullata',
}

const ROUND_STATUS_BADGE: Record<string, string> = {
  pending:  'text-[#9095b8] bg-white/[0.06]',
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
          <a href="/competitions" className="text-[12.5px] text-[#9095b8] transition-colors hover:text-indigo-300">
            ← Competizioni
          </a>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h1
              className="flex items-baseline gap-2 font-light tracking-tight text-[#f5f7ff]"
              style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
            >
              <span className="font-semibold">{competition.name}</span>
              <span className="serif font-normal text-[#b8bcdc]">— Battle Royale</span>
            </h1>
            <div className="flex items-center gap-2">
              {competition.season && <Badge variant="muted">{competition.season}</Badge>}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_COLOR[competition.status] ?? ''}`}>
                {STATUS_LABEL[competition.status] ?? competition.status}
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-[12.5px] text-[#9095b8]">Ogni squadra contro tutte le altre · l&apos;ultima viene eliminata</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/competitions/${competition.id}/standings`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-[13px] font-medium tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
          >
            Classifica completa →
          </a>
          {isAdmin && (
            <a
              href={`/competitions/${competition.id}/rounds`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[#9095b8] hover:bg-white/[0.06] hover:text-white transition-colors"
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
              <p className="text-sm text-[#9095b8]">Nessun turno generato.</p>
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
        <div className="rounded-xl border border-indigo-500/30 bg-white/[0.04] backdrop-blur-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/8">
            <div className="p-5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500/70">
                🏆 Vincitore di giornata
              </p>
              {dayWinner ? (
                <>
                  <p className={`text-base font-bold ${dayWinner.team_id === myTeamId ? 'text-indigo-300' : 'text-white'}`}>
                    {teamNameMap.get(dayWinner.team_id) ?? '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9095b8] tabular-nums">
                    {dayWinner.total_fantavoto.toFixed(1)} fantavoto
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#9095b8]">—</p>
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
                  <p className="mt-0.5 text-xs text-[#9095b8] tabular-nums">
                    {dayLoser.total_fantavoto.toFixed(1)} fantavoto
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#9095b8]">—</p>
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
                <tr className="border-b border-white/8">
                  {['Pos', 'Squadra', 'G', 'V', 'N', 'P', 'DR', 'Pt'].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className={`px-4 py-2.5 text-xs font-medium text-[#9095b8] ${i < 2 ? 'text-left' : 'text-center'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {topStandings.map((row, idx) => (
                  <tr key={row.team_id} className={`hover:bg-white/[0.04] ${row.team_id === myTeamId ? 'bg-indigo-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-semibold ${
                        idx === 0 ? 'text-amber-400'
                          : idx <= 2 ? 'text-indigo-300'
                          : 'text-[#9095b8]'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${row.team_id === myTeamId ? 'text-indigo-200' : 'text-white'}`}>
                      {teamNameMap.get(row.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-[#9095b8] tabular-nums">{row.played}</td>
                    <td className="px-4 py-3 text-center text-[#9095b8] tabular-nums">{row.wins}</td>
                    <td className="px-4 py-3 text-center text-[#9095b8] tabular-nums">{row.draws}</td>
                    <td className="px-4 py-3 text-center text-[#9095b8] tabular-nums">{row.losses}</td>
                    <td className={`px-4 py-3 text-center tabular-nums ${
                      row.goal_difference > 0 ? 'text-emerald-400'
                        : row.goal_difference < 0 ? 'text-red-400'
                        : 'text-[#9095b8]'
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
                <tr className="border-b border-white/8">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#9095b8]">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#9095b8]">Turno</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#9095b8]">Stato</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#9095b8]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {rounds.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.04]">
                    <td className="px-4 py-2.5 w-12 text-[#9095b8] tabular-nums">{r.round_number}</td>
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
