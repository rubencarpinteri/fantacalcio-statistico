import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge, MatchdayStatusBadge } from '@/components/ui/badge'
import type { Competition, CompetitionMatchup, FantasyTeam } from '@/types/database.types'
import { GenerateMatchdaysForm } from './GenerateMatchdaysForm'

const TYPE_LABEL: Record<string, string> = {
  campionato: 'Campionato', battle_royale: 'Battle Royale', coppa: 'Coppa',
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

interface StandingRow {
  team_id: string
  team_name: string
  played: number
  wins: number
  draws: number
  losses: number
  gf: number
  gs: number
  diff: number
  pts: number
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('competitions').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Competizione' }
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const isAdmin = ctx.role === 'league_admin'
  const { id } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('*')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) notFound()
  const competition = comp as Competition

  // Fetch all fantasy teams in the league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)

  const allTeams = (teams ?? []) as Pick<FantasyTeam, 'id' | 'name'>[]
  const teamNameMap = new Map(allTeams.map((t) => [t.id, t.name]))

  // Fetch all matchups for this competition
  const { data: matchupsRaw } = await supabase
    .from('competition_matchups')
    .select('*')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const matchups = (matchupsRaw ?? []) as CompetitionMatchup[]

  // Fetch all competition_rounds to get matchday_id and name per round
  const { data: roundsRaw } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id, status')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const rounds = roundsRaw ?? []

  // Fetch matchday statuses for rounds that have a matchday_id
  const matchdayIds = rounds
    .map((r) => r.matchday_id)
    .filter((mid): mid is string => mid !== null)

  const matchdayStatusMap = new Map<string, string>()
  if (matchdayIds.length > 0) {
    const { data: matchdays } = await supabase
      .from('matchdays')
      .select('id, status')
      .in('id', matchdayIds)
    for (const md of matchdays ?? []) {
      matchdayStatusMap.set(md.id, md.status)
    }
  }

  // Build round info map: round_number -> { name, matchday_id, status }
  const roundInfoMap = new Map(
    rounds.map((r) => [
      r.round_number,
      { name: r.name as string, matchday_id: r.matchday_id as string | null, status: r.status as string },
    ])
  )

  // ---- Compute standings from matchups with results ----
  const standingMap = new Map<string, StandingRow>()
  for (const team of allTeams) {
    standingMap.set(team.id, {
      team_id: team.id,
      team_name: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      gs: 0,
      diff: 0,
      pts: 0,
    })
  }

  for (const m of matchups) {
    if (m.result === null || m.home_fantavoto === null || m.away_fantavoto === null) continue

    const home = standingMap.get(m.home_team_id)
    const away = standingMap.get(m.away_team_id)

    const homeFv = Number(m.home_fantavoto)
    const awayFv = Number(m.away_fantavoto)

    if (home) {
      home.played++
      home.gf += homeFv
      home.gs += awayFv
    }
    if (away) {
      away.played++
      away.gf += awayFv
      away.gs += homeFv
    }

    if (m.result === '1') {
      if (home) { home.wins++; home.pts += 3 }
      if (away) away.losses++
    } else if (m.result === 'X') {
      if (home) { home.draws++; home.pts += 1 }
      if (away) { away.draws++; away.pts += 1 }
    } else if (m.result === '2') {
      if (home) home.losses++
      if (away) { away.wins++; away.pts += 3 }
    }
  }

  // Compute diff and sort
  const standings: StandingRow[] = Array.from(standingMap.values()).map((r) => ({
    ...r,
    diff: Math.round((r.gf - r.gs) * 100) / 100,
  }))
  standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return b.diff - a.diff
  })

  // Get current user's team
  const { data: myTeamRow } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .maybeSingle()
  const myTeamId = myTeamRow?.id ?? null

  // Group matchups by round_number
  const matchupsByRound = new Map<number, CompetitionMatchup[]>()
  for (const m of matchups) {
    if (!matchupsByRound.has(m.round_number)) matchupsByRound.set(m.round_number, [])
    matchupsByRound.get(m.round_number)!.push(m)
  }

  const roundNumbers = Array.from(
    new Set([...rounds.map((r) => r.round_number), ...matchupsByRound.keys()])
  ).sort((a, b) => a - b)

  // Determine "current" round: last round with result, or first pending
  const lastComputedRound = Math.max(
    0,
    ...matchups
      .filter((m) => m.result !== null)
      .map((m) => m.round_number)
  )
  const currentRound = lastComputedRound > 0 ? lastComputedRound : (roundNumbers[0] ?? 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/competitions" className="text-sm text-[#55556a] hover:text-indigo-400">
            ← Competizioni
          </a>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{competition.name}</h1>
            {competition.season && (
              <Badge variant="muted">{competition.season}</Badge>
            )}
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[competition.status] ?? ''}`}
            >
              {STATUS_LABEL[competition.status] ?? competition.status}
            </span>
          </div>
          <p className="text-sm text-[#8888aa]">
            {TYPE_LABEL[competition.type] ?? competition.type}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/competitions/${id}/rounds`}
              className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-white transition-colors"
            >
              Gestisci turni →
            </a>
            {competition.type === 'campionato' && competition.status === 'active' && (
              <GenerateMatchdaysForm
                competitionId={id}
                linkedCount={rounds.filter((r) => r.matchday_id !== null).length}
                totalRounds={rounds.length}
              />
            )}
          </div>
        )}
      </div>

      {/* Anchor tabs */}
      <div className="flex gap-4 border-b border-[#2e2e42]">
        <a
          href="#classifica"
          className="pb-2 text-sm font-medium text-indigo-300 border-b-2 border-indigo-400"
        >
          Classifica
        </a>
        <a
          href="#calendario"
          className="pb-2 text-sm font-medium text-[#8888aa] hover:text-white border-b-2 border-transparent"
        >
          Calendario
        </a>
      </div>

      {/* CLASSIFICA */}
      <div id="classifica">
        <Card>
          <CardHeader title="Classifica" />
          <CardContent className="p-0">
            {standings.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-[#55556a]">
                Nessuna squadra iscritta alla competizione.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2e2e42]">
                      {['Pos', 'Squadra', 'G', 'V', 'N', 'P', 'Gf', 'Gs', 'Diff', 'Pts'].map((h) => (
                        <th
                          key={h}
                          className={[
                            'px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#55556a]',
                            h === 'Squadra' ? 'text-left' : 'text-center',
                          ].join(' ')}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e2e]">
                    {standings.map((row, idx) => {
                      const isMyTeam = row.team_id === myTeamId
                      return (
                        <tr
                          key={row.team_id}
                          className={[
                            'transition-colors hover:bg-[#1a1a24]',
                            isMyTeam ? 'bg-indigo-500/5' : '',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2.5 text-center text-[#55556a]">{idx + 1}</td>
                          <td className="px-3 py-2.5">
                            <span
                              className={[
                                'font-medium',
                                isMyTeam ? 'text-indigo-300' : 'text-white',
                              ].join(' ')}
                            >
                              {row.team_name}
                              {isMyTeam && (
                                <span className="ml-1.5 text-xs text-indigo-400">(tu)</span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[#8888aa]">{row.played}</td>
                          <td className="px-3 py-2.5 text-center text-emerald-400">{row.wins}</td>
                          <td className="px-3 py-2.5 text-center text-[#8888aa]">{row.draws}</td>
                          <td className="px-3 py-2.5 text-center text-red-400">{row.losses}</td>
                          <td className="px-3 py-2.5 text-center text-[#8888aa]">{row.gf.toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-center text-[#8888aa]">{row.gs.toFixed(2)}</td>
                          <td
                            className={[
                              'px-3 py-2.5 text-center',
                              row.diff > 0 ? 'text-emerald-400' : row.diff < 0 ? 'text-red-400' : 'text-[#8888aa]',
                            ].join(' ')}
                          >
                            {row.diff > 0 ? '+' : ''}{row.diff.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-white">{row.pts}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CALENDARIO */}
      <div id="calendario" className="space-y-4">
        <h2 className="text-base font-semibold text-white">Calendario</h2>

        {roundNumbers.length === 0 ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-[#55556a]">
                Nessun turno generato per questa competizione.
              </p>
            </CardContent>
          </Card>
        ) : (
          roundNumbers.map((roundNum) => {
            const roundMatchups = matchupsByRound.get(roundNum) ?? []
            const roundInfo = roundInfoMap.get(roundNum)
            const roundName = roundInfo?.name ?? `Giornata ${roundNum}`
            const matchdayId = roundInfo?.matchday_id ?? null
            const matchdayStatus = matchdayId ? matchdayStatusMap.get(matchdayId) : null
            const isCurrentRound = roundNum === currentRound

            const hasAnyResult = roundMatchups.some((m) => m.result !== null)
            const isCompleted = roundMatchups.length > 0 && roundMatchups.every((m) => m.result !== null)

            return (
              <div
                key={roundNum}
                className={[
                  'rounded-xl border transition-colors',
                  isCurrentRound
                    ? 'border-indigo-500/40 bg-[#0f0f1a]'
                    : isCompleted
                    ? 'border-[#1e1e2e] bg-[#0a0a0f] opacity-70'
                    : 'border-[#2e2e42] bg-[#0f0f1a]',
                ].join(' ')}
              >
                {/* Round header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'text-sm font-semibold',
                        isCurrentRound ? 'text-indigo-300' : 'text-white',
                      ].join(' ')}
                    >
                      {roundName}
                    </span>
                    {isCurrentRound && !isCompleted && (
                      <Badge variant="accent">In corso</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {matchdayStatus && (
                      <MatchdayStatusBadge status={matchdayStatus} />
                    )}
                    {hasAnyResult && !isCompleted && (
                      <Badge variant="warning">Parziale</Badge>
                    )}
                    {isCompleted && (
                      <Badge variant="success">Completata</Badge>
                    )}
                  </div>
                </div>

                {/* Matchups */}
                <div className="divide-y divide-[#1e1e2e]">
                  {roundMatchups.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-[#55556a]">Nessun incontro per questo turno.</p>
                  ) : (
                    roundMatchups.map((m) => {
                      const homeName = teamNameMap.get(m.home_team_id) ?? '—'
                      const awayName = teamNameMap.get(m.away_team_id) ?? '—'
                      const homeFv = m.home_fantavoto !== null ? Number(m.home_fantavoto).toFixed(2) : null
                      const awayFv = m.away_fantavoto !== null ? Number(m.away_fantavoto).toFixed(2) : null
                      const played = m.result !== null

                      const isHomeMyTeam = m.home_team_id === myTeamId
                      const isAwayMyTeam = m.away_team_id === myTeamId

                      return (
                        <div key={m.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                          {/* Home team */}
                          <span
                            className={[
                              'flex-1 text-right truncate',
                              isHomeMyTeam ? 'font-semibold text-indigo-300' : played ? 'text-white' : 'text-[#8888aa]',
                            ].join(' ')}
                          >
                            {homeName}
                          </span>

                          {/* Score / dash */}
                          <div className="flex items-center gap-1.5 shrink-0 min-w-[120px] justify-center">
                            {played ? (
                              <>
                                <span className="font-mono font-semibold text-white tabular-nums">{homeFv}</span>
                                <ResultBadge result={m.result} />
                                <span className="font-mono font-semibold text-white tabular-nums">{awayFv}</span>
                              </>
                            ) : (
                              <span className="text-[#55556a]">—</span>
                            )}
                          </div>

                          {/* Away team */}
                          <span
                            className={[
                              'flex-1 text-left truncate',
                              isAwayMyTeam ? 'font-semibold text-indigo-300' : played ? 'text-white' : 'text-[#8888aa]',
                            ].join(' ')}
                          >
                            {awayName}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function ResultBadge({ result }: { result: '1' | 'X' | '2' | null }) {
  if (!result) return null
  const color =
    result === '1'
      ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      : result === 'X'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-bold ${color}`}>
      {result}
    </span>
  )
}
