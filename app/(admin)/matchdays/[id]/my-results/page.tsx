import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { BonusMalusItem } from '@/domain/engine/v1/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `I miei risultati — ${data?.name ?? 'Giornata'}` }
}

export default async function MyResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params

  // Admins have full results; send them there
  if (ctx.role === 'league_admin') {
    redirect(`/matchdays/${matchdayId}/results`)
  }

  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Manager's own team — scoped to their user ID and league
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .single()

  if (!myTeam) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-[#55556a]">Non sei associato a nessuna squadra in questa lega.</p>
      </div>
    )
  }

  if (!['published', 'archived'].includes(matchday.status)) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-[#55556a]">
          I risultati non sono ancora disponibili — la giornata non è ancora pubblicata.
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
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-[#55556a]">Nessun calcolo pubblicato per questa giornata.</p>
      </div>
    )
  }

  // Fetch team score (MY team only), run metadata, and MY lineup pointer in parallel
  const [
    { data: myScore },
    { data: run },
    { data: lineupPointer },
  ] = await Promise.all([
    supabase
      .from('published_team_scores')
      .select('total_fantavoto, player_count, nv_count')
      .eq('matchday_id', matchdayId)
      .eq('team_id', myTeam.id)          // scoped: my team only
      .maybeSingle(),
    supabase
      .from('calculation_runs')
      .select('run_number, published_at, engine_version')
      .eq('id', ptr.run_id)
      .single(),
    supabase
      .from('lineup_current_pointers')
      .select('submission_id')
      .eq('matchday_id', matchdayId)
      .eq('team_id', myTeam.id)          // scoped: my team only
      .maybeSingle(),
  ])

  if (!myScore) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-[#55556a]">
          Nessun punteggio pubblicato per la tua squadra in questa giornata.
        </p>
      </div>
    )
  }

  // Get lineup slots for MY submission only
  type LineupSlot = { player_id: string; is_bench: boolean; bench_order: number | null }
  let lineupPlayers: LineupSlot[] = []
  if (lineupPointer?.submission_id) {
    const { data } = await supabase
      .from('lineup_submission_players')
      .select('player_id, is_bench, bench_order')
      .eq('submission_id', lineupPointer.submission_id)  // scoped: my submission only
    lineupPlayers = (data ?? []) as LineupSlot[]
  }

  // Fetch calculations ONLY for my lineup players — explicit player_id filter
  type CalcRow = {
    player_id: string
    fantavoto: number | null
    voto_base: number | null
    bonus_malus_breakdown: unknown
    total_bonus_malus: number | null
    is_override: boolean
    is_provisional: boolean
    league_players: { full_name: string; club: string; rating_class: string } | null
  }
  const calcByPlayer = new Map<string, CalcRow>()
  const myPlayerIds = lineupPlayers.map((lp) => lp.player_id)

  if (myPlayerIds.length > 0) {
    const { data: calcs } = await supabase
      .from('player_calculations')
      .select(`
        player_id,
        fantavoto,
        voto_base,
        bonus_malus_breakdown,
        total_bonus_malus,
        is_override,
        is_provisional,
        league_players ( full_name, club, rating_class )
      `)
      .eq('run_id', ptr.run_id)
      .in('player_id', myPlayerIds)      // scoped: my players only
    for (const c of calcs ?? []) {
      calcByPlayer.set(c.player_id, c as unknown as CalcRow)
    }
  }

  const starters = lineupPlayers.filter((p) => !p.is_bench)
  const bench = lineupPlayers
    .filter((p) => p.is_bench)
    .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))

  const rcColors: Record<string, string> = {
    GK: 'text-yellow-400',
    DEF: 'text-blue-400',
    MID: 'text-green-400',
    ATT: 'text-red-400',
  }

  const fmtDate = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : null

  function BmCell({ breakdown, total }: { breakdown: unknown; total: number | null }) {
    const items = Array.isArray(breakdown) ? (breakdown as BonusMalusItem[]) : []
    if (total === null) return <span className="text-[#55556a]">—</span>
    if (items.length === 0) {
      return (
        <span className="font-mono text-[#8888aa]">
          {total >= 0 ? '+' : ''}{total.toFixed(1)}
        </span>
      )
    }
    const titleText = items
      .map(
        (b) =>
          `${b.label}: ${b.quantity > 1 ? `${b.quantity}× ` : ''}${b.points_each >= 0 ? '+' : ''}${b.points_each} = ${b.total >= 0 ? '+' : ''}${b.total.toFixed(1)}`
      )
      .join('\n')
    return (
      <span
        className="cursor-help border-b border-dotted border-[#55556a] font-mono text-[#8888aa]"
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
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">I miei risultati</h1>
        {run && (
          <p className="mt-0.5 text-xs text-[#55556a]">
            Run #{run.run_number}
            {fmtDate(run.published_at) ? ` · Pubblicato il ${fmtDate(run.published_at)}` : ''}
          </p>
        )}
      </div>

      {/* Team score card */}
      <Card>
        <CardHeader
          title={myTeam.name}
          description={`${myScore.player_count} titolari · ${myScore.nv_count > 0 ? `${myScore.nv_count} NV` : 'nessun NV'}`}
          action={
            <span className="font-mono text-lg font-bold text-white">
              {Number(myScore.total_fantavoto).toFixed(2)}
            </span>
          }
        />
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2e2e42] text-left text-xs text-[#55556a]">
                <th className="px-6 py-2">Giocatore</th>
                <th className="px-4 py-2">Ruolo</th>
                <th className="px-4 py-2 text-right">Voto base</th>
                <th className="px-4 py-2 text-right">B/M</th>
                <th className="px-4 py-2 text-right font-medium text-white">Fantavoto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {starters.map(({ player_id }) => {
                const c = calcByPlayer.get(player_id)
                const player = c?.league_players
                const isNV = c?.fantavoto == null
                return (
                  <tr key={player_id} className={isNV ? 'opacity-50' : ''}>
                    <td className="px-6 py-2">
                      <div className="font-medium text-white">{player?.full_name ?? '—'}</div>
                      <div className="text-xs text-[#55556a]">{player?.club ?? ''}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-[#8888aa]'}`}>
                        {player?.rating_class ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[#8888aa]">
                      {c?.voto_base != null ? c.voto_base.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <BmCell breakdown={c?.bonus_malus_breakdown} total={c?.total_bonus_malus ?? null} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold">
                      <span className={isNV ? 'text-[#55556a]' : 'text-white'}>
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
                    className="bg-[#0e0e1a] px-6 py-1.5 text-xs font-medium uppercase tracking-wider text-[#55556a]"
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
                      <div className="text-[#8888aa]">{player?.full_name ?? '—'}</div>
                      <div className="text-xs text-[#55556a]">{player?.club ?? ''}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-[#55556a]'}`}>
                        {player?.rating_class ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[#55556a]">
                      {c?.voto_base != null ? c.voto_base.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[#55556a]">
                      {c?.total_bonus_malus != null
                        ? (c.total_bonus_malus >= 0 ? '+' : '') + c.total_bonus_malus.toFixed(1)
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[#55556a]">
                      {c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'}
                      {c?.is_override && (
                        <span className="ml-1 text-xs text-orange-400" title="Override manuale">★</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {lineupPlayers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-sm text-[#55556a]">
                    Nessuna formazione registrata per questa giornata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
