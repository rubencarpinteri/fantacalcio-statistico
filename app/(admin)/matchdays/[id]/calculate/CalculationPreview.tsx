'use client'

import { Fragment, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { triggerCalculationAction, publishCalculationAction } from './actions'
import type { CompetitionCascadeResult } from './actions'
import type { BonusMalusItem } from '@/domain/engine/v1/types'

// ---- Types -------------------------------------------------

export interface CalcPlayerRow {
  id: string
  player_id: string
  is_provisional: boolean
  minutes_factor: number | null
  z_combined: number | null
  z_sofascore: number | null
  z_fotmob: number | null
  z_adjusted: number | null
  b0: number | null
  role_multiplier: number | null
  b1: number | null
  defensive_correction: number | null
  voto_base: number | null
  bonus_malus_breakdown: unknown
  total_bonus_malus: number | null
  fantavoto: number | null
  is_override: boolean
  weights_used: unknown
  league_players: { full_name: string; club: string; rating_class: string } | null
}

interface Props {
  matchdayId: string
  matchdayStatus: string
  currentRunId: string | null
  currentRunStatus: string | null
  calcs: CalcPlayerRow[]
  canTrigger: boolean
  canPublish: boolean
}

// ---- Helpers -----------------------------------------------

function fmt(n: number | null, dp = 2): string {
  if (n === null) return '—'
  return n.toFixed(dp)
}

function fmtFv(n: number | null): string {
  if (n === null) return 'NV'
  return n.toFixed(2)
}

function rcBadge(rc: string) {
  const colors: Record<string, string> = {
    GK: 'text-yellow-400',
    DEF: 'text-blue-400',
    MID: 'text-green-400',
    ATT: 'text-red-400',
  }
  return <span className={`font-mono text-xs font-bold ${colors[rc] ?? 'text-[#8888aa]'}`}>{rc}</span>
}

// ---- Breakdown tooltip -------------------------------------

function BMBreakdown({ breakdown }: { breakdown: BonusMalusItem[] }) {
  if (!breakdown || breakdown.length === 0) return <span className="text-[#55556a]">—</span>
  return (
    <span className="cursor-help border-b border-dotted border-[#55556a] text-white" title={
      breakdown.map((b) => `${b.label}: ${b.quantity > 1 ? `${b.quantity}×` : ''}${b.points_each > 0 ? '+' : ''}${b.points_each} = ${b.total > 0 ? '+' : ''}${b.total}`).join('\n')
    }>
      {breakdown.reduce((acc, b) => acc + b.total, 0) >= 0 ? '+' : ''}
      {breakdown.reduce((acc, b) => acc + b.total, 0).toFixed(1)}
    </span>
  )
}

// ---- Main component ----------------------------------------

export function CalculationPreview({
  matchdayId,
  currentRunId,
  currentRunStatus,
  calcs,
  canTrigger,
  canPublish,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<string | null>(null)
  const [compResults, setCompResults] = useState<CompetitionCascadeResult[]>([])
  const [filterNV, setFilterNV] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const handleTrigger = () => {
    setTriggerResult(null)
    startTransition(async () => {
      const result = await triggerCalculationAction(matchdayId)
      if (result.error) {
        setTriggerResult(`Errore: ${result.error}`)
      } else {
        const parts = [
          `Run #${result.run_number} creato`,
          `${result.scored_count} calcolati`,
          `${result.skipped_count} saltati`,
        ]
        if (result.override_count > 0) parts.push(`${result.override_count} override applicati ★`)
        setTriggerResult(parts.join(' — ') + '.')
      }
    })
  }

  const handlePublish = () => {
    if (!currentRunId) return
    setPublishResult(null)
    setCompResults([])
    startTransition(async () => {
      const result = await publishCalculationAction(matchdayId, currentRunId)
      if (result.error) {
        setPublishResult(`Errore: ${result.error}`)
      } else {
        setPublishResult('Punteggi pubblicati. La giornata è ora in stato "published".')
        setCompResults(result.competitions_updated)
      }
    })
  }

  const displayed = filterNV ? calcs.filter((c) => c.fantavoto !== null) : calcs
  const scoredCount = calcs.filter((c) => c.fantavoto !== null).length
  const nvCount = calcs.length - scoredCount

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {canTrigger && (
              <button
                onClick={handleTrigger}
                disabled={isPending}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {isPending ? 'Calcolo in corso…' : currentRunId ? 'Ricalcola (nuovo run)' : 'Calcola punteggi'}
              </button>
            )}

            {canPublish && currentRunStatus !== 'published' && (
              <button
                onClick={handlePublish}
                disabled={isPending || calcs.length === 0}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                {isPending ? 'Pubblicazione…' : 'Pubblica run attivo'}
              </button>
            )}

            {currentRunStatus === 'published' && (
              <span className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2 text-sm text-green-400">
                ✓ Run pubblicato
              </span>
            )}
          </div>

          {triggerResult && (
            <p className={`mt-3 text-sm ${triggerResult.startsWith('Errore') ? 'text-red-400' : 'text-green-400'}`}>
              {triggerResult}
            </p>
          )}
          {publishResult && (
            <p className={`mt-3 text-sm ${publishResult.startsWith('Errore') ? 'text-red-400' : 'text-green-400'}`}>
              {publishResult}
            </p>
          )}
          {compResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {compResults.map((cr) => (
                <div key={cr.round_id} className="flex items-baseline gap-2 text-xs">
                  <span className={cr.error ? 'text-red-400' : 'text-emerald-400'}>
                    {cr.error ? '✗' : '✓'}
                  </span>
                  <span className="text-[#8888aa]">
                    {cr.competition_name} — {cr.round_name}
                  </span>
                  {cr.error && (
                    <span className="text-red-400">{cr.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results table */}
      {calcs.length > 0 && (
        <Card>
          <CardHeader
            title={
              <div className="flex items-center gap-4">
                <span>Risultati run attivo</span>
                <span className="text-sm font-normal text-[#8888aa]">
                  {scoredCount} calcolati · {nvCount} NV/senza voti
                </span>
              </div>
            }
          />
          <CardContent className="p-0">
            {/* Filters */}
            <div className="flex items-center gap-3 border-b border-[#2e2e42] px-6 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#8888aa]">
                <input
                  type="checkbox"
                  checked={filterNV}
                  onChange={(e) => setFilterNV(e.target.checked)}
                  className="rounded border-[#2e2e42] bg-[#111118]"
                />
                Nascondi NV
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42] text-left text-xs text-[#55556a]">
                    <th className="px-6 py-2.5 sticky left-0 bg-[#111118]">Giocatore</th>
                    <th className="px-4 py-2.5">Classe</th>
                    <th className="px-4 py-2.5 text-right">Min·F</th>
                    <th className="px-4 py-2.5 text-right">Ẑ</th>
                    <th className="px-4 py-2.5 text-right">Voto base</th>
                    <th className="px-4 py-2.5 text-right">B/M</th>
                    <th className="px-4 py-2.5 text-right font-bold text-white">Fantavoto</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2e]">
                  {displayed.map((c) => {
                    const player = c.league_players
                    const isNV = c.fantavoto === null
                    const breakdown = c.bonus_malus_breakdown as BonusMalusItem[] | null
                    const isExpanded = expandedRow === c.id

                    return (
                      <Fragment key={c.id}>
                        <tr
                          className={`${isNV ? 'opacity-50' : ''} hover:bg-[#1a1a2a] cursor-pointer`}
                          onClick={() => setExpandedRow(isExpanded ? null : c.id)}
                        >
                          <td className="px-6 py-2.5 sticky left-0 bg-[#111118]">
                            <div className="font-medium text-white">{player?.full_name ?? '—'}</div>
                            <div className="text-xs text-[#55556a]">{player?.club ?? ''}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            {rcBadge(player?.rating_class ?? '')}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#8888aa]">
                            {c.minutes_factor !== null ? `×${c.minutes_factor.toFixed(1)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#8888aa]">
                            {fmt(c.z_combined)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#8888aa]">
                            {fmt(c.voto_base)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono">
                            {breakdown ? <BMBreakdown breakdown={breakdown} /> : <span className="text-[#55556a]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">
                            <span className={isNV ? 'text-[#55556a]' : 'text-white'}>
                              {fmtFv(c.fantavoto)}
                            </span>
                            {c.is_provisional && (
                              <span className="ml-1.5 text-xs text-amber-400">~</span>
                            )}
                            {c.is_override && (
                              <span className="ml-1.5 text-xs text-orange-400">★</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-[#55556a]">
                            {isExpanded ? '▲' : '▼'}
                          </td>
                        </tr>

                        {/* Expanded breakdown row */}
                        {isExpanded && (
                          <tr className="bg-[#0e0e1a]">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
                                {[
                                  ['SofaScore z', fmt(c.z_sofascore)],
                                  ['FotMob z', fmt(c.z_fotmob)],
                                  ['z_combined', fmt(c.z_combined)],
                                  ['z_adjusted', fmt(c.z_adjusted)],
                                  ['b0 (6 + z_adj)', fmt(c.b0)],
                                  ['role_mult', fmt(c.role_multiplier, 2)],
                                  ['b1', fmt(c.b1)],
                                  ['def_correction', fmt(c.defensive_correction)],
                                  ['voto_base', fmt(c.voto_base)],
                                  ['tot B/M', fmt(c.total_bonus_malus)],
                                  ['fantavoto', fmtFv(c.fantavoto)],
                                ].map(([label, value]) => (
                                  <div key={label} className="flex justify-between gap-2">
                                    <span className="text-[#55556a]">{label}</span>
                                    <span className="font-mono text-[#8888aa]">{value}</span>
                                  </div>
                                ))}
                              </div>

                              {breakdown && breakdown.length > 0 && (
                                <div className="mt-3 border-t border-[#2e2e42] pt-3">
                                  <p className="mb-1.5 text-xs font-medium text-[#55556a] uppercase tracking-wider">Bonus/Malus</p>
                                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                                    {breakdown.map((b) => (
                                      <span key={b.label} className="text-xs">
                                        <span className="text-[#8888aa]">{b.label}</span>{' '}
                                        {b.quantity > 1 && <span className="font-mono text-[#55556a]">{b.quantity}× </span>}
                                        <span className={`font-mono font-bold ${b.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                          {b.total >= 0 ? '+' : ''}{b.total.toFixed(1)}
                                        </span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {calcs.length === 0 && !canTrigger && (
        <p className="text-sm text-[#55556a]">
          Nessun calcolo disponibile. Porta la giornata in &quot;scoring&quot; per iniziare.
        </p>
      )}
    </div>
  )
}
