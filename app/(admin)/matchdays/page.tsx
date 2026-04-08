import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { QuickFetchAndCalculateButton } from '@/components/ui/QuickFetchAndCalculateButton'
import { CloseMatchdayButton } from './CloseMatchdayButton'

export const metadata = { title: 'Giornate' }

const STATUS_PRIORITY: Record<string, number> = {
  open: 0, closed: 1, draft: 2, archived: 3,
  locked: 1, scoring: 1, published: 1,
}

export default async function MatchdaysPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: allMatchdays } = await supabase
    .from('matchdays')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('matchday_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const matchdays = allMatchdays ?? []
  const matchdayIds = matchdays.map((m) => m.id)

  // ── Which matchdays have published scores? ─────────────────────────────────
  const scoredIds = new Set<string>()
  if (matchdayIds.length > 0) {
    const { data: scoredRows } = await supabase
      .from('published_team_scores')
      .select('matchday_id')
      .in('matchday_id', matchdayIds)
    for (const r of scoredRows ?? []) scoredIds.add(r.matchday_id)
  }

  // Ultima = highest matchday_number with real published scores
  const prevMatchday = [...matchdays].reverse().find((m) => scoredIds.has(m.id)) ?? null

  // Prossima = first after prevMatchday with no scores and not frozen
  const prevNum = prevMatchday?.matchday_number ?? -Infinity
  const nextMatchday =
    matchdays.find(
      (m) =>
        (m.matchday_number ?? 0) > prevNum &&
        !scoredIds.has(m.id) &&
        !m.is_frozen
    ) ?? null

  // ── Teams & competitions ───────────────────────────────────────────────────
  const [teamsResult, compsResult] = await Promise.all([
    supabase.from('fantasy_teams').select('id, name').eq('league_id', ctx.league.id),
    supabase.from('competitions').select('id').eq('league_id', ctx.league.id),
  ])
  const teamNameMap = new Map((teamsResult.data ?? []).map((t) => [t.id, t.name]))
  const compIds = (compsResult.data ?? []).map((c) => c.id)

  async function getMatchupPairs(roundNumber: number) {
    if (compIds.length === 0) return []
    const { data: raw } = await supabase
      .from('competition_matchups')
      .select('home_team_id, away_team_id')
      .in('competition_id', compIds)
      .eq('round_number', roundNumber)
    const seen = new Set<string>()
    const pairs: Array<{ homeTeamId: string; awayTeamId: string }> = []
    for (const m of raw ?? []) {
      const key = [m.home_team_id, m.away_team_id].sort().join('|')
      if (!seen.has(key)) { seen.add(key); pairs.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id }) }
    }
    return pairs
  }

  // ── Prev matchday matchups ─────────────────────────────────────────────────
  type ResultRow = { homeTeamName: string; awayTeamName: string; homeScore: number | null; awayScore: number | null }
  let prevMatchups: ResultRow[] = []
  if (prevMatchday?.round_number != null) {
    const [pairs, scoresResult] = await Promise.all([
      getMatchupPairs(prevMatchday.round_number),
      supabase.from('published_team_scores').select('team_id, total_fantavoto').eq('matchday_id', prevMatchday.id),
    ])
    const scoreMap = new Map((scoresResult.data ?? []).map((s) => [s.team_id, Number(s.total_fantavoto)]))
    prevMatchups = pairs.map((p) => ({
      homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
      awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
      homeScore: scoreMap.get(p.homeTeamId) ?? null,
      awayScore: scoreMap.get(p.awayTeamId) ?? null,
    }))
  }

  // ── Next matchday fixtures ─────────────────────────────────────────────────
  type FixtureRow = { homeTeamName: string; awayTeamName: string }
  let nextMatchups: FixtureRow[] = []
  if (nextMatchday?.round_number != null) {
    const pairs = await getMatchupPairs(nextMatchday.round_number)
    nextMatchups = pairs.map((p) => ({
      homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
      awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
    }))
  }

  // ── Provisional stat counts (admin only) ───────────────────────────────────
  const provisionalByMatchday = new Map<string, number>()
  if (isAdmin && matchdays.length > 0) {
    const { data: provRows } = await supabase
      .from('player_match_stats')
      .select('matchday_id')
      .eq('is_provisional', true)
      .in('matchday_id', matchdayIds)
    for (const row of provRows ?? []) {
      provisionalByMatchday.set(row.matchday_id, (provisionalByMatchday.get(row.matchday_id) ?? 0) + 1)
    }
  }

  // "Current" matchday for admin quick links (highest priority open/closed)
  const current = [...matchdays].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9
    const pb = STATUS_PRIORITY[b.status] ?? 9
    if (pa !== pb) return pa - pb
    return (b.matchday_number ?? 0) - (a.matchday_number ?? 0)
  })[0] ?? null

  const openMatchdays = matchdays.filter((m) => m.status === 'open')
  const multipleOpen = openMatchdays.length > 1

  const fmt = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(dt))
      : '—'

  return (
    <div className="space-y-4">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Giornate</h1>
        <a href="/campionato" className="text-xs text-indigo-400 hover:text-indigo-300">
          Classifica →
        </a>
      </div>

      {/* ── Multiple open matchdays warning ─────────────────────────────────── */}
      {multipleOpen && isAdmin && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 text-base shrink-0 mt-0.5">⚠️</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-300">
              {openMatchdays.length} giornate aperte simultaneamente
            </p>
            <p className="mt-0.5 text-xs text-red-400/80">
              Solo una giornata alla volta dovrebbe essere in stato{' '}
              <span className="font-mono">open</span>.{' '}
              Aperte ora:{' '}
              {openMatchdays.map((m, i) => (
                <span key={m.id}>
                  <a href={`/matchdays/${m.id}`} className="underline hover:text-red-300 transition-colors">
                    {m.name}
                  </a>
                  {i < openMatchdays.length - 1 ? ', ' : ''}
                </span>
              ))}
              . Chiudi le giornate non attive dalla loro pagina di gestione.
            </p>
          </div>
        </div>
      )}

      {/* ── Ultima + Prossima grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Ultima Giornata */}
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#2e2e42]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">
              Ultima Giornata
            </p>
            <p className="text-sm font-semibold text-white leading-tight">
              {prevMatchday?.name ?? '—'}
            </p>
          </div>

          {prevMatchups.length > 0 ? (
            <div className="divide-y divide-[#1e1e2e]">
              {prevMatchups.map((m, i) => {
                const homeWins = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore
                const awayWins = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore
                return (
                  <a
                    key={i}
                    href={prevMatchday ? `/matchdays/${prevMatchday.id}/all-lineups` : '#'}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a26] transition-colors"
                  >
                    <div className="flex-1 min-w-0 overflow-hidden text-right">
                      <span className={`block truncate text-sm font-semibold ${homeWins ? 'text-white' : awayWins ? 'text-[#3a3a52]' : 'text-[#c0c0d8]'}`}>
                        {m.homeTeamName}
                      </span>
                    </div>
                    <div className="shrink-0 w-28 flex items-center justify-center gap-1.5 tabular-nums">
                      <span className={`text-base font-bold ${homeWins ? 'text-white' : 'text-[#55556a]'}`}>
                        {m.homeScore !== null ? m.homeScore.toFixed(1) : '—'}
                      </span>
                      <span className="text-[#3a3a52] text-sm font-normal">–</span>
                      <span className={`text-base font-bold ${awayWins ? 'text-white' : 'text-[#55556a]'}`}>
                        {m.awayScore !== null ? m.awayScore.toFixed(1) : '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <span className={`block truncate text-sm font-semibold ${awayWins ? 'text-white' : homeWins ? 'text-[#3a3a52]' : 'text-[#c0c0d8]'}`}>
                        {m.awayTeamName}
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-[#55556a]">
              {prevMatchday ? 'Nessun incontro configurato.' : 'Nessuna giornata conclusa.'}
            </p>
          )}

          {prevMatchday && (
            <div className="border-t border-[#1e1e2e] px-4 py-2">
              <a href={`/matchdays/${prevMatchday.id}/results`} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                Dettaglio giornata →
              </a>
            </div>
          )}
        </div>

        {/* Prossima Giornata */}
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#2e2e42]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">
              Prossima Giornata
            </p>
            <p className="text-sm font-semibold text-white leading-tight">
              {nextMatchday?.name ?? '—'}
            </p>
            {nextMatchday?.locks_at && (
              <p className="text-[10px] text-[#55556a] mt-0.5">Scadenza: {fmt(nextMatchday.locks_at)}</p>
            )}
          </div>

          {nextMatchups.length > 0 ? (
            <div className="divide-y divide-[#1e1e2e]">
              {nextMatchups.map((m, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 overflow-hidden text-right">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">{m.homeTeamName}</span>
                  </div>
                  <div className="shrink-0 w-28 flex items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#3a3a52]">vs</span>
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">{m.awayTeamName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-[#55556a]">
              {nextMatchday ? 'Nessun incontro configurato.' : 'Nessuna prossima giornata.'}
            </p>
          )}

          {nextMatchday && isAdmin && (
            <div className="border-t border-[#1e1e2e] px-4 py-2 flex items-center justify-between">
              <a href={`/matchdays/${nextMatchday.id}`} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                Gestione →
              </a>
              {(nextMatchday.status === 'open' || nextMatchday.status === 'closed') && (
                <CloseMatchdayButton
                  matchdayId={nextMatchday.id}
                  currentStatus={nextMatchday.status as 'open' | 'closed'}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── All matchdays list ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        {matchdays.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-[#55556a]">
            Nessuna giornata configurata.
          </p>
        ) : (
          <div className="divide-y divide-[#1e1e2e]">
            {matchdays.map((m) => {
              const isCurrent = m.id === current?.id
              const isOpen = m.status === 'open'
              const isOpenOrClosed = m.status === 'open' || m.status === 'closed'
              const isEditable = ['open', 'closed'].includes(m.status)
              const provCount = provisionalByMatchday.get(m.id) ?? 0
              return (
                <div key={m.id} className={`px-4 py-2.5 ${isCurrent ? 'bg-indigo-500/5' : ''}`}>
                  <div className="flex items-center gap-2">
                    {m.matchday_number !== null && (
                      <span className="w-5 shrink-0 text-right text-[10px] text-[#3a3a52] tabular-nums">
                        {m.matchday_number}
                      </span>
                    )}
                    <a
                      href={`/matchdays/${m.id}`}
                      className={`flex-1 truncate text-xs font-medium hover:text-indigo-400 transition-colors ${
                        isCurrent ? 'text-indigo-200' : 'text-[#c0c0d8]'
                      }`}
                    >
                      {m.name}
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MatchdayStatusBadge status={m.status} />
                      {m.is_frozen && <span className="text-xs" title="Congelata">🧊</span>}
                      {isAdmin && provCount > 0 && (
                        <span className="text-[10px] text-amber-400">~{provCount}</span>
                      )}
                      {/* Status action buttons — open or closed matchdays */}
                      {isAdmin && isOpenOrClosed && (
                        <CloseMatchdayButton
                          matchdayId={m.id}
                          currentStatus={m.status as 'open' | 'closed'}
                        />
                      )}
                    </div>
                  </div>

                  {m.locks_at && (
                    <p className="mt-0.5 pl-7 text-[10px] text-[#3a3a52]">{fmt(m.locks_at)}</p>
                  )}

                  {/* Admin quick links — only for the current matchday */}
                  {isAdmin && isCurrent && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
                      {isEditable && (
                        <a
                          href={`/matchdays/${m.id}/import-lineups`}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                        >
                          Formazioni
                        </a>
                      )}
                      <QuickFetchAndCalculateButton matchdayId={m.id} compact />
                      <a
                        href={`/matchdays/${m.id}`}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-[#1a1a2e] text-[#8888aa] hover:text-white transition-colors"
                      >
                        Gestione →
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
