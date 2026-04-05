'use client'

import { Fragment, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { triggerCalculationAction, publishCalculationAction } from './actions'
import type { CompetitionCascadeResult } from './actions'
import type { BonusMalusItem } from '@/domain/engine/v1/types'
import { upsertStatsAction } from '../stats/actions'

// ---- Types -------------------------------------------------

export interface CalcPlayerRow {
  id: string
  player_id: string
  is_provisional: boolean
  z_fotmob: number | null
  minutes_factor: number | null
  z_adjusted: number | null
  b0: number | null
  role_multiplier: number | null
  b1: number | null
  voto_base: number | null
  bonus_malus_breakdown: unknown
  total_bonus_malus: number | null
  fantavoto: number | null
  is_override: boolean
  league_players: { full_name: string; club: string; rating_class: string } | null
}

export interface PlayerStatSnapshot {
  minutes_played: number
  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  goals_conceded: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  clean_sheet: boolean
  is_provisional: boolean
}

interface Props {
  matchdayId: string
  matchdayStatus: string
  currentRunId: string | null
  currentRunStatus: string | null
  calcs: CalcPlayerRow[]
  canTrigger: boolean
  canPublish: boolean
  playerStats: Record<string, PlayerStatSnapshot>
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

// ---- Inline stat edit modal --------------------------------

function EditStatsModal({
  playerName,
  playerId,
  matchdayId,
  initial,
  onClose,
  onSaved,
}: {
  playerName: string
  playerId: string
  matchdayId: string
  initial: PlayerStatSnapshot
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ ...initial })
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const n = (field: keyof typeof form, label: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#8888aa]">{label}</label>
      <input
        type="number"
        min={0}
        value={form[field] as number}
        onChange={(e) => setForm((prev) => ({ ...prev, [field]: Number(e.target.value) || 0 }))}
        className="w-full rounded border border-[#2e2e42] bg-[#1a1a24] px-2 py-1.5 text-center text-sm text-white focus:border-indigo-500 focus:outline-none"
      />
    </div>
  )

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await upsertStatsAction({
        matchday_id: matchdayId,
        rows: [{
          player_id: playerId,
          minutes_played: form.minutes_played,
          goals_scored: form.goals_scored,
          assists: form.assists,
          own_goals: form.own_goals,
          yellow_cards: form.yellow_cards,
          red_cards: form.red_cards,
          goals_conceded: form.goals_conceded,
          penalties_scored: form.penalties_scored,
          penalties_missed: form.penalties_missed,
          penalties_saved: form.penalties_saved,
          clean_sheet: form.clean_sheet,
          is_provisional: form.is_provisional,
          has_decisive_event: form.goals_scored > 0 || form.assists > 0 || form.yellow_cards > 0 || form.red_cards > 0 || form.penalties_scored > 0 || form.penalties_missed > 0 || form.penalties_saved > 0,
          rating_class_override: null,
          sofascore_rating: null,
          fotmob_rating: null,
          // Defensive/advanced fields not editable in this modal — preserve via 0/null defaults
          tackles_won: 0,
          interceptions: 0,
          clearances: 0,
          blocks: 0,
          aerial_duels_won: 0,
          dribbled_past: 0,
          saves: 0,
          error_leading_to_goal: 0,
          key_passes: null,
          expected_assists: null,
          successful_dribbles: null,
          dribble_success_rate: null,
          completed_passes: null,
          pass_accuracy: null,
          final_third_passes: null,
          progressive_passes: null,
        }],
      })
      if (result.error) {
        setError(result.error)
      } else {
        onSaved()
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[#2e2e42] bg-[#111118] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">{playerName}</h3>
            <p className="text-xs text-[#55556a]">Modifica bonus/malus</p>
          </div>
          <button onClick={onClose} className="text-[#55556a] hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {n('minutes_played', 'Minuti')}
          {n('goals_scored', 'Gol')}
          {n('assists', 'Assist')}
          {n('own_goals', 'Autogol')}
          {n('yellow_cards', 'Gialli')}
          {n('red_cards', 'Rossi')}
          {n('goals_conceded', 'Gol Sub.')}
          {n('penalties_scored', 'Rig. Segn.')}
          {n('penalties_missed', 'Rig. Err.')}
          {n('penalties_saved', 'Rig. Par.')}
        </div>

        <div className="mb-4 flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8888aa]">
            <input
              type="checkbox"
              checked={form.clean_sheet}
              onChange={(e) => setForm((prev) => ({ ...prev, clean_sheet: e.target.checked }))}
              className="rounded border-[#2e2e42] bg-[#1a1a24] accent-indigo-500"
            />
            Clean sheet
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[#8888aa]">
            <input
              type="checkbox"
              checked={form.is_provisional}
              onChange={(e) => setForm((prev) => ({ ...prev, is_provisional: e.target.checked }))}
              className="rounded border-[#2e2e42] bg-[#1a1a24] accent-indigo-500"
            />
            Provvisorio
          </label>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {isPending ? 'Salvo…' : 'Salva'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#2e2e42] px-3 py-2 text-sm text-[#8888aa] hover:text-white"
          >
            Annulla
          </button>
        </div>

        <p className="mt-3 text-xs text-amber-400/70">
          Ricalcola i punteggi dopo aver salvato per aggiornare il fantavoto.
        </p>
      </div>
    </div>
  )
}

// ---- Main component ----------------------------------------

export function CalculationPreview({
  matchdayId,
  matchdayStatus,
  currentRunId,
  currentRunStatus,
  calcs,
  canTrigger,
  canPublish,
  playerStats,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [triggerResult, setTriggerResult] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<string | null>(null)
  const [compResults, setCompResults] = useState<CompetitionCascadeResult[]>([])
  const [filterNV, setFilterNV] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [editingPlayer, setEditingPlayer] = useState<{ id: string; name: string } | null>(null)
  const [savedPlayers, setSavedPlayers] = useState<Set<string>>(new Set())

  const isEditable = matchdayStatus === 'scoring'

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

  const defaultStat = (playerId: string): PlayerStatSnapshot => playerStats[playerId] ?? {
    minutes_played: 0, goals_scored: 0, assists: 0, own_goals: 0,
    yellow_cards: 0, red_cards: 0, goals_conceded: 0,
    penalties_scored: 0, penalties_missed: 0, penalties_saved: 0,
    clean_sheet: false, is_provisional: false,
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
              {savedPlayers.size > 0 && (
                <span className="text-xs text-amber-400">
                  {savedPlayers.size} stat{savedPlayers.size > 1 ? 'istiche' : 'istica'} modificat{savedPlayers.size > 1 ? 'e' : 'a'} — ricalcola per aggiornare
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42] text-left text-xs text-[#55556a]">
                    <th className="px-6 py-2.5 sticky left-0 bg-[#111118]">Giocatore</th>
                    <th className="px-4 py-2.5">Classe</th>
                    <th className="px-4 py-2.5 text-right">Min·F</th>
                    <th className="px-4 py-2.5 text-right">z FM</th>
                    <th className="px-4 py-2.5 text-right">Voto base</th>
                    <th className="px-4 py-2.5 text-right">B/M</th>
                    <th className="px-4 py-2.5 text-right font-bold text-white">Fantavoto</th>
                    <th className="px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2e]">
                  {displayed.map((c) => {
                    const player = c.league_players
                    const isNV = c.fantavoto === null
                    const breakdown = c.bonus_malus_breakdown as BonusMalusItem[] | null
                    const isExpanded = expandedRow === c.id
                    const wasEdited = savedPlayers.has(c.player_id)

                    // no_ratings_exception: played ≥10 min, FotMob rating not yet available (e.g. live match)
                    const isNoRatings = c.fantavoto !== null && c.z_fotmob === null && c.minutes_factor !== null

                    return (
                      <Fragment key={c.id}>
                        <tr
                          className={`${isNV ? 'opacity-50' : ''} ${wasEdited ? 'bg-amber-500/5' : ''} hover:bg-[#1a1a2a] cursor-pointer`}
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
                            {fmt(c.z_fotmob)}
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
                            {isNoRatings && (
                              <span className="ml-1 text-[10px] text-sky-400/70" title="Nessun voto disponibile (partita in corso) — base 6.0">
                                ⚡
                              </span>
                            )}
                            {c.is_override && (
                              <span className="ml-1.5 text-xs text-orange-400">★</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              {isEditable && (
                                <button
                                  title="Modifica statistiche"
                                  onClick={() => setEditingPlayer({ id: c.player_id, name: player?.full_name ?? '—' })}
                                  className="rounded px-1.5 py-0.5 text-xs text-[#55556a] hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                                >
                                  ✎
                                </button>
                              )}
                              <span className="text-xs text-[#55556a]">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded breakdown row */}
                        {isExpanded && (
                          <tr className="bg-[#0e0e1a]">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
                                {[
                                  ['FotMob z', fmt(c.z_fotmob)],
                                  ['min·factor', fmt(c.minutes_factor, 2)],
                                  ['z_adjusted', fmt(c.z_adjusted)],
                                  ['b0 (6 + z_adj)', fmt(c.b0)],
                                  ['role_mult', fmt(c.role_multiplier, 2)],
                                  ['b1', fmt(c.b1)],
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
          Nessun calcolo disponibile. Porta la giornata in &quot;aperta&quot; per iniziare.
        </p>
      )}

      {/* Edit stats modal */}
      {editingPlayer && (
        <EditStatsModal
          playerName={editingPlayer.name}
          playerId={editingPlayer.id}
          matchdayId={matchdayId}
          initial={defaultStat(editingPlayer.id)}
          onClose={() => setEditingPlayer(null)}
          onSaved={() => setSavedPlayers((prev) => new Set([...prev, editingPlayer.id]))}
        />
      )}
    </div>
  )
}
