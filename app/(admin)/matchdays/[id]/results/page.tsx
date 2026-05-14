import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { BonusMalusItem } from '@/domain/engine/v1/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Risultati — ${data?.name ?? 'Giornata'}` }
}

export default async function MatchdayResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  if (!['closed', 'archived', 'published'].includes(matchday.status)) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">
          I risultati non sono disponibili — la giornata non è ancora pubblicata.
        </p>
      </div>
    )
  }

  const { data: ptr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  if (!ptr?.run_id) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">Nessun calcolo pubblicato per questa giornata.</p>
      </div>
    )
  }

  // Fetch stable published data in parallel
  const [
    { data: run },
    { data: teamScores },
    { data: calcs },
    { data: lineupPointers },
  ] = await Promise.all([
    supabase
      .from('calculation_runs')
      .select('run_number, published_at, engine_version')
      .eq('id', ptr.run_id)
      .single(),
    supabase
      .from('published_team_scores')
      .select('team_id, total_fantavoto, player_count, nv_count')
      .eq('matchday_id', matchdayId)
      .order('total_fantavoto', { ascending: false }),
    supabase
      .from('player_calculations')
      .select(`
        player_id,
        fantavoto,
        voto_base,
        bonus_malus_breakdown,
        total_bonus_malus,
        is_override,
        is_provisional,
        z_fotmob,
        minutes_factor,
        role_multiplier,
        league_players ( full_name, club, rating_class )
      `)
      .eq('run_id', ptr.run_id),
    supabase
      .from('lineup_current_pointers')
      .select('team_id, submission_id')
      .eq('matchday_id', matchdayId),
  ])

  const teamIds = (teamScores ?? []).map((s) => s.team_id)
  const submissionIds = (lineupPointers ?? []).map((p) => p.submission_id)

  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .in('id', teamIds)

  type LineupSlot = { submission_id: string; player_id: string; is_bench: boolean; bench_order: number | null }
  let lineupPlayers: LineupSlot[] = []
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from('lineup_submission_players')
      .select('submission_id, player_id, is_bench, bench_order')
      .in('submission_id', submissionIds)
    lineupPlayers = (data ?? []) as LineupSlot[]
  }

  // Build lookup maps
  type CalcRow = {
    player_id: string
    fantavoto: number | null
    voto_base: number | null
    bonus_malus_breakdown: unknown
    total_bonus_malus: number | null
    is_override: boolean
    is_provisional: boolean
    z_fotmob: number | null
    minutes_factor: number | null
    role_multiplier: number | null
    league_players: { full_name: string; club: string; rating_class: string } | null
  }

  // NOTE: uses league default target params — actual stored voto_base from engine is authoritative
  const targetMean = 6.0  // DEFAULT_ENGINE_CONFIG.target_mean_vote
  const targetStd  = 0.75 // DEFAULT_ENGINE_CONFIG.target_vote_std

  function calcSourceVotoBase(z: number | null, mf: number | null, rm: number | null): number | null {
    if (z === null || mf === null || rm === null) return null
    const b0 = targetMean + targetStd * z * mf
    const b1 = targetMean + rm * (b0 - targetMean)
    return Math.max(3.0, Math.min(9.5, b1))
  }
  const calcByPlayer = new Map<string, CalcRow>()
  for (const c of calcs ?? []) {
    calcByPlayer.set(c.player_id, c as unknown as CalcRow)
  }

  const teamNameMap = new Map<string, string>()
  for (const t of teams ?? []) {
    teamNameMap.set(t.id, t.name)
  }

  const submissionToTeam = new Map<string, string>()
  for (const p of lineupPointers ?? []) {
    submissionToTeam.set(p.submission_id, p.team_id)
  }

  type SlotEntry = { player_id: string; is_bench: boolean; bench_order: number | null }
  const lineupByTeam = new Map<string, SlotEntry[]>()
  for (const lp of lineupPlayers) {
    const teamId = submissionToTeam.get(lp.submission_id)
    if (!teamId) continue
    const existing = lineupByTeam.get(teamId) ?? []
    existing.push({ player_id: lp.player_id, is_bench: lp.is_bench, bench_order: lp.bench_order })
    lineupByTeam.set(teamId, existing)
  }

  const rcColors: Record<string, string> = {
    GK: 'text-yellow-400',
    DEF: 'text-blue-400',
    MID: 'text-green-400',
    ATT: 'text-red-400',
  }

  const fmtDate = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dt))
      : null

  // Render a signed B/M total with a native tooltip listing each item.
  // Matches the BMBreakdown pattern in CalculationPreview.tsx.
  function BmCell({ breakdown, total }: { breakdown: unknown; total: number | null }) {
    const items = Array.isArray(breakdown) ? (breakdown as BonusMalusItem[]) : []
    if (total === null) return <span className="text-ink-4">—</span>
    if (items.length === 0) {
      return (
        <span className="font-mono text-ink-3">
          {total >= 0 ? '+' : ''}{total.toFixed(1)}
        </span>
      )
    }
    const titleText = items
      .map((b) =>
        `${b.label}: ${b.quantity > 1 ? `${b.quantity}× ` : ''}${b.points_each >= 0 ? '+' : ''}${b.points_each} = ${b.total >= 0 ? '+' : ''}${b.total.toFixed(1)}`
      )
      .join('\n')
    return (
      <span
        className="cursor-help border-b border-dotted border-[#55556a] font-mono text-ink-3"
        title={titleText}
      >
        {total >= 0 ? '+' : ''}{total.toFixed(1)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <a href={`/matchdays/${matchdayId}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {matchday.name}
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          <span className="font-semibold">Risultati</span>
          <span className="serif font-normal text-ink-3">— pubblicati</span>
        </h1>
        {run && (
          <p className="mt-1.5 text-[12.5px] text-ink-4">
            Run #{run.run_number}
            {run.engine_version ? ` · ${run.engine_version}` : ''}
            {fmtDate(run.published_at) ? ` · Pubblicato il ${fmtDate(run.published_at)}` : ''}
          </p>
        )}
      </div>

      {/* One card per team, sorted by score */}
      {(teamScores ?? []).map((ts, idx) => {
        const teamName = teamNameMap.get(ts.team_id) ?? '—'
        const lineup = lineupByTeam.get(ts.team_id) ?? []
        const starters = lineup.filter((p) => !p.is_bench)
        const bench = lineup
          .filter((p) => p.is_bench)
          .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))

        const posColor =
          idx === 0 ? 'text-amber-400'
          : idx <= 2 ? 'text-indigo-300'
          : 'text-ink-1'

        return (
          <Card key={ts.team_id}>
            <CardHeader
              title={
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${posColor}`}>{idx + 1}.</span>
                  <span className="text-ink-1">{teamName}</span>
                </div>
              }
              description={`${ts.player_count} titolari · ${ts.nv_count > 0 ? `${ts.nv_count} NV` : 'nessun NV'}`}
              action={
                <span className="font-mono text-lg font-bold text-ink-1">
                  {Number(ts.total_fantavoto).toFixed(2)}
                </span>
              }
            />
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-4">
                    <th className="px-6 py-2">Giocatore</th>
                    <th className="px-4 py-2">Ruolo</th>
                    <th className="px-4 py-2 text-right">Voto base</th>
                    <th className="px-4 py-2 text-right">B/M</th>
                    <th className="px-4 py-2 text-right font-medium text-ink-1">Fantavoto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {starters.map(({ player_id }) => {
                    const c = calcByPlayer.get(player_id)
                    const player = c?.league_players
                    const isNV = c?.fantavoto == null
                    return (
                      <tr key={player_id} className={isNV ? 'opacity-50' : ''}>
                        <td className="px-6 py-2">
                          <div className="font-medium text-ink-1">{player?.full_name ?? '—'}</div>
                          <div className="text-xs text-ink-4">{player?.club ?? ''}</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-ink-3'}`}>
                            {player?.rating_class ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="font-mono text-ink-3">
                            {c?.voto_base != null ? c.voto_base.toFixed(2) : '—'}
                          </span>
                          {(() => {
                            const vbFm = calcSourceVotoBase(c?.z_fotmob ?? null, c?.minutes_factor ?? null, c?.role_multiplier ?? null)
                            if (vbFm === null) return null
                            return (
                              <div className="mt-0.5 flex justify-end gap-2 text-[10px]">
                                <span className="text-[#6666aa]">FM {vbFm.toFixed(2)}</span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <BmCell breakdown={c?.bonus_malus_breakdown} total={c?.total_bonus_malus ?? null} />
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold">
                          <span className={isNV ? 'text-ink-4' : 'text-ink-1'}>
                            {c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'}
                          </span>
                          {c?.is_provisional && (
                            <span className="ml-1 text-xs text-amber-400" title="Provvisorio">~</span>
                          )}
                          {c?.is_override && (
                            <span className="ml-1 text-xs text-orange-400" title="Override manuale">★</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {bench.length > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-glass-soft px-6 py-1.5 text-xs font-medium uppercase tracking-wider text-ink-4"
                      >
                        Panchina
                      </td>
                    </tr>
                  )}

                  {bench.map(({ player_id }) => {
                    const c = calcByPlayer.get(player_id)
                    const player = c?.league_players
                    return (
                      <tr key={player_id} className="opacity-50">
                        <td className="px-6 py-2">
                          <div className="text-ink-3">{player?.full_name ?? '—'}</div>
                          <div className="text-xs text-ink-4">{player?.club ?? ''}</div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-ink-4'}`}>
                            {player?.rating_class ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-ink-4">
                          {c?.voto_base != null ? c.voto_base.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-ink-4">
                          {c?.total_bonus_malus != null
                            ? (c.total_bonus_malus >= 0 ? '+' : '') + c.total_bonus_malus.toFixed(1)
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-ink-4">
                          {c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'}
                          {c?.is_override && (
                            <span className="ml-1 text-xs text-orange-400" title="Override manuale">★</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {lineup.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-3 text-sm text-ink-4">
                        Nessuna formazione registrata.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )
      })}

      {(teamScores ?? []).length === 0 && (
        <p className="text-sm text-ink-4">Nessun punteggio pubblicato per questa giornata.</p>
      )}
    </div>
  )
}
