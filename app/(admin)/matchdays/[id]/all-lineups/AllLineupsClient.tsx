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
  homeGoals: number | null
  awayGoals: number | null
}

interface Props {
  matchdayId: string
  matchdayStatus: string
  teamLineups: TeamLineupData[]
  matchups: MatchupPair[]
}

// ---- Role colours ----------------------------------------------------------
//
// Soft, calm role tints — calibrated for dark glass surfaces.

const ROLE_TINT: Record<string, string> = {
  Por: '#d6a93b',
  Dc: '#5a8fd6', B: '#5a8fd6', Dd: '#5a8fd6', Ds: '#5a8fd6',
  M: '#4ea88a',  C: '#4ea88a',
  E: '#e08a52',  T: '#e08a52', W: '#e08a52',
  A: '#d96b6b',  Pc: '#d96b6b',
}

function roleTint(role: string | undefined): string {
  return ROLE_TINT[role ?? ''] ?? '#9095b8'
}

// Initials avatar — soft pastel gradient deterministic from name
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = (name || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 60% 88%), hsl(${(hue + 40) % 360} 65% 80%))`,
        color: `hsl(${hue} 50% 28%)`,
        fontSize: Math.round(size * 0.38),
        border: '1px solid rgba(20,24,60,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 2px rgba(20,24,60,0.06)',
      }}
    >
      {initials}
    </span>
  )
}

// Single-letter role chip with role-tinted hairline
function RoleTag({ role }: { role: string | undefined }) {
  if (!role) return <span className="inline-block w-[22px]" />
  const color = roleTint(role)
  return (
    <span
      className="inline-flex items-center justify-center rounded-md font-bold uppercase"
      style={{
        minWidth: 22,
        height: 22,
        padding: '0 6px',
        fontSize: 10,
        letterSpacing: '0.02em',
        color,
        border: `1px solid ${color}66`,
        background: `${color}1A`,
      }}
    >
      {role}
    </span>
  )
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
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-4">{title}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0">
        {visible.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-1 py-px">
            <span className="text-[10px] text-ink-3 truncate">{s.label}</span>
            <span className="font-mono text-[10px] font-semibold text-ink-1 shrink-0">{fmtVal(s)}</span>
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
  const rcColor = RC_COLORS[slot.playerRatingClass ?? ''] ?? 'text-ink-3'
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
        className="w-full max-w-md rounded-xl border border-hairline bg-glass-1 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact header: name + RC + FV + minutes */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-hairline shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-ink-1 truncate">{slot.playerName ?? '—'}</p>
              {slot.playerRatingClass && (
                <span className={`text-[10px] font-bold shrink-0 ${rcColor}`}>{slot.playerRatingClass}</span>
              )}
            </div>
            <p className="text-[11px] text-ink-4 truncate">{slot.playerClub ?? ''}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-2xl font-black font-mono ${fvColor(fv)}`}>{fmtFv(fv)}</span>
            {slot.minutesPlayed !== null && (
              <span className="rounded border border-hairline px-1.5 py-0.5 text-[10px] font-mono text-ink-3">
                {slot.minutesPlayed}&apos;
              </span>
            )}
            <button onClick={onClose} className="text-ink-4 hover:text-ink-1 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="p-3 space-y-2.5 overflow-y-auto">
          {/* Voto base */}
          {slot.votoBase !== null && (
            <div className="text-[11px] text-ink-4">
              voto base <span className="font-mono text-ink-3">{slot.votoBase.toFixed(2)}</span>
            </div>
          )}

          {/* Source breakdown — 2 color-coded cards */}
          {hasAnyRaw && (
            <div className={`grid gap-2 ${hasFm && hasSs ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {hasFm && (
                <div className="rounded-lg p-2" style={{ border: '1px solid rgba(4,156,100,0.3)', background: 'rgba(4,156,100,0.07)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#049c64' }}>FotMob</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-black font-mono text-ink-1">{slot.rawFotmobRating!.toFixed(1)}</span>
                    {vbFm !== null && (
                      <span className={`text-[10px] font-mono ${vbFm.clamped ? 'text-amber-400' : 'text-ink-3'}`}>
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
                    <span className="text-lg font-black font-mono text-ink-1">{slot.rawSofascoreRating!.toFixed(1)}</span>
                    {vbSs !== null && (
                      <span className={`text-[10px] font-mono ${vbSs.clamped ? 'text-amber-400' : 'text-ink-3'}`}>
                        → {vbSs.value.toFixed(2)}{vbSs.clamped ? ' ↑' : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {deltaRaw !== null && deltaConverted !== null && (
                <div className="col-span-2 flex items-center justify-center gap-3 text-[10px] text-ink-4">
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
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-emerald-400/80 font-mono">
                      {fmtMarketValue(slot.marketValue)}
                    </span>
                  )}
                  {slot.height !== null && (
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-4 font-mono">
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
                <p className="text-[10px] text-ink-4 italic">Nessuna statistica SofaScore disponibile</p>
              )}
            </div>
          )}

          {fv === null && !hasAnyRaw && !hasStats && (
            <p className="text-xs text-ink-4 italic">Nessun voto disponibile (NV)</p>
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
  dense,
}: {
  slot: SlotData
  isEditable: boolean
  onDragStart: () => void
  onDrop: () => void
  onPlayerClick?: (slot: SlotData) => void
  dense?: boolean
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fv = slot.fantavoto
  const bm = slot.bonusMalus
  const role = slot.playerRoles[0]
  const isEmpty = slot.playerId === null

  return (
    <div
      draggable={isEditable && !isEmpty}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop() }}
      onClick={() => !isEmpty && onPlayerClick?.(slot)}
      className={[
        'grid items-center transition-all',
        dense ? 'px-2.5 py-1.5' : 'px-3 py-2',
        isDragOver
          ? 'border-indigo-400/60 bg-indigo-500/10 shadow-[0_0_0_4px_rgba(99,102,241,0.06)_inset]'
          : isEmpty
            ? 'border-hairline bg-glass-soft'
            : slot.isBench
              ? 'border-hairline bg-glass-1 hover:bg-glass-2'
              : 'border-hairline bg-glass-2 hover:bg-glass-3',
        'rounded-xl border',
        isEmpty ? 'cursor-default' : isEditable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        slot.isBench && !isEmpty ? 'opacity-95' : '',
      ].join(' ')}
      style={{
        gridTemplateColumns: 'auto minmax(0,1fr) auto 48px',
        columnGap: 10,
      }}
    >
      {/* Single role tag */}
      <RoleTag role={role} />

      {/* Name + club stacked */}
      {isEmpty ? (
        <span className="text-[12.5px] italic text-ink-4">vuoto</span>
      ) : (
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13px] font-medium leading-tight text-ink-1 tracking-tight">
            <span className="sm:hidden">{lastNameOnly(slot.playerName ?? '')}</span>
            <span className="hidden sm:inline">{slot.playerName}</span>
          </span>
          <span className="truncate text-[10.5px] font-medium leading-none text-ink-3">
            {slot.playerClub}
          </span>
        </span>
      )}

      {/* Bonus/malus chips — left of rating, right-aligned */}
      {!isEmpty && bm && bm.length > 0 ? (
        <span className="flex shrink-0 justify-end gap-1">
          {bm.slice(0, 2).map((b, i) => (
            <span
              key={i}
              className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap"
              style={{
                background: b.total > 0 ? 'rgba(78,166,110,0.16)' : 'rgba(200,80,74,0.16)',
                color: b.total > 0 ? '#5fc28e' : '#e07686',
              }}
            >
              {b.label} {b.total > 0 ? '+' : ''}{b.total}
            </span>
          ))}
        </span>
      ) : (
        <span />
      )}

      {/* Fantavoto — fixed-width column so all numbers align */}
      {!isEmpty ? (
        <span
          className={`text-right font-mono font-bold tabular-nums ${fvColor(fv)}`}
          style={{ fontSize: 14, letterSpacing: '-0.02em' }}
        >
          {fmtFv(fv)}
        </span>
      ) : (
        <span />
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

  const eyebrow =
    'text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3'

  const inner = (
    <>
      {/* Team header (only shown in standalone / non-paired mode) */}
      {!bare && (
        <header className="mb-3.5 flex items-center gap-3">
          <Avatar name={team.teamName} size={36} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-ink-1 tracking-tight">
              {team.teamName}
            </h3>
            <p className="mt-0.5 text-[11.5px] font-medium leading-none text-ink-3">
              {team.formationName}
              {team.submissionNumber !== null && ` · v#${team.submissionNumber}`}
            </p>
          </div>
        </header>
      )}

      {/* Save / dirty indicator strip */}
      {isEditable && (isDirty || saveMsg) && (
        <div
          className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
          style={{
            background: saveMsg?.ok
              ? 'rgba(34,197,94,0.08)'
              : !saveMsg
                ? 'rgba(99,102,241,0.07)'
                : 'rgba(239,68,68,0.08)',
            borderColor: saveMsg?.ok
              ? 'rgba(34,197,94,0.22)'
              : !saveMsg
                ? 'rgba(99,102,241,0.22)'
                : 'rgba(239,68,68,0.22)',
          }}
        >
          <span
            className="text-[11.5px] font-medium"
            style={{
              color: saveMsg?.ok
                ? '#5fc28e'
                : !saveMsg
                  ? '#a5acff'
                  : '#e07686',
            }}
          >
            {saveMsg ? saveMsg.text : 'Modifiche non salvate'}
          </span>
          {!saveMsg && (
            <div className="flex gap-1.5">
              <button
                onClick={handleReset}
                disabled={isPending}
                className="rounded-md border border-hairline px-2 py-0.5 text-[10.5px] font-medium text-ink-3 transition-colors hover:bg-white/5 hover:text-ink-1"
              >
                Ripristina
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-md bg-indigo-500 px-2.5 py-0.5 text-[10.5px] font-medium text-white shadow-[0_4px_12px_-2px_rgba(99,102,241,0.4)] transition-colors hover:bg-indigo-400 disabled:opacity-50"
              >
                {isPending ? 'Salvo…' : 'Salva'}
              </button>
            </div>
          )}
        </div>
      )}

      {team.slots.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-4">Nessuna formazione inserita</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* Titolari */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className={eyebrow}>Titolari</span>
            </div>
            <div className="grid gap-1.5">
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
              <div className="mb-2 flex items-center justify-between">
                <span className={eyebrow}>Panchina · {panchina.length}</span>
              </div>
              <div className="grid gap-1.5">
                {panchina.map((slot) => (
                  <PlayerChip
                    key={slot.slotId}
                    slot={slot}
                    isEditable={isEditable}
                    onDragStart={() => handleDragStart(slot.slotId)}
                    onDrop={() => handleDrop(slot.slotId)}
                    onPlayerClick={onPlayerClick}
                    dense
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

  return <div className="glass p-4">{inner}</div>
}

// ---- Matchup row -----------------------------------------------------------
//
// Renders two teams side by side inside a single container card.
// The header shows both team names, formation strings, and — when a
// calculation run exists — a live score readout.

function MatchupRow({
  home,
  away,
  homeGoals,
  awayGoals,
  matchdayId,
  isEditable,
  onPlayerClick,
}: {
  home: TeamLineupData | undefined
  away: TeamLineupData | undefined
  homeGoals: number | null
  awayGoals: number | null
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
  const hasFv = homeFv !== null || awayFv !== null
  const hasGoals = homeGoals !== null && awayGoals !== null

  // Decide winner: prefer goal result, fall back to fantavoto
  const homeWins = hasGoals
    ? (homeGoals as number) > (awayGoals as number)
    : homeFv !== null && awayFv !== null && homeFv > awayFv
  const awayWins = hasGoals
    ? (awayGoals as number) > (homeGoals as number)
    : homeFv !== null && awayFv !== null && awayFv > homeFv

  const homeTone = awayWins ? 'text-ink-5' : 'text-ink-1'
  const awayTone = homeWins ? 'text-ink-5' : 'text-ink-1'

  function fvBg(fv: number | null): string {
    if (fv === null) return '#9095b8'
    if (fv < 5) return '#c8504a'
    if (fv < 6) return '#d9874a'
    if (fv < 7) return '#c79d3a'
    if (fv < 8) return '#4ea66e'
    if (fv < 9) return '#3ea0c4'
    return '#5a6df0'
  }

  // Score block — goals as primary (large, light), fantavoto as small pill caption
  function ScoreBlock({ size }: { size: 'sm' | 'lg' }) {
    if (!hasGoals && !hasFv) {
      return (
        <span
          className="px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3"
        >
          vs
        </span>
      )
    }
    return (
      <div className="flex flex-col items-center gap-2">
        {hasGoals ? (
          <div className="flex items-baseline gap-3">
            <span
              className={`font-light tabular-nums leading-none ${homeTone}`}
              style={{
                fontSize: size === 'lg' ? 'clamp(34px, 4vw, 52px)' : 'clamp(28px, 3vw, 36px)',
                letterSpacing: '-0.04em',
              }}
            >
              {homeGoals}
            </span>
            <span
              className="font-thin leading-none text-ink-5 select-none"
              style={{ fontSize: size === 'lg' ? 'clamp(28px, 3vw, 40px)' : '24px' }}
            >
              –
            </span>
            <span
              className={`font-light tabular-nums leading-none ${awayTone}`}
              style={{
                fontSize: size === 'lg' ? 'clamp(34px, 4vw, 52px)' : 'clamp(28px, 3vw, 36px)',
                letterSpacing: '-0.04em',
              }}
            >
              {awayGoals}
            </span>
          </div>
        ) : (
          <span className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
            vs
          </span>
        )}
        {hasFv && (
          <div className="flex items-center gap-2 rounded-full border border-hairline bg-glass-tint px-2.5 py-1 font-mono text-[11px] tabular-nums">
            <span style={{ color: fvBg(homeFv !== null ? homeFv / 11 : null) }}>
              {homeFv !== null ? homeFv.toFixed(2) : 'NV'}
            </span>
            <span className="text-ink-5">·</span>
            <span style={{ color: fvBg(awayFv !== null ? awayFv / 11 : null) }}>
              {awayFv !== null ? awayFv.toFixed(2) : 'NV'}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="hero relative overflow-hidden">
      {/* Header */}
      <div className="relative border-b border-hairline px-6 py-6 md:px-8 md:py-7">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-6">
          {/* Home */}
          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
            <div className="flex min-w-0 flex-col items-end">
              <span
                className={`truncate font-medium leading-tight tracking-tight ${homeTone}`}
                style={{ fontSize: 'clamp(15px, 1.6vw, 22px)' }}
              >
                {home?.teamName ?? '?'}
              </span>
              <span className="mt-1 text-[11.5px] font-medium leading-tight text-ink-3">
                {home?.formationName ?? '—'}
              </span>
            </div>
            {home && <Avatar name={home.teamName} size={42} />}
          </div>

          {/* Score */}
          <div className="shrink-0">
            <ScoreBlock size="lg" />
          </div>

          {/* Away */}
          <div className="flex min-w-0 items-center gap-3 text-left">
            {away && <Avatar name={away.teamName} size={42} />}
            <div className="flex min-w-0 flex-col">
              <span
                className={`truncate font-medium leading-tight tracking-tight ${awayTone}`}
                style={{ fontSize: 'clamp(15px, 1.6vw, 22px)' }}
              >
                {away?.teamName ?? '?'}
              </span>
              <span className="mt-1 text-[11.5px] font-medium leading-tight text-ink-3">
                {away?.formationName ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lineups grid */}
      <div className="grid grid-cols-1 divide-y divide-hairline md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="p-5">
          {home ? (
            <TeamCard team={home} matchdayId={matchdayId} isEditable={isEditable} bare onPlayerClick={onPlayerClick} />
          ) : (
            <p className="py-10 text-center text-xs text-ink-4">Nessuna formazione</p>
          )}
        </div>
        <div className="p-5">
          {away ? (
            <TeamCard team={away} matchdayId={matchdayId} isEditable={isEditable} bare onPlayerClick={onPlayerClick} />
          ) : (
            <p className="py-10 text-center text-xs text-ink-4">Nessuna formazione</p>
          )}
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
        {/* Match selector — eyebrow + team names per pill */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {matchups.length > 1 && (
            <div className="glass flex flex-1 gap-1.5 overflow-x-auto p-1.5">
              {matchups.map((m, i) => {
                const home = teamMap.get(m.homeTeamId)
                const away = teamMap.get(m.awayTeamId)
                const isActive = activeMatchIndex === i
                return (
                  <button
                    key={i}
                    onClick={() => setActiveMatchIndex(i)}
                    className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition-all ${
                      isActive
                        ? 'border-indigo-400/40 bg-glass-3 shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
                        : 'border-transparent text-ink-3 hover:bg-glass-1'
                    }`}
                  >
                    <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                      Sfida {i + 1}
                    </span>
                    <span
                      className={`mt-0.5 block text-[12px] font-medium leading-tight ${
                        isActive ? 'text-ink-1' : 'text-ink-3'
                      }`}
                    >
                      {home?.teamName ?? '?'}{' '}
                      <span className="opacity-40">vs</span> {away?.teamName ?? '?'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="shrink-0 sm:ml-auto">
            <QuickFetchAndCalculateButton matchdayId={matchdayId} compact />
          </div>
        </div>

        {/* Carousel: one match at a time with slide animation */}
        <div className="mt-4 overflow-hidden rounded-3xl">
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${activeMatchIndex * 100}%)` }}
          >
            {matchups.map((m, i) => (
              <div key={i} className="w-full shrink-0">
                <MatchupRow
                  home={teamMap.get(m.homeTeamId)}
                  away={teamMap.get(m.awayTeamId)}
                  homeGoals={m.homeGoals}
                  awayGoals={m.awayGoals}
                  matchdayId={matchdayId}
                  isEditable={isEditable}
                  onPlayerClick={setSelectedSlot}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dot indicators — pill-shaped active dot */}
        {matchups.length > 1 && (
          <div className="mt-4 flex justify-center gap-1.5">
            {matchups.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveMatchIndex(i)}
                aria-label={`Sfida ${i + 1}`}
                className="rounded-full transition-all duration-200"
                style={{
                  width: activeMatchIndex === i ? 22 : 7,
                  height: 7,
                  background:
                    activeMatchIndex === i ? 'var(--color-indigo)' : 'var(--hairline-strong)',
                }}
              />
            ))}
          </div>
        )}

        {unpaired.length > 0 && (
          <section className="mt-6 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Senza incontro
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {unpaired.map((t) => (
                <TeamCard key={t.teamId} team={t} matchdayId={matchdayId} isEditable={isEditable} onPlayerClick={setSelectedSlot} />
              ))}
            </div>
          </section>
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
