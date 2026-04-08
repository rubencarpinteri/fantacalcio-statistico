import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { QuickFetchAndCalculateButton } from '@/components/ui/QuickFetchAndCalculateButton'

export const metadata = { title: 'Giornate' }

const STATUS_PRIORITY: Record<string, number> = {
  open: 0, closed: 1, draft: 2, archived: 3,
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

  // Provisional stat counts (admin only)
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

  // ── Matchup scores for current matchday ──────────────────────────────────
  type MatchupScore = {
    homeTeamName: string
    awayTeamName: string
    homeScore: number | null
    awayScore: number | null
    isDraft: boolean
  }
  let matchupScores: MatchupScore[] = []
  let hasCalcData = false

  if (current && current.round_number !== null) {
    const { data: teams } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', ctx.league.id)
    const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

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

        // suppress unused variable warning
        void pointerMap

        matchupScores = pairs.map((p) => ({
          homeTeamName: teamNameMap.get(p.homeTeamId) ?? '—',
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
    <div className="space-y-4">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Giornate</h1>
        <a href="/campionato" className="text-xs text-indigo-400 hover:text-indigo-300">
          Classifica →
        </a>
      </div>

      {/* ── Current matchday matchups ───────────────────────────────────── */}
      {current && (
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2e2e42]">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a] shrink-0">
                Giornata corrente
              </p>
              <span className="truncate text-sm font-semibold text-white">{current.name}</span>
              <MatchdayStatusBadge status={current.status} />
              {current.is_frozen && <span className="text-xs" title="Congelata">🧊</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <QuickFetchAndCalculateButton matchdayId={current.id} compact />
              <a
                href={`/matchdays/${current.id}/all-lineups`}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Formazioni →
              </a>
            </div>
          </div>

          {matchupScores.length > 0 ? (
            <>
              <div className="divide-y divide-[#1e1e2e]">
                {matchupScores.map((m, i) => {
                  const homeWins = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore
                  const awayWins = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore
                  return (
                    <a
                      key={i}
                      href={`/matchdays/${current.id}/all-lineups`}
                      className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 px-4 py-2 hover:bg-[#1a1a26] transition-colors"
                    >
                      <span
                        className={`truncate text-xs font-medium ${
                          homeWins ? 'text-white' : awayWins ? 'text-[#55556a]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.homeTeamName}
                      </span>
                      <div className="flex items-center gap-1 shrink-0 text-xs font-bold tabular-nums">
                        <span className={homeWins ? 'text-emerald-300' : 'text-[#8888aa]'}>
                          {m.homeScore !== null ? m.homeScore.toFixed(1) : hasCalcData ? '0.0' : '—'}
                        </span>
                        <span className="text-[#2e2e42]">–</span>
                        <span className={awayWins ? 'text-emerald-300' : 'text-[#8888aa]'}>
                          {m.awayScore !== null ? m.awayScore.toFixed(1) : hasCalcData ? '0.0' : '—'}
                        </span>
                        {m.isDraft && (
                          <span className="ml-0.5 text-[9px] text-amber-500/60">~</span>
                        )}
                      </div>
                      <span
                        className={`truncate text-right text-xs font-medium ${
                          awayWins ? 'text-white' : homeWins ? 'text-[#55556a]' : 'text-[#c0c0d8]'
                        }`}
                      >
                        {m.awayTeamName}
                      </span>
                    </a>
                  )
                })}
              </div>
              {matchupScores.some((m) => m.isDraft) && (
                <p className="px-4 py-1.5 border-t border-[#1e1e2e] text-[10px] text-amber-500/50">
                  ~ risultati parziali (calcolo non pubblicato)
                </p>
              )}
            </>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-[#55556a]">
              {current.round_number === null
                ? 'Nessun numero di giornata configurato.'
                : 'Nessun incontro configurato per questa giornata.'}
            </p>
          )}
        </div>
      )}

      {/* ── All matchdays list ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        {!matchdays || matchdays.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-[#55556a]">
            Nessuna giornata configurata.
          </p>
        ) : (
          <div className="divide-y divide-[#1e1e2e]">
            {matchdays.map((m) => {
              const isCurrent = m.id === current?.id
              const isEditable = ['open', 'closed'].includes(m.status)
              const provCount = provisionalByMatchday.get(m.id) ?? 0
              return (
                <div
                  key={m.id}
                  className={`px-4 py-2.5 ${isCurrent ? 'bg-indigo-500/5' : ''}`}
                >
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
                    </div>
                  </div>

                  {/* Deadline */}
                  {m.locks_at && (
                    <p className="mt-0.5 pl-7 text-[10px] text-[#3a3a52]">
                      {fmt(m.locks_at)}
                    </p>
                  )}

                  {/* Admin quick links */}
                  {isAdmin && isCurrent && (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
                      {isEditable && (
                        <a
                          href={`/matchdays/${m.id}/import-lineups`}
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                        >
                          Formazioni
                        </a>
                      )}
                      <a
                        href={`/matchdays/${m.id}/fixtures`}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-[#1a1a2e] text-[#8888aa] hover:text-white transition-colors"
                      >
                        Fetch voti
                      </a>
                      <a
                        href={`/matchdays/${m.id}/calculate`}
                        className="rounded px-1.5 py-0.5 text-[10px] bg-[#1a1a2e] text-[#8888aa] hover:text-white transition-colors"
                      >
                        Calcola
                      </a>
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
