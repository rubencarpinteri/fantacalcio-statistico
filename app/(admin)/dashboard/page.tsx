import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  // ── All matchdays (ascending by number for chronological logic) ──────────
  const { data: allMatchdays } = await supabase
    .from('matchdays')
    .select('id, name, matchday_number, status, round_number, locks_at, is_frozen')
    .eq('league_id', ctx.league.id)
    .order('matchday_number', { ascending: true, nullsFirst: false })

  const matchdays = allMatchdays ?? []
  const matchdayIds = matchdays.map((m) => m.id)

  // ── Which matchdays have published scores? ───────────────────────────────
  // This is the single source of truth: a matchday "has results" iff it has
  // at least one row in published_team_scores.
  const scoredIds = new Set<string>()
  if (matchdayIds.length > 0) {
    const { data: scoredRows } = await supabase
      .from('published_team_scores')
      .select('matchday_id')
      .in('matchday_id', matchdayIds)
    for (const r of scoredRows ?? []) scoredIds.add(r.matchday_id)
  }

  // Ultima giornata = highest matchday_number that has real published scores
  const prevMatchday = [...matchdays].reverse().find((m) => scoredIds.has(m.id)) ?? null

  // Prossima giornata = first matchday (ascending) after prevMatchday that
  // has no scores yet and is not frozen (frozen = treated as already played)
  const prevNum = prevMatchday?.matchday_number ?? -Infinity
  const nextMatchday = matchdays.find(
    (m) =>
      (m.matchday_number ?? 0) > prevNum &&
      !scoredIds.has(m.id) &&
      !m.is_frozen
  ) ?? null

  // ── Teams & competitions ─────────────────────────────────────────────────
  const [teamsResult, compsResult] = await Promise.all([
    supabase.from('fantasy_teams').select('id, name').eq('league_id', ctx.league.id),
    supabase.from('competitions').select('id').eq('league_id', ctx.league.id),
  ])
  const teamNameMap = new Map((teamsResult.data ?? []).map((t) => [t.id, t.name]))
  const compIds = (compsResult.data ?? []).map((c) => c.id)

  // ── Helper: deduplicated matchup pairs for a round ───────────────────────
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
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id })
      }
    }
    return pairs
  }

  // ── Previous matchday: matchup results ──────────────────────────────────
  type ResultRow = {
    homeTeamName: string
    awayTeamName: string
    homeScore: number | null
    awayScore: number | null
    matchdayId: string
  }
  let prevMatchups: ResultRow[] = []

  if (prevMatchday?.round_number != null) {
    const [pairs, scoresResult] = await Promise.all([
      getMatchupPairs(prevMatchday.round_number),
      supabase
        .from('published_team_scores')
        .select('team_id, total_fantavoto')
        .eq('matchday_id', prevMatchday.id),
    ])
    const scoreMap = new Map(
      (scoresResult.data ?? []).map((s) => [s.team_id, Number(s.total_fantavoto)])
    )
    prevMatchups = pairs.map((p) => ({
      homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
      awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
      homeScore: scoreMap.get(p.homeTeamId) ?? null,
      awayScore: scoreMap.get(p.awayTeamId) ?? null,
      matchdayId: prevMatchday.id,
    }))
  }

  // ── Next matchday: upcoming fixtures ────────────────────────────────────
  type FixtureRow = { homeTeamName: string; awayTeamName: string }
  let nextMatchups: FixtureRow[] = []

  if (nextMatchday?.round_number != null) {
    const pairs = await getMatchupPairs(nextMatchday.round_number)
    nextMatchups = pairs.map((p) => ({
      homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
      awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
    }))
  }

  // ── Manager data ─────────────────────────────────────────────────────────
  let myTeamId: string | null = null
  let myTeamName: string | null = null
  let openMatchdayForLineup: { id: string; name: string; hasSubmission: boolean } | null = null

  if (!isAdmin) {
    const { data: myTeam } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', ctx.league.id)
      .eq('manager_id', ctx.userId)
      .maybeSingle()

    if (myTeam) {
      myTeamId = myTeam.id
      myTeamName = myTeam.name
      const openMd = matchdays.find((m) => m.status === 'open') ?? null
      if (openMd) {
        const { data: ptr } = await supabase
          .from('lineup_current_pointers')
          .select('submission_id')
          .eq('matchday_id', openMd.id)
          .eq('team_id', myTeam.id)
          .maybeSingle()
        openMatchdayForLineup = {
          id: openMd.id,
          name: openMd.name,
          hasSubmission: !!ptr,
        }
      }
    }
  }

  const fmt = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : '—'

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-bold text-white">{ctx.league.name}</h1>
        <p className="text-xs text-[#8888aa]">{ctx.league.season_name}</p>
      </div>

      {/* ── Manager lineup CTA (compact, only when open matchday exists) ── */}
      {myTeamName && openMatchdayForLineup && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-indigo-300">{openMatchdayForLineup.name}</p>
            <p className="text-[11px] text-[#8888aa]">
              {openMatchdayForLineup.hasSubmission ? 'Formazione inviata' : 'Formazione non inviata'}
            </p>
          </div>
          <a
            href={`/matchdays/${openMatchdayForLineup.id}/lineup`}
            className="ml-4 shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            {openMatchdayForLineup.hasSubmission ? 'Modifica' : 'Schiera'}
          </a>
        </div>
      )}

      {/* ── Giornate grid: Ultima + Prossima ────────────────────────────── */}
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
                const homeWins =
                  m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore
                const awayWins =
                  m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore
                return (
                  <a
                    key={i}
                    href={`/matchdays/${m.matchdayId}/all-lineups`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a26] transition-colors"
                  >
                    {/* Home team */}
                    <div className="flex-1 min-w-0 overflow-hidden text-right">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          homeWins ? 'text-white' : awayWins ? 'text-[#3a3a52]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.homeTeamName}
                      </span>
                    </div>
                    {/* Score */}
                    <div className="shrink-0 w-28 flex items-center justify-center gap-1.5 tabular-nums">
                      <span
                        className={`text-base font-bold ${homeWins ? 'text-white' : 'text-[#55556a]'}`}
                      >
                        {m.homeScore !== null ? m.homeScore.toFixed(1) : '—'}
                      </span>
                      <span className="text-[#3a3a52] text-sm font-normal">–</span>
                      <span
                        className={`text-base font-bold ${awayWins ? 'text-white' : 'text-[#55556a]'}`}
                      >
                        {m.awayScore !== null ? m.awayScore.toFixed(1) : '—'}
                      </span>
                    </div>
                    {/* Away team */}
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          awayWins ? 'text-white' : homeWins ? 'text-[#3a3a52]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.awayTeamName}
                      </span>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-[#55556a]">
              {prevMatchday
                ? 'Nessun incontro configurato.'
                : 'Nessuna giornata conclusa.'}
            </p>
          )}

          {prevMatchday && (
            <div className="border-t border-[#1e1e2e] px-4 py-2">
              <a
                href={`/matchdays/${prevMatchday.id}/results`}
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
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
              <p className="text-[10px] text-[#55556a] mt-0.5">
                Scadenza: {fmt(nextMatchday.locks_at)}
              </p>
            )}
          </div>

          {nextMatchups.length > 0 ? (
            <div className="divide-y divide-[#1e1e2e]">
              {nextMatchups.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {/* Home team */}
                  <div className="flex-1 min-w-0 overflow-hidden text-right">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">
                      {m.homeTeamName}
                    </span>
                  </div>
                  {/* VS */}
                  <div className="shrink-0 w-28 flex items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#3a3a52]">
                      vs
                    </span>
                  </div>
                  {/* Away team */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="block truncate text-sm font-semibold text-[#c0c0d8]">
                      {m.awayTeamName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-[#55556a]">
              {nextMatchday
                ? 'Nessun incontro configurato.'
                : 'Nessuna prossima giornata.'}
            </p>
          )}

          {nextMatchday && (
            <div className="border-t border-[#1e1e2e] px-4 py-2">
              <a
                href="/matchdays"
                className="text-[11px] text-indigo-400 hover:text-indigo-300"
              >
                Calendario completo →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Classifica (WIP) ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2e2e42]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">
              Classifica
            </p>
            <p className="text-sm font-semibold text-white leading-tight">
              {ctx.league.name}
            </p>
          </div>
          <a
            href="/standings"
            className="text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            Classifica completa →
          </a>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-xs font-medium text-[#55556a]">Work in progress</p>
          <p className="mt-1 text-[11px] text-[#3a3a52]">
            La classifica sarà disponibile prossimamente.
          </p>
        </div>
      </div>

      {/* ── Admin quick links (compact, bottom) ─────────────────────────── */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/matchdays', label: 'Giornate' },
            { href: '/players', label: 'Giocatori' },
            { href: '/league', label: 'Impostazioni' },
            { href: '/formations', label: 'Formazioni' },
            { href: '/roster', label: 'Rose' },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-md border border-[#2e2e42] bg-[#111118] px-3 py-1.5 text-xs text-[#8888aa] hover:border-indigo-500/40 hover:text-white transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
