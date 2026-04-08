'use client'

import { useState, useTransition, useRef } from 'react'
import { adminOverrideLineupAction } from './actions'

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

function calcSourceVotoBase(z: number | null, mf: number | null, rm: number | null): number | null {
  if (z === null || mf === null || rm === null) return null
  const b0 = _TARGET_MEAN + _TARGET_STD * z * mf
  const b1 = _TARGET_MEAN + rm * (b0 - _TARGET_MEAN)
  return Math.max(3.0, Math.min(9.5, b1))
}

// ---- Player detail modal ---------------------------------------------------

function PlayerDetailModal({ slot, onClose }: { slot: SlotData; onClose: () => void }) {
  const vbFm = calcSourceVotoBase(slot.zFotmob, slot.minutesFactor, slot.roleMultiplier)
  const vbSs = calcSourceVotoBase(slot.zSofascore, slot.minutesFactor, slot.roleMultiplier)
  const rcColor = RC_COLORS[slot.playerRatingClass ?? ''] ?? 'text-[#8888aa]'
  const fv = slot.fantavoto

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-xl border border-[#2e2e42] bg-[#111118] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white">{slot.playerName ?? '—'}</p>
            <p className="text-xs text-[#55556a]">
              {slot.playerClub ?? ''}
              {slot.playerRatingClass && (
                <span className={`ml-2 font-bold ${rcColor}`}>{slot.playerRatingClass}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-[#55556a] hover:text-white text-lg leading-none">×</button>
        </div>

        {/* Fantavoto */}
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-3xl font-black font-mono text-white">{fmtFv(fv)}</span>
          {slot.votoBase !== null && (
            <span className="text-sm text-[#55556a]">
              base <span className="font-mono text-[#8888aa]">{slot.votoBase.toFixed(2)}</span>
            </span>
          )}
        </div>

        {/* Per-source breakdown */}
        {(vbFm !== null || vbSs !== null) && (
          <div className="mb-4 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[#55556a]">Voto base per fonte</p>
            <div className="space-y-1.5">
              {vbFm !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#8888aa]">Solo FotMob</span>
                  <span className="font-mono text-sm font-bold text-[#c8c8f0]">{vbFm.toFixed(2)}</span>
                </div>
              )}
              {vbSs !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-400/70">Solo SofaScore</span>
                  <span className="font-mono text-sm font-bold text-indigo-300">{vbSs.toFixed(2)}</span>
                </div>
              )}
              {vbFm !== null && vbSs !== null && (
                <div className="flex items-center justify-between border-t border-[#2e2e42] pt-1.5">
                  <span className="text-xs text-[#55556a]">Δ FM − SS</span>
                  <span className={`font-mono text-xs ${Math.abs(vbFm - vbSs) > 0.5 ? 'text-amber-400' : 'text-[#8888aa]'}`}>
                    {(vbFm - vbSs) >= 0 ? '+' : ''}{(vbFm - vbSs).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* B/M breakdown */}
        {slot.bonusMalus && slot.bonusMalus.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[#55556a]">Bonus / Malus</p>
            <div className="flex flex-wrap gap-1.5">
              {slot.bonusMalus.map((b, i) => (
                <span
                  key={i}
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    b.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                  }`}
                >
                  {b.label} {b.total > 0 ? '+' : ''}{b.total.toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        )}

        {fv === null && (
          <p className="mt-2 text-xs text-[#55556a] italic">Nessun voto disponibile (NV)</p>
        )}
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
        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
        isDragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#2e2e42] bg-[#0a0a0f]',
        slot.playerId ? 'cursor-pointer hover:border-[#3e3e52]' : '',
        isEditable && slot.playerId ? 'cursor-grab active:cursor-grabbing' : '',
        slot.isBench ? 'opacity-75' : '',
      ].join(' ')}
    >
      {/* Position label */}
      <span className="shrink-0 w-14 text-[#55556a] font-mono text-[10px]">
        {slot.isBench ? `PAN ${slot.benchOrder ?? ''}` : slot.positionName}
      </span>

      {slot.playerId ? (
        <>
          <span className={`shrink-0 font-bold text-[10px] ${color.split(' ')[1]}`}>
            {slot.playerRoles[0] ?? '?'}
          </span>
          <span className="truncate text-white min-w-0">{slot.playerName}</span>
          <span className="shrink-0 text-[#55556a]">{slot.playerClub}</span>
        </>
      ) : (
        <span className="text-[#3e3e52] italic flex-1">vuoto</span>
      )}

      {/* Bonus / Malus badges */}
      {bm && bm.length > 0 && (
        <span className="ml-auto flex items-center gap-0.5 shrink-0">
          {bm.map((b, i) => (
            <span
              key={i}
              className={`rounded px-1 py-0.5 text-[10px] font-semibold ${
                b.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
              }`}
            >
              {b.label} {b.total > 0 ? '+' : ''}{b.total}
            </span>
          ))}
        </span>
      )}

      {/* Fantavoto */}
      <span className={`shrink-0 font-mono font-bold ${bm && bm.length > 0 ? '' : 'ml-auto'} ${
        fv === null ? 'text-[#55556a]' : fv >= 7 ? 'text-green-400' : fv >= 6 ? 'text-white' : 'text-amber-400'
      }`}>
        {fmtFv(fv)}
      </span>
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

  return (
    <div className="rounded-2xl border border-[#2e2e42] bg-[#0b0b14] overflow-hidden">
      {/* Match header */}
      <div className="grid grid-cols-[1fr,auto,1fr] items-center px-5 py-3 bg-[#0f0f1a] border-b border-[#2e2e42]">
        {/* Home */}
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{home?.teamName ?? '?'}</p>
          <p className="text-xs text-[#55556a] truncate">{home?.formationName ?? '—'}</p>
        </div>

        {/* Score / VS badge */}
        <div className="mx-6 flex flex-col items-center shrink-0">
          {hasScores ? (
            <div className="flex items-center gap-3 font-mono text-base font-black">
              <span className={
                homeFv !== null && awayFv !== null
                  ? homeFv > awayFv ? 'text-green-400'
                  : homeFv < awayFv ? 'text-red-400'
                  : 'text-white'
                  : 'text-[#8888aa]'
              }>
                {homeFv?.toFixed(2) ?? '—'}
              </span>
              <span className="text-[#3e3e52] text-sm">–</span>
              <span className={
                homeFv !== null && awayFv !== null
                  ? awayFv > homeFv ? 'text-green-400'
                  : awayFv < homeFv ? 'text-red-400'
                  : 'text-white'
                  : 'text-[#8888aa]'
              }>
                {awayFv?.toFixed(2) ?? '—'}
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-widest text-[#55556a] px-3 py-1 rounded-full border border-[#2e2e42]">
              vs
            </span>
          )}
        </div>

        {/* Away */}
        <div className="min-w-0 text-right">
          <p className="text-sm font-bold text-white truncate">{away?.teamName ?? '?'}</p>
          <p className="text-xs text-[#55556a] truncate">{away?.formationName ?? '—'}</p>
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

  const teamMap = new Map(teamLineups.map((t) => [t.teamId, t]))

  // ── Matchup layout (when competition matchups are available) ──────────────
  if (matchups.length > 0) {
    const pairedIds = new Set(matchups.flatMap((m) => [m.homeTeamId, m.awayTeamId]))
    const unpaired = teamLineups.filter((t) => !pairedIds.has(t.teamId))

    return (
      <>
        <div className="space-y-4">
          {matchups.map((m, i) => (
            <MatchupRow
              key={i}
              home={teamMap.get(m.homeTeamId)}
              away={teamMap.get(m.awayTeamId)}
              matchdayId={matchdayId}
              isEditable={isEditable}
              onPlayerClick={setSelectedSlot}
            />
          ))}
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
        </div>
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
