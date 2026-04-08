import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge, MatchdayStatusBadge } from '@/components/ui/badge'
import type { Competition, CompetitionMatchup, FantasyTeam } from '@/types/database.types'
import { GenerateMatchdaysForm } from './GenerateMatchdaysForm'
import { CalendarioClient } from './CalendarioClient'
import type { RoundData, MatchupData } from './CalendarioClient'
import { QuickFetchAndCalculateButton } from '@/components/ui/QuickFetchAndCalculateButton'

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

// Matchday status priority for "most active"
const MD_PRIORITY: Record<string, number> = {
  open: 0, locked: 1, scoring: 2, published: 3, draft: 4, archived: 5,
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

  // All fantasy teams
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)

  const allTeams = (teams ?? []) as Pick<FantasyTeam, 'id' | 'name'>[]
  const teamNameMap = new Map(allTeams.map((t) => [t.id, t.name]))

  // All matchups for this competition
  const { data: matchupsRaw } = await supabase
    .from('competition_matchups')
    .select('*')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const matchups = (matchupsRaw ?? []) as CompetitionMatchup[]

  // All competition rounds
  const { data: roundsRaw } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id, status')
    .eq('competition_id', id)
    .order('round_number', { ascending: true })

  const rounds = roundsRaw ?? []

  // Matchday statuses + round_number info for rounds with linked matchdays
  const matchdayIds = rounds
    .map((r) => r.matchday_id)
    .filter((mid): mid is string => mid !== null)

  const matchdayStatusMap = new Map<string, string>()
  const matchdayRoundNumberMap = new Map<string, number>()  // matchday_id → round_number
  if (matchdayIds.length > 0) {
    const { data: matchdaysData } = await supabase
      .from('matchdays')
      .select('id, status, round_number')
      .in('id', matchdayIds)
    for (const md of matchdaysData ?? []) {
      matchdayStatusMap.set(md.id, md.status)
    }
    for (const r of rounds) {
      if (r.matchday_id) matchdayRoundNumberMap.set(r.matchday_id, r.round_number as number)
    }
  }

  // Build round info map: round_number → { name, matchday_id, status }
  const roundInfoMap = new Map(
    rounds.map((r) => [
      r.round_number as number,
      {
        name: r.name as string,
        matchday_id: r.matchday_id as string | null,
        status: r.status as string,
      },
    ])
  )

  // ── Standings from published matchups ───────────────────────────────────────
  const standingMap = new Map<string, StandingRow>()
  for (const team of allTeams) {
    standingMap.set(team.id, {
      team_id: team.id, team_name: team.name,
      played: 0, wins: 0, draws: 0, losses: 0, gf: 0, gs: 0, diff: 0, pts: 0,
    })
  }
  for (const m of matchups) {
    if (m.result === null || m.home_fantavoto === null || m.away_fantavoto === null) continue
    const home = standingMap.get(m.home_team_id)
    const away = standingMap.get(m.away_team_id)
    const homeFv = Number(m.home_fantavoto)
    const awayFv = Number(m.away_fantavoto)
    if (home) { home.played++; home.gf += homeFv; home.gs += awayFv }
    if (away) { away.played++; away.gf += awayFv; away.gs += homeFv }
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
  const standings: StandingRow[] = Array.from(standingMap.values())
    .map((r) => ({ ...r, diff: Math.round((r.gf - r.gs) * 100) / 100 }))
    .sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : b.diff - a.diff)

  // My team
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
    new Set([...rounds.map((r) => r.round_number as number), ...matchupsByRound.keys()])
  ).sort((a, b) => a - b)

  // ── Determine "current" round ────────────────────────────────────────────────
  // Priority: round linked to most-active matchday > last computed round > last published > first round
  let currentRound: number = roundNumbers[0] ?? 1

  // Find round linked to the most active matchday
  const activeMatchdayRound = [...rounds]
    .filter((r) => r.matchday_id && matchdayStatusMap.has(r.matchday_id as string))
    .sort((a, b) => {
      const sa = MD_PRIORITY[matchdayStatusMap.get(a.matchday_id as string) ?? ''] ?? 9
      const sb = MD_PRIORITY[matchdayStatusMap.get(b.matchday_id as string) ?? ''] ?? 9
      if (sa !== sb) return sa - sb
      return (b.round_number as number) - (a.round_number as number)
    })[0]

  if (activeMatchdayRound) {
    currentRound = activeMatchdayRound.round_number as number
  } else {
    // Fallback: last round with a computed result
    const lastComputedRound = Math.max(
      0, ...matchups.filter((m) => m.result !== null).map((m) => m.round_number)
    )
    if (lastComputedRound > 0) {
      currentRound = lastComputedRound
    }
  }

  // ── Fetch partial scores for the current round's matchday ────────────────────
  const currentRoundInfo = roundInfoMap.get(currentRound)
  const currentMatchdayId = currentRoundInfo?.matchday_id ?? null

  const partialTeamScores = new Map<string, number>()
  let hasPartialData = false
  let isDraftScore = false

  if (currentMatchdayId) {
    const { data: currentPtr } = await supabase
      .from('matchday_current_calculation')
      .select('run_id')
      .eq('matchday_id', currentMatchdayId)
      .maybeSingle()

    let runId = currentPtr?.run_id ?? null
    if (!runId) {
      const { data: latestRun } = await supabase
        .from('calculation_runs')
        .select('id')
        .eq('matchday_id', currentMatchdayId)
        .order('run_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      runId = latestRun?.id ?? null
      isDraftScore = !!runId
    }

    if (runId) {
      hasPartialData = true
      const { data: calcs } = await supabase
        .from('player_calculations')
        .select('player_id, fantavoto')
        .eq('run_id', runId)
      const calcMap = new Map(
        (calcs ?? [])
          .filter((c) => c.fantavoto !== null)
          .map((c) => [c.player_id, c.fantavoto as number])
      )

      // Which teams are in the current round?
      const currentMatchups = matchupsByRound.get(currentRound) ?? []
      const activeTeamIds = [...new Set(currentMatchups.flatMap((m) => [m.home_team_id, m.away_team_id]))]

      const { data: pointers } = await supabase
        .from('lineup_current_pointers')
        .select('team_id, submission_id')
        .eq('matchday_id', currentMatchdayId)
        .in('team_id', activeTeamIds)

      const submissionIds = (pointers ?? []).map((p) => p.submission_id)
      if (submissionIds.length > 0) {
        const { data: subPlayers } = await supabase
          .from('lineup_submission_players')
          .select('submission_id, player_id')
          .in('submission_id', submissionIds)
          .eq('is_bench', false)

        const subTeamMap = new Map((pointers ?? []).map((p) => [p.submission_id, p.team_id]))
        for (const sp of subPlayers ?? []) {
          const teamId = subTeamMap.get(sp.submission_id)
          if (!teamId) continue
          const fv = calcMap.get(sp.player_id)
          if (fv !== undefined) {
            partialTeamScores.set(teamId, (partialTeamScores.get(teamId) ?? 0) + fv)
          }
        }
      }
    }
  }

  // ── Build RoundData array for CalendarioClient ───────────────────────────────
  const roundDataList: RoundData[] = roundNumbers.map((roundNum) => {
    const rMatchups = matchupsByRound.get(roundNum) ?? []
    const rInfo = roundInfoMap.get(roundNum)
    const rMatchdayId = rInfo?.matchday_id ?? null
    const rMatchdayStatus = rMatchdayId ? (matchdayStatusMap.get(rMatchdayId) ?? null) : null
    const isCurrentRound = roundNum === currentRound

    const matchupDataList: MatchupData[] = rMatchups.map((m) => ({
      id: m.id,
      homeTeamId: m.home_team_id,
      homeTeamName: teamNameMap.get(m.home_team_id) ?? '—',
      awayTeamId: m.away_team_id,
      awayTeamName: teamNameMap.get(m.away_team_id) ?? '—',
      result: m.result as '1' | 'X' | '2' | null,
      publishedHomeScore: m.home_fantavoto !== null ? Number(m.home_fantavoto) : null,
      publishedAwayScore: m.away_fantavoto !== null ? Number(m.away_fantavoto) : null,
      partialHomeScore: isCurrentRound && hasPartialData
        ? (partialTeamScores.has(m.home_team_id) ? +(partialTeamScores.get(m.home_team_id)!.toFixed(1)) : null)
        : null,
      partialAwayScore: isCurrentRound && hasPartialData
        ? (partialTeamScores.has(m.away_team_id) ? +(partialTeamScores.get(m.away_team_id)!.toFixed(1)) : null)
        : null,
      isDraftScore,
      matchdayId: rMatchdayId,
    }))

    return {
      roundNumber: roundNum,
      roundName: rInfo?.name ?? `Giornata ${roundNum}`,
      matchdayId: rMatchdayId,
      matchdayStatus: rMatchdayStatus,
      isCurrentRound,
      matchups: matchupDataList,
    }
  })

  // Current round data for the hero section at top
  const currentRoundData = roundDataList.find((r) => r.isCurrentRound) ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/competitions" className="text-sm text-[#55556a] hover:text-indigo-400">
            ← Competizioni
          </a>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">{competition.name}</h1>
            {competition.season && <Badge variant="muted">{competition.season}</Badge>}
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[competition.status] ?? ''}`}>
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

      {/* ── Giornata corrente — hero matchup block ──────────────────────────── */}
      {currentRoundData && currentRoundData.matchups.length > 0 && (
        <div className="rounded-xl border border-indigo-500/30 bg-[#0d0d1a] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e42]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
                Giornata corrente
              </span>
              <span className="font-semibold text-white">{currentRoundData.roundName}</span>
              {currentRoundData.matchdayStatus && (
                <MatchdayStatusBadge status={currentRoundData.matchdayStatus} />
              )}
            </div>
            {currentRoundData.matchdayId && (
              <div className="flex items-center gap-2 shrink-0">
                <QuickFetchAndCalculateButton matchdayId={currentRoundData.matchdayId} compact />
                <a
                  href={`/matchdays/${currentRoundData.matchdayId}/all-lineups`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Tutte le formazioni →
                </a>
              </div>
            )}
          </div>

          {/* Matchup rows */}
          <div className="divide-y divide-[#1e1e2e]">
            {currentRoundData.matchups.map((m) => {
              const isHomeMyTeam = m.homeTeamId === myTeamId
              const isAwayMyTeam = m.awayTeamId === myTeamId
              const hasPublished = m.result !== null
              const hasPartial = !hasPublished && (m.partialHomeScore !== null || m.partialAwayScore !== null)

              const homeScore = hasPublished ? m.publishedHomeScore : hasPartial ? m.partialHomeScore : null
              const awayScore = hasPublished ? m.publishedAwayScore : hasPartial ? m.partialAwayScore : null
              const homeWins = homeScore !== null && awayScore !== null && homeScore > awayScore
              const awayWins = homeScore !== null && awayScore !== null && awayScore > homeScore

              const href = m.matchdayId
                ? `/matchdays/${m.matchdayId}/all-lineups`
                : `/competitions/${id}/match/${m.id}`

              return (
                <a
                  key={m.id}
                  href={href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#131320] transition-colors"
                >
                  {/* Home */}
                  <div className={`flex-1 min-w-0 overflow-hidden text-right ${isHomeMyTeam ? 'pr-0' : ''}`}>
                    <span className={`block truncate text-sm font-semibold ${
                      homeWins ? 'text-white'
                        : awayWins ? 'text-[#3a3a52]'
                        : isHomeMyTeam ? 'text-indigo-200'
                        : 'text-[#c0c0d8]'
                    }`}>
                      {m.homeTeamName}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="shrink-0 w-44 flex items-center justify-center gap-2 tabular-nums">
                    <span className={`text-base font-bold ${
                      homeWins ? 'text-white' : 'text-[#55556a]'
                    }`}>
                      {homeScore !== null ? homeScore.toFixed(1) : hasPartialData ? '0.0' : '—'}
                    </span>
                    {hasPublished && m.result ? (
                      <HeroResultBadge result={m.result as '1' | 'X' | '2'} />
                    ) : (
                      <span className="text-[#3a3a52] text-sm font-normal">–</span>
                    )}
                    <span className={`text-base font-bold ${
                      awayWins ? 'text-white' : 'text-[#55556a]'
                    }`}>
                      {awayScore !== null ? awayScore.toFixed(1) : hasPartialData ? '0.0' : '—'}
                    </span>
                    {hasPartial && m.isDraftScore && (
                      <span className="text-[9px] text-amber-500/50">~</span>
                    )}
                  </div>

                  {/* Away */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className={`block truncate text-sm font-semibold ${
                      awayWins ? 'text-white'
                        : homeWins ? 'text-[#3a3a52]'
                        : isAwayMyTeam ? 'text-indigo-200'
                        : 'text-[#c0c0d8]'
                    }`}>
                      {m.awayTeamName}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>

          {/* Draft footnote */}
          {isDraftScore && hasPartialData && currentRoundData.matchups.some((m) => m.result === null) && (
            <div className="border-t border-[#1e1e2e] px-4 py-2">
              <p className="text-[11px] text-amber-500/60">
                ~ punteggi parziali (calcolo non ancora pubblicato)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Classifica — WIP ────────────────────────────────────────────────── */}
      <div id="classifica" className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2e2e42]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">Classifica</p>
          <p className="text-sm font-semibold text-white leading-tight mt-0.5">{comp.name}</p>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-medium text-[#55556a]">Work in progress</p>
          <p className="mt-1 text-[11px] text-[#3a3a52]">La classifica sarà disponibile prossimamente.</p>
        </div>
      </div>

      {/* ── Calendario — client-side dropdown ───────────────────────────────── */}
      <div id="calendario">
        <h2 className="mb-3 text-base font-semibold text-white">Calendario</h2>
        {roundDataList.length === 0 ? (
          <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] px-6 py-12 text-center text-sm text-[#55556a]">
            Nessun turno generato per questa competizione.
          </div>
        ) : (
          <CalendarioClient
            rounds={roundDataList}
            defaultRound={currentRound}
            myTeamId={myTeamId}
            competitionId={id}
          />
        )}
      </div>
    </div>
  )
}

function HeroResultBadge({ result }: { result: '1' | 'X' | '2' }) {
  const color =
    result === '1' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      : result === 'X' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-bold ${color}`}>
      {result}
    </span>
  )
}
