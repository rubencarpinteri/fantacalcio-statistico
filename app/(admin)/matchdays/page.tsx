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
    supabase.from('competitions').select('id, type').eq('league_id', ctx.league.id),
  ])
  const teamNameMap = new Map((teamsResult.data ?? []).map((t) => [t.id, t.name]))
  const compIds = (compsResult.data ?? []).map((c) => c.id)
  const campionatoCompIds = new Set(
    (compsResult.data ?? []).filter((c) => c.type === 'campionato').map((c) => c.id)
  )

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
  type ResultRow = {
    homeTeamName: string
    awayTeamName: string
    homeFantavoto: number | null
    awayFantavoto: number | null
    homeGoals: number | null
    awayGoals: number | null
  }
  let prevMatchups: ResultRow[] = []
  if (prevMatchday?.round_number != null) {
    const [pairs, scoresResult, campionatoFixturesResult] = await Promise.all([
      getMatchupPairs(prevMatchday.round_number),
      supabase.from('published_team_scores').select('team_id, total_fantavoto').eq('matchday_id', prevMatchday.id),
      campionatoCompIds.size > 0
        ? supabase
            .from('competition_fixtures')
            .select('home_team_id, away_team_id, home_score, away_score, competition_rounds!inner(matchday_id)')
            .in('competition_id', Array.from(campionatoCompIds))
            .eq('competition_rounds.matchday_id', prevMatchday.id)
        : Promise.resolve({ data: [] as Array<{ home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }> }),
    ])
    const scoreMap = new Map((scoresResult.data ?? []).map((s) => [s.team_id, Number(s.total_fantavoto)]))
    // Key by team-id pair (unordered) so we tolerate home/away orientation
    // differences between competition_matchups and competition_fixtures.
    const goalMap = new Map<string, { goalsByTeamId: Map<string, number> }>()
    for (const f of campionatoFixturesResult.data ?? []) {
      if (f.home_score == null || f.away_score == null) continue
      const key = [f.home_team_id, f.away_team_id].sort().join('|')
      const byTeam = new Map<string, number>([
        [f.home_team_id, f.home_score],
        [f.away_team_id, f.away_score],
      ])
      goalMap.set(key, { goalsByTeamId: byTeam })
    }
    prevMatchups = pairs.map((p) => {
      const pairKey = [p.homeTeamId, p.awayTeamId].sort().join('|')
      const goals = goalMap.get(pairKey)
      return {
        homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
        awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
        homeFantavoto: scoreMap.get(p.homeTeamId) ?? null,
        awayFantavoto: scoreMap.get(p.awayTeamId) ?? null,
        homeGoals: goals?.goalsByTeamId.get(p.homeTeamId) ?? null,
        awayGoals: goals?.goalsByTeamId.get(p.awayTeamId) ?? null,
      }
    })
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
        <h1
          className="flex items-baseline gap-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
        >
          <span className="font-semibold">Giornate</span>
        </h1>
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
        <div className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hairline">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">
              Ultima Giornata
            </p>
            <p className="text-sm font-semibold text-ink-1 leading-tight">
              {prevMatchday?.name ?? '—'}
            </p>
          </div>

          {prevMatchups.length > 0 ? (
            <div>
              {prevMatchups.map((m, i) => {
                const hasGoals = m.homeGoals !== null && m.awayGoals !== null
                const homeWins = hasGoals
                  ? (m.homeGoals as number) > (m.awayGoals as number)
                  : m.homeFantavoto !== null && m.awayFantavoto !== null && m.homeFantavoto > m.awayFantavoto
                const awayWins = hasGoals
                  ? (m.awayGoals as number) > (m.homeGoals as number)
                  : m.homeFantavoto !== null && m.awayFantavoto !== null && m.awayFantavoto > m.homeFantavoto
                const homeTone = awayWins ? 'text-ink-5' : 'text-ink-1'
                const awayTone = homeWins ? 'text-ink-5' : 'text-ink-1'
                return (
                  <a
                    key={i}
                    href={prevMatchday ? `/matchdays/${prevMatchday.id}/all-lineups` : '#'}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 hover:bg-glass-1 transition-colors"
                  >
                    <span className={`truncate text-right text-[13px] font-medium tracking-tight ${homeTone}`}>
                      {m.homeTeamName}
                    </span>
                    <div className="flex flex-col items-center min-w-[4.5rem] tabular-nums">
                      {hasGoals ? (
                        <>
                          <div className="flex items-baseline">
                            <span className={`w-5 text-right text-lg font-light leading-none ${homeTone}`}>{m.homeGoals}</span>
                            <span className="px-1.5 text-base font-thin text-ink-5 leading-none">–</span>
                            <span className={`w-5 text-left text-lg font-light leading-none ${awayTone}`}>{m.awayGoals}</span>
                          </div>
                          {m.homeFantavoto !== null && m.awayFantavoto !== null && (
                            <div className="mt-0.5 flex items-center gap-1 text-[9px] text-ink-4">
                              <span>{m.homeFantavoto.toFixed(1)}</span>
                              <span className="text-ink-5">–</span>
                              <span>{m.awayFantavoto.toFixed(1)}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-baseline">
                          <span className={`w-9 text-right text-[13px] font-medium ${homeTone}`}>{m.homeFantavoto !== null ? m.homeFantavoto.toFixed(1) : '—'}</span>
                          <span className="px-1.5 text-xs font-thin text-ink-5">–</span>
                          <span className={`w-9 text-left text-[13px] font-medium ${awayTone}`}>{m.awayFantavoto !== null ? m.awayFantavoto.toFixed(1) : '—'}</span>
                        </div>
                      )}
                    </div>
                    <span className={`truncate text-left text-[13px] font-medium tracking-tight ${awayTone}`}>
                      {m.awayTeamName}
                    </span>
                  </a>
                )
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-ink-4">
              {prevMatchday ? 'Nessun incontro configurato.' : 'Nessuna giornata conclusa.'}
            </p>
          )}

          {prevMatchday && (
            <div className="border-t border-hairline px-4 py-2">
              <a href={`/matchdays/${prevMatchday.id}/results`} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                Dettaglio giornata →
              </a>
            </div>
          )}
        </div>

        {/* Prossima Giornata */}
        <div className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-hairline">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4">
              Prossima Giornata
            </p>
            <p className="text-sm font-semibold text-ink-1 leading-tight">
              {nextMatchday?.name ?? '—'}
            </p>
            {nextMatchday?.locks_at && (
              <p className="text-[10px] text-ink-4 mt-0.5">Scadenza: {fmt(nextMatchday.locks_at)}</p>
            )}
          </div>

          {nextMatchups.length > 0 ? (
            <div className="divide-y divide-hairline">
              {nextMatchups.map((m, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 overflow-hidden text-right">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">{m.homeTeamName}</span>
                  </div>
                  <div className="shrink-0 w-28 flex items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-ink-5">vs</span>
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">{m.awayTeamName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-ink-4">
              {nextMatchday ? 'Nessun incontro configurato.' : 'Nessuna prossima giornata.'}
            </p>
          )}

          {nextMatchday && isAdmin && (
            <div className="border-t border-hairline px-4 py-2 flex items-center justify-between">
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
      <div className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl overflow-hidden">
        {matchdays.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-ink-4">
            Nessuna giornata configurata.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
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
                      <span className="w-5 shrink-0 text-right text-[10px] text-ink-5 tabular-nums">
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
                    <p className="mt-0.5 pl-7 text-[10px] text-ink-5">{fmt(m.locks_at)}</p>
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
                        className="rounded px-1.5 py-0.5 text-[10px] bg-glass-2 text-ink-4 hover:text-ink-1 transition-colors"
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
