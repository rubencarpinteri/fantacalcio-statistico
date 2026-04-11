'use client'

import { useState, useTransition, useRef } from 'react'
import { adminOverrideLineupAction } from './actions'
import { QuickFetchAndCalculateButton } from '@/components/ui/QuickFetchAndCalculateButton'

// ---- Types ----------------------------------------------------------------

export interface SlotData {
  slotId: string
  positionName: string
  slotOrder: number
  isBench: boolean
  benchOrder: number | null
  allowedRoles: string[]
  playerId: string | null
  playerName: string | null
  playerClub: string | null
  playerRoles: string[]
  playerRatingClass: string | null
  fantavoto: number | null
  votoBase: number | null
  bonusMalus: Array<{ label: string; total: number }> | null
  zFotmob: number | null
  zSofascore: number | null
  minutesFactor: number | null
  roleMultiplier: number | null
  // Raw ratings as fetched from the source (before any z-score / engine transformation)
  rawFotmobRating: number | null
  rawSofascoreRating: number | null
  // Match stats from player_match_stats
  minutesPlayed: number | null
  goalsScored: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  saves: number | null
  goalsConceded: number | null
  cleanSheet: boolean | null
  // SofaScore stats
  shots: number | null
  shotsOnTarget: number | null
  bigChanceCreated: number | null
  bigChanceMissed: number | null
  blockedScoringAttempt: number | null
  xg: number | null
  xa: number | null
  keyPasses: number | null
  totalPasses: number | null
  accuratePasses: number | null
  totalLongBalls: number | null
  accurateLongBalls: number | null
  totalCrosses: number | null
  successfulDribbles: number | null
  dribbleAttempts: number | null
  touches: number | null
  ballCarries: number | null
  progressiveCarries: number | null
  dispossessed: number | null
  possessionLostCtrl: number | null
  tackles: number | null
  totalTackles: number | null
  interceptions: number | null
  clearances: number | null
  blockedShots: number | null
  duelWon: number | null
  duelLost: number | null
  aerialWon: number | null
  aerialLost: number | null
  ballRecoveries: number | null
  foulsCommitted: number | null
  wasFouled: number | null
  marketValue: number | null
  height: number | null
  assignedMantraRole: string | null
  isBenchAssignment: boolean
  benchOrderAssignment: number | null
}

export interface TeamLineupData {
  teamId: string
  teamName: string
  formationId: string
  formationName: string
  submissionId: string | null
  submissionNumber: number | null
  slots: SlotData[]
}

export interface MatchupPair {
  homeTeamId: string
  awayTeamId: string
}

interface Props {
  matchdayId: string
  matchdayStatus: string
  teamLineups: TeamLineupData[]
  matchups: MatchupPair[]
}

// ---- Role colours ----------------------------------------------------------

const ROLE_COLOR: Record<string, string> = {
  Por: 'border-yellow-500/50 text-yellow-300',
  Dc: 'border-blue-500/40 text-blue-300',
  B: 'border-blue-500/40 text-blue-300',
  Dd: 'border-blue-500/40 text-blue-300',
  Ds: 'border-blue-500/40 text-blue-300',
  M: 'border-green-500/40 text-green-300',
  C: 'border-green-500/40 text-green-300',
  E: 'border-teal-500/40 text-teal-300',
  T: 'border-orange-500/40 text-orange-300',
  W: 'border-orange-500/40 text-orange-300',
  A: 'border-red-500/40 text-red-300',
  Pc: 'border-red-500/40 text-red-300',
}

function roleColor(roles: string[]): string {
  return ROLE_COLOR[roles[0] ?? ''] ?? 'border-[#2e2e42] text-[#8888aa]'
}

function fmtFv(n: number | null): string {
  if (n === null) return 'NV'
  return n.toFixed(2)
}

// ---- Per-source voto_base helper -------------------------------------------

const RC_COLORS: Record<string, string> = {
  GK: 'text-yellow-400', DEF: 'text-blue-400', MID: 'text-green-400', ATT: 'text-red-400',
}

// NOTE: uses league default target params — actual stored voto_base from engine is authoritative
const _TARGET_MEAN = 6.0  // DEFAULT_ENGINE_CONFIG.target_mean_vote
const _TARGET_STD  = 0.75 // DEFAULT_ENGINE_CONFIG.target_vote_std
const _CLAMP_MIN   = 3.0
const _CLAMP_MAX   = 10.0

type SourceVotoBase = { value: number; raw: number; clamped: boolean }

function calcSourceVotoBase(z: number | null, mf: number | null, rm: number | null): SourceVotoBase | null {
  if (z === null || mf === null || rm === null) return null
  const b0 = _TARGET_MEAN + _TARGET_STD * z * mf
  const b1 = _TARGET_MEAN + rm * (b0 - _TARGET_MEAN)
  const clamped = b1 > _CLAMP_MAX || b1 < _CLAMP_MIN
  return { value: Math.max(_CLAMP_MIN, Math.min(_CLAMP_MAX, b1)), raw: b1, clamped }
}

// ---- Stat category helpers -------------------------------------------------

type StatEntry = { label: string; value: number | null; decimals?: number; total?: number | null }

function fmtVal(s: StatEntry): string {
  if (s.value === null) return '—'
  const base = s.decimals !== undefined ? s.value.toFixed(s.decimals) : String(s.value)
  if (s.total != null && s.total > 0) {
    const pct = Math.round((s.value / s.total) * 100)
    return `${base}/${s.total} (${pct}%)`
  }
  return base
}

function StatCategory({ title, stats }: { title: string; stats: StatEntry[] }) {
  const visible = stats.filter((s) => s.value !== null && s.value > 0)
  if (visible.length === 0) return null
  return (
    <div>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#55556a]">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0">
        {visible.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-1 py-px">
            <span className="text-[10px] text-[#8888aa] truncate">{s.label}</span>
            <span className="font-mono text-[10px] font-semibold text-white shrink-0">{fmtVal(s)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Returns only the last word of a name (family name in Italian convention)
function lastNameOnly(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? name
}

function fmtMarketValue(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`
  return `€${v}`
}

// ---- Rating colour helper --------------------------------------------------

function fvColor(fv: number | null): string {
  if (fv === null) return 'text-[#A4A9B3]'
  if (fv < 5)  return 'text-[#DC0C00]'
  if (fv < 6)  return 'text-[#ED7E07]'
  if (fv < 7)  return 'text-[#D9AF00]'
  if (fv < 8)  return 'text-[#00C424]'
  if (fv < 9)  return 'text-[#00ADC4]'
  return 'text-[#374DF5]'
}

// ---- Player detail modal ---------------------------------------------------

function PlayerDetailModal({ slot, onClose }: { slot: SlotData; onClose: () => void }) {
  const vbFm = calcSourceVotoBase(slot.zFotmob, slot.minutesFactor, slot.roleMultiplier)
  const vbSs = calcSourceVotoBase(slot.zSofascore, slot.minutesFactor, slot.roleMultiplier)
  const rcColor = RC_COLORS[slot.playerRatingClass ?? ''] ?? 'text-[#8888aa]'
  const fv = slot.fantavoto

  const hasFm = slot.rawFotmobRating !== null
  const hasSs = slot.rawSofascoreRating !== null
  const hasAnyRaw = hasFm || hasSs
  const hasStats = slot.minutesPlayed !== null

  const deltaRaw = hasFm && hasSs ? slot.rawFotmobRating! - slot.rawSofascoreRating! : null
  const deltaConverted = vbFm !== null && vbSs !== null ? vbFm.raw - vbSs.raw : null

  const aerialTotal = (slot.aerialWon !== null || slot.aerialLost !== null)
    ? ((slot.aerialWon ?? 0) + (slot.aerialLost ?? 0)) || null
    : null
  const duelTotal = (slot.duelWon !== null || slot.duelLost !== null)
    ? ((slot.duelWon ?? 0) + (slot.duelLost ?? 0)) || null
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#2e2e42] bg-[#111118] shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact header: name + RC + FV + minutes */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1e1e2e] shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-white truncate">{slot.playerName ?? '—'}</p>
              {slot.playerRatingClass && (
                <span className={`text-[10px] font-bold shrink-0 ${rcColor}`}>{slot.playerRatingClass}</span>
              )}
            </div>
            <p className="text-[11px] text-[#55556a] truncate">{slot.playerClub ?? ''}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-2xl font-black font-mono ${fvColor(fv)}`}>{fmtFv(fv)}</span>
            {slot.minutesPlayed !== null && (
              <span className="rounded border border-[#2e2e42] px-1.5 py-0.5 text-[10px] font-mono text-[#8888aa]">
                {slot.minutesPlayed}&apos;
              </span>
            )}
            <button onClick={onClose} className="text-[#55556a] hover:text-white text-xl leading-none">×</button>
          </div>
        </div>

        <div className="p-3 space-y-2.5 overflow-y-auto">
          {/* Voto base */}
          {slot.votoBase !== null && (
            <div className="text-[11px] text-[#55556a]">
              voto base <span className="font-mono text-[#8888aa]">{slot.votoBase.toFixed(2)}</span>
            </div>
          )}

          {/* Source breakdown — 2 color-coded cards */}
          {hasAnyRaw && (
            <div className={`grid gap-2 ${hasFm && hasSs ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {hasFm && (
                <div className="rounded-lg p-2" style={{ border: '1px solid rgba(4,156,100,0.3)', background: 'rgba(4,156,100,0.07)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#049c64' }}>FotMob</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-black font-mono text-white">{slot.rawFotmobRating!.toFixed(1)}</span>
                    {vbFm !== null && (
                      <span className={`text-[10px] font-mono ${vbFm.clamped ? 'text-amber-400' : 'text-[#8888aa]'}`}>
                        → {vbFm.value.toFixed(2)}{vbFm.clamped ? ' ↑' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {hasSs && (
                <div className="rounded-lg p-2" style={{ border: '1px solid rgba(55,77,245,0.3)', background: 'rgba(55,77,245,0.07)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#374DF5' }}>SofaScore</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-black font-mono text-white">{slot.rawSofascoreRating!.toFixed(1)}</span>
                    {vbSs !== null && (
                      <span className={`text-[10px] font-mono ${vbSs.clamped ? 'text-amber-400' : 'text-[#8888aa]'}`}>
                        → {vbSs.value.toFixed(2)}{vbSs.clamped ? ' ↑' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {deltaRaw !== null && deltaConverted !== null && (
                <div className="col-span-2 flex items-center justify-center gap-3 text-[10px] text-[#55556a]">
                  <span>Δ FM−SS</span>
                  <span className={`font-mono ${Math.abs(deltaRaw) > 0.5 ? 'text-amber-400' : ''}`}>
                    {deltaRaw >= 0 ? '+' : ''}{deltaRaw.toFixed(1)} orig
                  </span>
                  <span className={`font-mono ${Math.abs(deltaConverted) > 0.5 ? 'text-amber-400' : ''}`}>
                    {deltaConverted >= 0 ? '+' : ''}{deltaConverted.toFixed(2)} conv
                  </span>
                </div>
              )}
              {((vbFm?.clamped ?? false) || (vbSs?.clamped ?? false)) && (
                <div className="col-span-2 rounded px-2 py-1 bg-amber-500/8 text-[9px] text-amber-400/80">
                  ↑ voto base supera il massimo (9.50) e viene limitato
                </div>
              )}
            </div>
          )}

          {/* Bonus / Malus */}
          {slot.bonusMalus && slot.bonusMalus.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {slot.bonusMalus.map((b, i) => (
                <span
                  key={i}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    b.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  {b.label} {b.total > 0 ? '+' : ''}{b.total.toFixed(1)}
                </span>
              ))}
            </div>
          )}

          {/* SofaScore stats — compact */}
          {hasStats && (
            <div className="space-y-2 rounded-lg p-2.5" style={{ border: '1px solid rgba(55,77,245,0.2)', background: '#0a0a0f' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#374DF5' }}>
                Statistiche SofaScore
              </p>

              {(slot.marketValue !== null || slot.height !== null) && (
                <div className="flex gap-1.5">
                  {slot.marketValue !== null && (
                    <span className="rounded-full border border-[#2e2e42] px-2 py-0.5 text-[10px] text-emerald-400/80 font-mono">
                      {fmtMarketValue(slot.marketValue)}
                    </span>
                  )}
                  {slot.height !== null && (
                    <span className="rounded-full border border-[#2e2e42] px-2 py-0.5 text-[10px] text-[#55556a] font-mono">
                      {slot.height} cm
                    </span>
                  )}
                </div>
              )}

              <StatCategory title="Tiro" stats={[
                { label: 'Tiri totali',        value: slot.shots },
                { label: 'In porta',           value: slot.shotsOnTarget, total: slot.shots },
                { label: 'Bloccato',           value: slot.blockedScoringAttempt },
                { label: 'Gr. chance creata',  value: slot.bigChanceCreated },
                { label: 'Gr. chance mancata', value: slot.bigChanceMissed },
                { label: 'xG',                 value: slot.xg, decimals: 2 },
              ]} />

              <StatCategory title="Passaggio" stats={[
                { label: 'Pass. chiave',   value: slot.keyPasses },
                { label: 'Pass. riusciti', value: slot.accuratePasses, total: slot.totalPasses },
                { label: 'Lanci riusciti', value: slot.accurateLongBalls, total: slot.totalLongBalls },
                { label: 'Cross',          value: slot.totalCrosses },
                { label: 'xA',             value: slot.xa, decimals: 2 },
              ]} />

              <StatCategory title="Dribbling / Palla" stats={[
                { label: 'Dribbling',       value: slot.successfulDribbles, total: slot.dribbleAttempts },
                { label: 'Tocchi',          value: slot.touches },
                { label: 'Conduzioni',      value: slot.ballCarries },
                { label: 'Cond. progr.',    value: slot.progressiveCarries },
                { label: 'Perse',           value: slot.dispossessed },
                { label: 'Poss. perso',     value: slot.possessionLostCtrl },
              ]} />

              <StatCategory title="Difesa" stats={[
                { label: 'Tackle',         value: slot.tackles, total: slot.totalTackles },
                { label: 'Intercetti',     value: slot.interceptions },
                { label: 'Respinte',       value: slot.clearances },
                { label: 'Tiri bloccati',  value: slot.blockedShots },
                { label: 'Duelli vinti',   value: slot.duelWon, total: duelTotal },
                { label: 'Aerei vinti',    value: slot.aerialWon, total: aerialTotal },
                { label: 'Recuperi',       value: slot.ballRecoveries },
                { label: 'Falli commessi', value: slot.foulsCommitted },
                { label: 'Falli subiti',   value: slot.wasFouled },
                { label: 'Parate',         value: slot.saves },
                { label: 'Gol subiti',     value: slot.goalsConceded },
              ]} />

              {!hasSs && (
                <p className="text-[10px] text-[#55556a] italic">Nessuna statistica SofaScore disponibile</p>
              )}
            </div>
          )}

          {fv === null && !hasAnyRaw && !hasStats && (
            <p className="text-xs text-[#55556a] italic">Nessun voto disponibile (NV)</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Player chip -----------------------------------------------------------

function PlayerChip({
  slot,
  isEditable,
  onDragStart,
  onDrop,
  onPlayerClick,
}: {
  slot: SlotData
  isEditable: boolean
  onDragStart: () => void
  onDrop: () => void
  onPlayerClick?: (slot: SlotData) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const color = roleColor(slot.playerRoles)
  const fv = slot.fantavoto
  const bm = slot.bonusMalus

  return (
    <div
      draggable={isEditable && slot.playerId !== null}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop() }}
      onClick={() => slot.playerId && onPlayerClick?.(slot)}
      className={[
        'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors',
        isDragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#2e2e42] bg-[#0a0a0f]',
        slot.playerId ? 'cursor-pointer hover:border-[#3e3e52]' : '',
        isEditable && slot.playerId ? 'cursor-grab active:cursor-grabbing' : '',
        slot.isBench ? 'opacity-75' : '',
      ].join(' ')}
    >
      {/* Position label */}
      <span className="shrink-0 w-10 text-[#55556a] font-mono text-[10px]">
        {slot.isBench ? `P${slot.benchOrder ?? ''}` : slot.positionName}
      </span>

      {slot.playerId ? (
        <>
          <span className={`shrink-0 font-bold text-[10px] ${color.split(' ')[1]}`}>
            {slot.playerRoles[0] ?? '?'}
          </span>
          {/* Name: last-name only on small screens, full on sm+ */}
          <span className="min-w-0 truncate text-white shrink">
            <span className="sm:hidden">{lastNameOnly(slot.playerName ?? '')}</span>
            <span className="hidden sm:inline">{slot.playerName}</span>
          </span>
          {/* Club: desktop only */}
          <span className="shrink-0 text-[#3a3a52] text-[10px] hidden sm:inline">{slot.playerClub}</span>

          {/* Right group: B/M badges + FV — pushed right with ml-auto */}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {bm && bm.length > 0 && bm.map((b, i) => (
              <span
                key={i}
                className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                  b.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                }`}
              >
                {b.label} {b.total > 0 ? '+' : ''}{b.total}
              </span>
            ))}
            <span className={`font-mono font-bold text-[11px] ${fvColor(fv)}`}>{fmtFv(fv)}</span>
          </div>
        </>
      ) : (
        <span className="text-[#3e3e52] italic flex-1">vuoto</span>
      )}
    </div>
  )
}

// ---- Single team card ------------------------------------------------------
//
// Pass bare=true when rendering inside a MatchupRow — the row provides the
// outer container so we skip the standalone border/background wrapper.

function TeamCard({
  team,
  matchdayId,
  isEditable,
  bare = false,
  onPlayerClick,
}: {
  team: TeamLineupData
  matchdayId: string
  isEditable: boolean
  bare?: boolean
  onPlayerClick?: (slot: SlotData) => void
}) {
  const [slots, setSlots] = useState<SlotData[]>(() =>
    [...team.slots].sort((a, b) => a.slotOrder - b.slotOrder)
  )
  const [isDirty, setIsDirty] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const dragSlotId = useRef<string | null>(null)

  const titolari = slots.filter((s) => !s.isBench)
  const panchina = slots.filter((s) => s.isBench).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))

  function handleDragStart(slotId: string) {
    dragSlotId.current = slotId
  }

  function handleDrop(targetSlotId: string) {
    const fromId = dragSlotId.current
    dragSlotId.current = null
    if (!fromId || fromId === targetSlotId) return

    setSlots((prev) => {
      const next = [...prev]
      const fromIdx = next.findIndex((s) => s.slotId === fromId)
      const toIdx = next.findIndex((s) => s.slotId === targetSlotId)
      if (fromIdx === -1 || toIdx === -1) return prev

      const fromSlot = { ...next[fromIdx]! }
      const toSlot = { ...next[toIdx]! }

      const swapFields = [
        'playerId', 'playerName', 'playerClub', 'playerRoles', 'playerRatingClass',
        'fantavoto', 'votoBase', 'bonusMalus', 'assignedMantraRole',
      ] as const

      for (const field of swapFields) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tmp = (fromSlot as any)[field]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(fromSlot as any)[field] = (toSlot as any)[field]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(toSlot as any)[field] = tmp
      }

      next[fromIdx] = fromSlot
      next[toIdx] = toSlot
      return next
    })
    setIsDirty(true)
    setSaveMsg(null)
  }

  function handleSave() {
    if (!team.formationId) return
    setSaveMsg(null)
    startTransition(async () => {
      const assignments = slots
        .filter((s) => s.playerId !== null)
        .map((s) => ({
          player_id: s.playerId!,
          slot_id: s.slotId,
          is_bench: s.isBench,
          bench_order: s.isBench ? (s.benchOrder ?? null) : null,
        }))

      const result = await adminOverrideLineupAction(
        matchdayId,
        team.teamId,
        team.formationId,
        assignments
      )

      if (result.error) {
        setSaveMsg({ text: result.error, ok: false })
      } else {
        setSaveMsg({ text: `Salvato — v#${result.submissionNumber}`, ok: true })
        setIsDirty(false)
      }
    })
  }

  function handleReset() {
    setSlots([...team.slots].sort((a, b) => a.slotOrder - b.slotOrder))
    setIsDirty(false)
    setSaveMsg(null)
  }

  const inner = (
    <>
      {/* Team header (only shown in bare/standalone mode when name isn't in matchup header) */}
      {!bare && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">{team.teamName}</p>
            <p className="text-xs text-[#55556a]">
              {team.formationName}
              {team.submissionNumber !== null && ` · v#${team.submissionNumber}`}
              {isDirty && <span className="ml-2 text-indigo-400">modificato</span>}
            </p>
          </div>
          {isEditable && isDirty && (
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={isPending}
                className="rounded-lg border border-[#2e2e42] px-2.5 py-1 text-xs text-[#8888aa] hover:text-white transition-colors"
              >
                Ripristina
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* In bare mode: dirty indicator + save button in compact row */}
      {bare && isDirty && isEditable && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-indigo-400">modificato</span>
          <div className="flex gap-1.5">
            <button
              onClick={handleReset}
              disabled={isPending}
              className="rounded border border-[#2e2e42] px-2 py-0.5 text-[10px] text-[#8888aa] hover:text-white transition-colors"
            >
              Ripristina
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Salvo…' : 'Salva'}
            </button>
          </div>
        </div>
      )}

      {saveMsg && (
        <p className={`mb-2 text-xs ${saveMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
          {saveMsg.text}
        </p>
      )}

      {team.slots.length === 0 ? (
        <p className="py-4 text-center text-xs text-[#55556a]">Nessuna formazione inserita</p>
      ) : (
        <div className="space-y-3">
          {/* Titolari */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#55556a]">
              Titolari ({titolari.length})
            </p>
            <div className="grid grid-cols-1 gap-1">
              {titolari.map((slot) => (
                <PlayerChip
                  key={slot.slotId}
                  slot={slot}
                  isEditable={isEditable}
                  onDragStart={() => handleDragStart(slot.slotId)}
                  onDrop={() => handleDrop(slot.slotId)}
                  onPlayerClick={onPlayerClick}
                />
              ))}
            </div>
          </div>

          {/* Panchina */}
          {panchina.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#55556a]">
                Panchina ({panchina.length})
              </p>
              <div className="grid grid-cols-1 gap-1">
                {panchina.map((slot) => (
                  <PlayerChip
                    key={slot.slotId}
                    slot={slot}
                    isEditable={isEditable}
                    onDragStart={() => handleDragStart(slot.slotId)}
                    onDrop={() => handleDrop(slot.slotId)}
                    onPlayerClick={onPlayerClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )

  if (bare) return <div>{inner}</div>

  return (
    <div className={`rounded-xl border bg-[#0f0f1a] p-4 ${isDirty ? 'border-indigo-500/40' : 'border-[#2e2e42]'}`}>
      {inner}
    </div>
  )
}

// ---- Matchup row -----------------------------------------------------------
//
// Renders two teams side by side inside a single container card.
// The header shows both team names, formation strings, and — when a
// calculation run exists — a live score readout.

function MatchupRow({
  home,
  away,
  matchdayId,
  isEditable,
  onPlayerClick,
}: {
  home: TeamLineupData | undefined
  away: TeamLineupData | undefined
  matchdayId: string
  isEditable: boolean
  onPlayerClick?: (slot: SlotData) => void
}) {
  function teamFv(team: TeamLineupData | undefined): number | null {
    if (!team) return null
    const starters = team.slots.filter((s) => !s.isBench && s.fantavoto !== null)
    if (starters.length === 0) return null
    return starters.reduce((acc, s) => acc + (s.fantavoto ?? 0), 0)
  }

  const homeFv = teamFv(home)
  const awayFv = teamFv(away)
  const hasScores = homeFv !== null || awayFv !== null
  const homeWins = homeFv !== null && awayFv !== null && homeFv > awayFv
  const awayWins = homeFv !== null && awayFv !== null && awayFv > homeFv
  const homeFvClass = awayWins ? 'text-[#3a3a52]' : 'text-white'
  const awayFvClass = homeWins ? 'text-[#3a3a52]' : 'text-white'

  return (
    <div className="rounded-2xl border border-[#2e2e42] bg-[#0b0b14] overflow-hidden">
      {/* Match header — responsive: stacked on mobile, side-by-side on md+ */}

      {/* ── Mobile header (< md) ── */}
      <div className="md:hidden px-4 pt-4 pb-3 bg-[#0f0f1a] border-b border-[#2e2e42]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 mb-0.5">
          <p className="text-sm font-bold text-white text-right truncate min-w-0 leading-tight">{home?.teamName ?? '?'}</p>
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#2e2e42] px-1 select-none">vs</span>
          <p className="text-sm font-bold text-white text-left truncate min-w-0 leading-tight">{away?.teamName ?? '?'}</p>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-2">
          <p className="text-[10px] text-[#4a4a65] text-right truncate font-mono">{home?.formationName ?? '—'}</p>
          <span className="invisible text-[9px] px-1">vs</span>
          <p className="text-[10px] text-[#4a4a65] text-left truncate font-mono">{away?.formationName ?? '—'}</p>
        </div>
        {hasScores && (
          <div className="flex items-center justify-center pt-2 border-t border-[#1a1a2a]">
            <span className={`w-20 text-right text-xl font-black font-mono tabular-nums leading-none ${homeFvClass}`}>
              {homeFv !== null ? homeFv.toFixed(2) : 'NV'}
            </span>
            <span className="text-[#2a2a3e] text-xl font-thin px-2.5 leading-none select-none">–</span>
            <span className={`w-20 text-left text-xl font-black font-mono tabular-nums leading-none ${awayFvClass}`}>
              {awayFv !== null ? awayFv.toFixed(2) : 'NV'}
            </span>
          </div>
        )}
      </div>

      {/* ── Desktop header (≥ md) ── */}
      <div className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center px-8 py-5 bg-[#0f0f1a] border-b border-[#2e2e42]">
        {/* Home — right-aligned */}
        <div className="min-w-0 overflow-hidden text-right pr-6">
          <p className="block truncate text-2xl font-bold text-white tracking-tight leading-tight">{home?.teamName ?? '?'}</p>
          <p className="block truncate text-[11px] text-[#4a4a65] mt-1 font-mono">{home?.formationName ?? '—'}</p>
        </div>

        {/* Score — fixed-width spans keep the separator at the geometric center */}
        <div className="shrink-0 flex items-center">
          {hasScores ? (
            <>
              <span className={`w-24 text-right text-3xl font-black font-mono tabular-nums leading-none ${homeFvClass}`}>
                {homeFv !== null ? homeFv.toFixed(2) : 'NV'}
              </span>
              <span className="text-[#2a2a3e] text-3xl font-thin px-3 leading-none select-none">–</span>
              <span className={`w-24 text-left text-3xl font-black font-mono tabular-nums leading-none ${awayFvClass}`}>
                {awayFv !== null ? awayFv.toFixed(2) : 'NV'}
              </span>
            </>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#3a3a52] px-6">vs</span>
          )}
        </div>

        {/* Away — left-aligned */}
        <div className="min-w-0 overflow-hidden pl-6">
          <p className="block truncate text-2xl font-bold text-white tracking-tight leading-tight">{away?.teamName ?? '?'}</p>
          <p className="block truncate text-[11px] text-[#4a4a65] mt-1 font-mono">{away?.formationName ?? '—'}</p>
        </div>
      </div>

      {/* Side-by-side formations (stacks on mobile) */}
      <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-y-0 md:divide-x divide-[#1e1e2e]">
        <div className="p-4">
          {home
            ? <TeamCard team={home} matchdayId={matchdayId} isEditable={isEditable} bare onPlayerClick={onPlayerClick} />
            : <p className="py-10 text-center text-xs text-[#55556a]">Nessuna formazione</p>
          }
        </div>
        <div className="p-4">
          {away
            ? <TeamCard team={away} matchdayId={matchdayId} isEditable={isEditable} bare onPlayerClick={onPlayerClick} />
            : <p className="py-10 text-center text-xs text-[#55556a]">Nessuna formazione</p>
          }
        </div>
      </div>
    </div>
  )
}

// ---- Main component --------------------------------------------------------

export function AllLineupsClient({ matchdayId, matchdayStatus, teamLineups, matchups }: Props) {
  const isEditable = matchdayStatus !== 'archived'
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  const teamMap = new Map(teamLineups.map((t) => [t.teamId, t]))

  // ── Matchup layout (when competition matchups are available) ──────────────
  if (matchups.length > 0) {
    const pairedIds = new Set(matchups.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
    const unpaired = teamLineups.filter((t) => !pairedIds.has(t.teamId))

    return (
      <>
        {/* Match nav — desktop: tabs + button inline; mobile: button above, vertical list below */}
        <div>
          {/* ── Desktop (sm+): horizontal pills + button ── */}
          <div className="hidden sm:flex items-center gap-2">
            {matchups.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5">
                {matchups.map((m, i) => {
                  const home = teamMap.get(m.homeTeamId)
                  const away = teamMap.get(m.awayTeamId)
                  const isActive = activeMatchIndex === i
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveMatchIndex(i)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-medium border transition-colors ${
                        isActive
                          ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                          : 'bg-[#0f0f1a] text-[#8888aa] border-[#2e2e42] hover:text-white hover:border-[#3e3e52]'
                      }`}
                    >
                      {home?.teamName ?? '?'} <span className="opacity-40">vs</span> {away?.teamName ?? '?'}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="shrink-0 ml-auto">
              <QuickFetchAndCalculateButton matchdayId={matchdayId} compact />
            </div>
          </div>

          {/* ── Mobile (< sm): button row + vertical list ── */}
          <div className="sm:hidden flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <QuickFetchAndCalculateButton matchdayId={matchdayId} compact />
            </div>
            {matchups.length > 1 && (
              <div className="flex flex-col gap-1">
                {matchups.map((m, i) => {
                  const home = teamMap.get(m.homeTeamId)
                  const away = teamMap.get(m.awayTeamId)
                  const isActive = activeMatchIndex === i
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveMatchIndex(i)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-[11px] font-medium border transition-colors ${
                        isActive
                          ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                          : 'bg-[#0f0f1a] text-[#8888aa] border-[#2e2e42] hover:text-white hover:border-[#3e3e52]'
                      }`}
                    >
                      {home?.teamName ?? '?'} <span className="opacity-40">vs</span> {away?.teamName ?? '?'}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Carousel: one match at a time with slide animation */}
        <div className="overflow-hidden rounded-2xl">
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${activeMatchIndex * 100}%)` }}
          >
            {matchups.map((m, i) => (
              <div key={i} className="w-full shrink-0">
                <MatchupRow
                  home={teamMap.get(m.homeTeamId)}
                  away={teamMap.get(m.awayTeamId)}
                  matchdayId={matchdayId}
                  isEditable={isEditable}
                  onPlayerClick={setSelectedSlot}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dot indicators */}
        {matchups.length > 1 && (
          <div className="flex justify-center gap-1.5 pt-1">
            {matchups.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveMatchIndex(i)}
                className={`rounded-full transition-all duration-200 ${
                  activeMatchIndex === i
                    ? 'w-4 h-1.5 bg-indigo-400'
                    : 'w-1.5 h-1.5 bg-[#2e2e42] hover:bg-[#4e4e62]'
                }`}
              />
            ))}
          </div>
        )}

        {unpaired.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs uppercase tracking-widest text-[#55556a]">Senza incontro</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {unpaired.map((t) => (
                <TeamCard key={t.teamId} team={t} matchdayId={matchdayId} isEditable={isEditable} onPlayerClick={setSelectedSlot} />
              ))}
            </div>
          </div>
        )}

        {selectedSlot && (
          <PlayerDetailModal slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
        )}
      </>
    )
  }

  // ── Fallback: plain grid (no matchup data configured) ────────────────────
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teamLineups.map((team) => (
          <TeamCard
            key={team.teamId}
            team={team}
            matchdayId={matchdayId}
            isEditable={isEditable}
            onPlayerClick={setSelectedSlot}
          />
        ))}
      </div>
      {selectedSlot && (
        <PlayerDetailModal slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
      )}
    </>
  )
}
