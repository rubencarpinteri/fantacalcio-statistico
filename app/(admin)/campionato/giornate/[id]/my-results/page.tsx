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
    redirect(`/campionato/giornate/${matchdayId}/results`)
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
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">Non sei associato a nessuna squadra in questa lega.</p>
      </div>
    )
  }

  if (!['published', 'archived'].includes(matchday.status)) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">
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
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">Nessun calcolo pubblicato per questa giornata.</p>
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
      .eq('team_id', myTeam.id)
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
      .eq('team_id', myTeam.id)
      .maybeSingle(),
  ])

  if (!myScore) {
    return (
      <div className="space-y-4">
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <p className="text-sm text-ink-4">
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
      .eq('submission_id', lineupPointer.submission_id)
    lineupPlayers = (data ?? []) as LineupSlot[]
  }

  // Fetch full calculation breakdown for my lineup players
  type CalcRow = {
    player_id: string
    fantavoto: number | null
    voto_base: number | null
    bonus_malus_breakdown: unknown
    total_bonus_malus: number | null
    is_override: boolean
    is_provisional: boolean
    // Engine intermediates
    z_rating: number | null
    z_combined: number | null
    weights_used: unknown
    minutes_factor: number | null
    z_adjusted: number | null
    b0: number | null
    role_multiplier: number | null
    b1: number | null
    defensive_correction: number | null
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
        z_rating,
        z_combined,
        weights_used,
        minutes_factor,
        z_adjusted,
        b0,
        role_multiplier,
        b1,
        defensive_correction,
        league_players ( full_name, club, rating_class )
      `)
      .eq('run_id', ptr.run_id)
      .in('player_id', myPlayerIds)
    for (const c of calcs ?? []) {
      calcByPlayer.set(c.player_id, c as unknown as CalcRow)
    }
  }

  const starters = lineupPlayers.filter((p) => !p.is_bench)
  const bench = lineupPlayers
    .filter((p) => p.is_bench)
    .sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))

  const rcColors: Record<string, string> = {
    GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
  }

  const fmtDate = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : null

  const n2 = (v: number | null) => (v !== null ? v.toFixed(2) : '—')
  const n3 = (v: number | null) => (v !== null ? v.toFixed(3) : '—')
  const sign = (v: number) => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2))

  function PlayerRow({ player_id, isBench }: { player_id: string; isBench: boolean }) {
    const c = calcByPlayer.get(player_id)
    const player = c?.league_players
    const isNV = !c || c.fantavoto == null
    const bmItems = Array.isArray(c?.bonus_malus_breakdown) ? (c.bonus_malus_breakdown as BonusMalusItem[]) : []
    const weights = (c?.weights_used ?? {}) as Record<string, number>

    const dimCls = isBench ? 'opacity-50' : ''

    return (
      <tr key={player_id} className={`${dimCls} ${isNV && !isBench ? 'opacity-60' : ''}`}>
        <td colSpan={5} className="p-0">
          <details className="group">
            <summary className="grid cursor-pointer grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-6 py-2.5 hover:bg-glass-1 list-none [&::-webkit-details-marker]:hidden">
              {/* Player name + club */}
              <div>
                <div className={`font-medium ${isBench ? 'text-ink-3' : 'text-ink-1'}`}>
                  {player?.full_name ?? '—'}
                </div>
                <div className="text-xs text-ink-4">{player?.club ?? ''}</div>
              </div>
              {/* Role */}
              <div className="w-10 text-right">
                <span className={`font-mono text-xs font-bold ${rcColors[player?.rating_class ?? ''] ?? 'text-ink-3'}`}>
                  {player?.rating_class ?? '—'}
                </span>
              </div>
              {/* Voto base */}
              <div className="w-16 text-right font-mono text-sm text-ink-3">
                {c?.voto_base != null ? c.voto_base.toFixed(1) : '—'}
              </div>
              {/* B/M */}
              <div className="w-12 text-right font-mono text-sm text-ink-3">
                {c?.total_bonus_malus != null
                  ? (c.total_bonus_malus >= 0 ? '+' : '') + c.total_bonus_malus.toFixed(1)
                  : '—'}
              </div>
              {/* Fantavoto */}
              <div className="w-20 text-right">
                <span className={`font-mono font-bold text-sm ${isBench ? 'text-ink-4' : isNV ? 'text-ink-4' : 'text-ink-1'}`}>
                  {c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'}
                </span>
                {c?.is_provisional && (
                  <span className="ml-1 text-xs text-amber-400" title="Provvisorio">~</span>
                )}
                {c?.is_override && (
                  <span className="ml-1 text-xs text-orange-400" title="Override manuale">★</span>
                )}
                <span className="ml-1.5 text-xs text-ink-5 group-open:text-indigo-400">▾</span>
              </div>
            </summary>

            {/* Breakdown panel */}
            <tr className="hidden group-open:table-row">
              <td colSpan={5} className="border-b border-hairline bg-[#080810] px-6 py-3">
                {isNV && c == null ? (
                  <p className="text-xs text-ink-4">Nessun calcolo disponibile per questo giocatore.</p>
                ) : isNV ? (
                  <p className="text-xs text-ink-4">Giocatore NV — non ha partecipato o nessun voto disponibile.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                    {/* Z-score pipeline */}
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">Pipeline z-score</p>
                      <div className="space-y-1 font-mono text-xs">
                        <BreakdownRow label="z FotMob"    value={n3(c?.z_rating ?? null)}    dim={c?.z_rating == null} />
                        <BreakdownRow label="fattore min."  value={c?.minutes_factor != null ? `× ${c.minutes_factor.toFixed(1)}` : '—'} />
                        <BreakdownRow label="z rettificato" value={n3(c?.z_adjusted   ?? null)} />
                      </div>
                    </div>

                    {/* Score pipeline */}
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">Calcolo punteggio</p>
                      <div className="space-y-1 font-mono text-xs">
                        <BreakdownRow label="b₀"             value={n2(c?.b0 ?? null)} />
                        <BreakdownRow label="molt. ruolo"    value={c?.role_multiplier != null ? `× ${c.role_multiplier.toFixed(2)}` : '—'} />
                        <BreakdownRow label="b₁"             value={n2(c?.b1 ?? null)} />
                        {(c?.defensive_correction ?? 0) !== 0 && (
                          <BreakdownRow label="corr. difensiva" value={sign(c!.defensive_correction!)} color={c!.defensive_correction! >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                        )}
                        <BreakdownRow label="voto base" value={c?.voto_base != null ? c.voto_base.toFixed(1) : '—'} highlight />
                        <div className="my-1 border-t border-hairline" />
                        {bmItems.length > 0 ? (
                          bmItems.map((bm, i) => (
                            <BreakdownRow
                              key={i}
                              label={bm.quantity > 1 ? `${bm.label} ×${bm.quantity}` : bm.label}
                              value={bm.total >= 0 ? `+${bm.total.toFixed(1)}` : bm.total.toFixed(1)}
                              color={bm.total >= 0 ? 'text-emerald-400' : 'text-red-400'}
                            />
                          ))
                        ) : (
                          <BreakdownRow label="bonus/malus" value="—" dim />
                        )}
                        <div className="my-1 border-t border-hairline" />
                        <BreakdownRow label="fantavoto" value={c?.fantavoto != null ? c.fantavoto.toFixed(2) : 'NV'} highlight />
                        {c?.is_override && (
                          <p className="mt-1 text-[10px] text-orange-400">★ Override manuale applicato</p>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </td>
            </tr>
          </details>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <a href={`/campionato/giornate/${matchdayId}`} className="text-sm text-ink-4 hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-ink-1">I miei risultati</h1>
        {run && (
          <p className="mt-0.5 text-xs text-ink-4">
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
            <span className="font-mono text-lg font-bold text-ink-1">
              {Number(myScore.total_fantavoto).toFixed(2)}
            </span>
          }
        />
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-4">
                <th className="px-6 py-2">Giocatore</th>
                <th className="px-2 py-2 text-right w-10">Ruolo</th>
                <th className="px-2 py-2 text-right w-16">V. base</th>
                <th className="px-2 py-2 text-right w-12">B/M</th>
                <th className="px-2 py-2 text-right w-20 pr-6">Fantavoto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {starters.map(({ player_id }) => (
                <PlayerRow key={player_id} player_id={player_id} isBench={false} />
              ))}

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

              {bench.map(({ player_id }) => (
                <PlayerRow key={player_id} player_id={player_id} isBench={true} />
              ))}

              {lineupPlayers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-3 text-sm text-ink-4">
                    Nessuna formazione registrata per questa giornata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-hairline px-6 py-2.5">
            <p className="text-xs text-ink-4">
              Clicca su un giocatore per vedere il dettaglio del calcolo z-score e bonus/malus.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function BreakdownRow({
  label,
  value,
  suffix,
  dim,
  color,
  highlight,
}: {
  label: string
  value: string
  suffix?: string
  dim?: boolean
  color?: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-4">{label}</span>
      <span className="flex items-center gap-1.5">
        {suffix && <span className="text-ink-5">{suffix}</span>}
        <span className={color ?? (highlight ? 'text-white font-semibold' : dim ? 'text-ink-5' : 'text-[#c8c8e8]')}>
          {value}
        </span>
      </span>
    </div>
  )
}
