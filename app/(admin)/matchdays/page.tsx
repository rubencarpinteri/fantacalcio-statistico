import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { QuickFetchAndCalculateButton } from '@/components/ui/QuickFetchAndCalculateButton'

export const metadata = { title: 'Giornate' }

// Priority order for "current" matchday selection
const STATUS_PRIORITY: Record<string, number> = {
  open: 0, closed: 1, draft: 2, archived: 3,
  // Legacy statuses
  locked: 1, scoring: 1, published: 1,
}

export default async function MatchdaysPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('matchday_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  // Per-matchday provisional stat count
  const provisionalByMatchday = new Map<string, number>()
  if (isAdmin && (matchdays?.length ?? 0) > 0) {
    const ids = (matchdays ?? []).map((m) => m.id)
    const { data: provRows } = await supabase
      .from('player_match_stats')
      .select('matchday_id')
      .eq('is_provisional', true)
      .in('matchday_id', ids)
    for (const row of provRows ?? []) {
      provisionalByMatchday.set(row.matchday_id, (provisionalByMatchday.get(row.matchday_id) ?? 0) + 1)
    }
  }

  // Pick the "current" matchday
  const current = [...(matchdays ?? [])].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9
    const pb = STATUS_PRIORITY[b.status] ?? 9
    if (pa !== pb) return pa - pb
    return (b.matchday_number ?? 0) - (a.matchday_number ?? 0)
  })[0] ?? null

  // ── Fetch matchups + partial scores for the current matchday ──────────────
  type MatchupScore = {
    homeTeamId: string
    homeTeamName: string
    awayTeamId: string
    awayTeamName: string
    homeScore: number | null
    awayScore: number | null
    isDraft: boolean
  }
  let matchupScores: MatchupScore[] = []
  let hasCalcData = false

  if (current && current.round_number !== null) {
    // Teams for name lookup
    const { data: teams } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', ctx.league.id)
    const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

    // Competition matchups
    const { data: comps } = await supabase
      .from('competitions')
      .select('id')
      .eq('league_id', ctx.league.id)
    const compIds = (comps ?? []).map((c) => c.id)

    if (compIds.length > 0) {
      const { data: rawMatchups } = await supabase
        .from('competition_matchups')
        .select('home_team_id, away_team_id')
        .in('competition_id', compIds)
        .eq('round_number', current.round_number)

      // Deduplicate pairs
      const seen = new Set<string>()
      const pairs: Array<{ homeTeamId: string; awayTeamId: string }> = []
      for (const m of rawMatchups ?? []) {
        const key = [m.home_team_id, m.away_team_id].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          pairs.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id })
        }
      }

      if (pairs.length > 0) {
        // Latest calc run
        const { data: currentPtr } = await supabase
          .from('matchday_current_calculation')
          .select('run_id')
          .eq('matchday_id', current.id)
          .maybeSingle()

        let runId = currentPtr?.run_id ?? null
        let isDraft = false
        if (!runId) {
          const { data: latestRun } = await supabase
            .from('calculation_runs')
            .select('id, status')
            .eq('matchday_id', current.id)
            .order('run_number', { ascending: false })
            .limit(1)
            .maybeSingle()
          runId = latestRun?.id ?? null
          isDraft = !!runId
        }

        // Per-player fantavoto map
        const calcMap = new Map<string, number>()
        if (runId) {
          hasCalcData = true
          const { data: calcs } = await supabase
            .from('player_calculations')
            .select('player_id, fantavoto')
            .eq('run_id', runId)
          for (const c of calcs ?? []) {
            if (c.fantavoto !== null) calcMap.set(c.player_id, c.fantavoto)
          }
        }

        // Lineup pointers → submission players (field only)
        const allTeamIds = [...new Set(pairs.flatMap((p) => [p.homeTeamId, p.awayTeamId]))]
        const { data: pointers } = await supabase
          .from('lineup_current_pointers')
          .select('team_id, submission_id')
          .eq('matchday_id', current.id)
          .in('team_id', allTeamIds)
        const pointerMap = new Map((pointers ?? []).map((p) => [p.team_id, p.submission_id]))

        const submissionIds = (pointers ?? []).map((p) => p.submission_id)
        const teamScoreMap = new Map<string, number>()

        if (submissionIds.length > 0) {
          const { data: subPlayers } = await supabase
            .from('lineup_submission_players')
            .select('submission_id, player_id, is_bench')
            .in('submission_id', submissionIds)
            .eq('is_bench', false)

          // Build submission → team map
          const subTeamMap = new Map(
            (pointers ?? []).map((p) => [p.submission_id, p.team_id])
          )

          for (const sp of subPlayers ?? []) {
            const teamId = subTeamMap.get(sp.submission_id)
            if (!teamId) continue
            const fv = calcMap.get(sp.player_id)
            if (fv !== undefined) {
              teamScoreMap.set(teamId, (teamScoreMap.get(teamId) ?? 0) + fv)
            }
          }
        }

        matchupScores = pairs.map((p) => ({
          homeTeamId: p.homeTeamId,
          homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
          awayTeamId: p.awayTeamId,
          awayTeamName: teamNameMap.get(p.awayTeamId) ?? '—',
          homeScore: teamScoreMap.has(p.homeTeamId) ? +(teamScoreMap.get(p.homeTeamId)!.toFixed(1)) : null,
          awayScore: teamScoreMap.has(p.awayTeamId) ? +(teamScoreMap.get(p.awayTeamId)!.toFixed(1)) : null,
          isDraft,
        }))
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
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-white">Giornate</h1>
        <div className="mt-1 flex items-center gap-4">
          <p className="text-sm text-[#8888aa]">{matchdays?.length ?? 0} giornate</p>
          <a href="/campionato" className="text-sm text-indigo-400 hover:text-indigo-300">
            Classifica →
          </a>
        </div>
      </div>

      {/* ── Current matchday: matchup scores ────────────────────────────────── */}
      {current && (
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e2e42]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
                Giornata corrente
              </span>
              <span className="font-semibold text-white">{current.name}</span>
              <MatchdayStatusBadge status={current.status} />
              {current.is_frozen && <span title="Congelata">🧊</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <QuickFetchAndCalculateButton matchdayId={current.id} compact />
              <a
                href={`/matchdays/${current.id}/all-lineups`}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Tutte le formazioni →
              </a>
            </div>
          </div>

          {/* Matchup rows */}
          {matchupScores.length > 0 ? (
            <div className="divide-y divide-[#1e1e2e]">
              {matchupScores.map((m, i) => {
                const homeWins = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore
                const awayWins = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore
                return (
                  <a
                    key={i}
                    href={`/matchdays/${current.id}/all-lineups`}
                    className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 px-4 py-3 hover:bg-[#1a1a26] transition-colors"
                  >
                    {/* Home */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          homeWins ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#2e2e42] text-[#8888aa]'
                        }`}
                      >
                        {m.homeTeamName.slice(0, 1).toUpperCase()}
                      </div>
                      <span
                        className={`truncate text-sm font-medium ${
                          homeWins ? 'text-white' : awayWins ? 'text-[#55556a]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.homeTeamName}
                      </span>
                    </div>

                    {/* Score */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`min-w-[2.5rem] rounded-md px-2 py-1 text-center text-sm font-bold tabular-nums ${
                          homeWins ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#1e1e2e] text-white'
                        }`}
                      >
                        {m.homeScore !== null ? m.homeScore.toFixed(1) : hasCalcData ? '0.0' : '—'}
                      </span>
                      <span className="text-xs text-[#55556a]">vs</span>
                      <span
                        className={`min-w-[2.5rem] rounded-md px-2 py-1 text-center text-sm font-bold tabular-nums ${
                          awayWins ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#1e1e2e] text-white'
                        }`}
                      >
                        {m.awayScore !== null ? m.awayScore.toFixed(1) : hasCalcData ? '0.0' : '—'}
                      </span>
                      {m.isDraft && (
                        <span className="ml-0.5 text-[10px] text-amber-500/70">~</span>
                      )}
                    </div>

                    {/* Away */}
                    <div className="flex items-center justify-end gap-2 min-w-0">
                      <span
                        className={`truncate text-sm font-medium text-right ${
                          awayWins ? 'text-white' : homeWins ? 'text-[#55556a]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.awayTeamName}
                      </span>
                      <div
                        className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          awayWins ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#2e2e42] text-[#8888aa]'
                        }`}
                      >
                        {m.awayTeamName.slice(0, 1).toUpperCase()}
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-[#55556a]">
              {current.round_number === null
                ? 'Nessun numero di giornata configurato — non è possibile mostrare i match.'
                : 'Nessun incontro configurato per questa giornata.'}
            </div>
          )}

          {/* Footer hint */}
          {matchupScores.some((m) => m.isDraft) && (
            <div className="px-4 py-2 border-t border-[#1e1e2e]">
              <p className="text-[11px] text-amber-500/60">
                ~ risultati parziali (calcolo non ancora pubblicato)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── All matchdays — vertical card list (no horizontal scroll) ────────── */}
      <div className="space-y-2">
        {!matchdays || matchdays.length === 0 ? (
          <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] px-6 py-12 text-center text-sm text-[#55556a]">
            Nessuna giornata configurata.
          </div>
        ) : (
          matchdays.map((m) => {
            const isCurrent = m.id === current?.id
            const isEditable = ['open', 'closed'].includes(m.status)
            const provCount = provisionalByMatchday.get(m.id) ?? 0
            return (
              <div
                key={m.id}
                className={`rounded-xl border bg-[#0d0d1a] px-4 py-3 transition-colors ${
                  isCurrent ? 'border-indigo-500/40' : 'border-[#2e2e42]'
                }`}
              >
                {/* Row: number + name + badge */}
                <div className="flex items-center gap-3">
                  {m.matchday_number !== null && (
                    <span className="shrink-0 text-xs text-[#55556a] tabular-nums w-5 text-right">
                      {m.matchday_number}
                    </span>
                  )}
                  <a
                    href={`/matchdays/${m.id}`}
                    className={`flex-1 font-semibold text-sm hover:text-indigo-400 transition-colors min-w-0 truncate ${
                      isCurrent ? 'text-indigo-200' : 'text-white'
                    }`}
                  >
                    {m.name}
                  </a>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <MatchdayStatusBadge status={m.status} />
                    {m.is_frozen && <span className="text-sm" title="Congelata">🧊</span>}
                    {isAdmin && provCount > 0 && (
                      <span className="text-[10px] text-amber-400 font-medium">~{provCount}</span>
                    )}
                  </div>
                </div>

                {/* Deadline */}
                {m.locks_at && (
                  <p className="mt-1 text-[11px] text-[#55556a] pl-8">
                    Scadenza: {fmt(m.locks_at)}
                  </p>
                )}

                {/* Admin quick links */}
                {isAdmin && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-8">
                    {isEditable && (
                      <a
                        href={`/matchdays/${m.id}/import-lineups`}
                        className="rounded px-2 py-0.5 text-[11px] font-medium bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                      >
                        Formazioni
                      </a>
                    )}
                    <a
                      href={`/matchdays/${m.id}/stats`}
                      className="rounded px-2 py-0.5 text-[11px] bg-[#1e1e2e] text-[#8888aa] hover:text-white transition-colors"
                    >
                      Stats
                    </a>
                    <a
                      href={`/matchdays/${m.id}/calculate`}
                      className="rounded px-2 py-0.5 text-[11px] bg-[#1e1e2e] text-[#8888aa] hover:text-white transition-colors"
                    >
                      Calcola
                    </a>
                    <a
                      href={`/matchdays/${m.id}`}
                      className="rounded px-2 py-0.5 text-[11px] bg-[#1e1e2e] text-[#8888aa] hover:text-white transition-colors"
                    >
                      Gestione →
                    </a>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ── Admin command center (current matchday) — BOTTOM ────────────────── */}
      {isAdmin && current && (
        <div className="rounded-xl border border-indigo-500/20 bg-[#0d0d1a] p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-medium uppercase tracking-widest text-indigo-500">
                Workflow — {current.name}
              </span>
            </div>
            <a
              href={`/matchdays/${current.id}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Gestione completa →
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Lineups */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Formazioni
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/import-lineups`}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-500/20 px-2 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                >
                  📝 Testo Leghe
                </a>
                <a
                  href={`/matchdays/${current.id}/import-leghe`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  📊 xlsx / csv
                </a>
                <a
                  href={`/matchdays/${current.id}/all-lineups`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  ✏️ Manuale
                </a>
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Statistiche
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/fixtures`}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors"
                >
                  📡 Fetch voti
                </a>
                <a
                  href={`/matchdays/${current.id}/stats`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  📋 Modifica stats
                </a>
              </div>
            </div>

            {/* Calculate */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Calcolo
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/calculate`}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  ⚡ Calcola / Pubblica
                </a>
                <a
                  href={`/matchdays/${current.id}/overrides`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🔧 Override
                </a>
              </div>
            </div>

            {/* View */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Visualizza
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/all-lineups`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🗒️ Tutte le formazioni
                </a>
                <a
                  href={`/matchdays/${current.id}/results`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🏅 Risultati
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
