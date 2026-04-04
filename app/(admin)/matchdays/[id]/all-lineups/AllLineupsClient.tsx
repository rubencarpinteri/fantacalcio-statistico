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

interface Props {
  matchdayId: string
  matchdayStatus: string
  teamLineups: TeamLineupData[]
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

// ---- Single team card ------------------------------------------------------

function TeamCard({
  team,
  matchdayId,
  isEditable,
}: {
  team: TeamLineupData
  matchdayId: string
  isEditable: boolean
}) {
  // Local slot state (copy of server data — mutated by drag)
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

      // Swap players between the two slots
      const fromSlot = { ...next[fromIdx]! }
      const toSlot = { ...next[toIdx]! }

      const swapFields = [
        'playerId', 'playerName', 'playerClub', 'playerRoles', 'playerRatingClass',
        'fantavoto', 'votoBase', 'assignedMantraRole',
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

  return (
    <div className={`rounded-xl border bg-[#0f0f1a] p-4 ${isDirty ? 'border-indigo-500/40' : 'border-[#2e2e42]'}`}>
      {/* Team header */}
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

      {saveMsg && (
        <p className={`mb-3 text-xs ${saveMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
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
    </div>
  )
}

// ---- Player chip -----------------------------------------------------------

function PlayerChip({
  slot,
  isEditable,
  onDragStart,
  onDrop,
}: {
  slot: SlotData
  isEditable: boolean
  onDragStart: () => void
  onDrop: () => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const color = roleColor(slot.playerRoles)
  const fv = slot.fantavoto

  return (
    <div
      draggable={isEditable && slot.playerId !== null}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); onDrop() }}
      className={[
        'flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
        isDragOver ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#2e2e42] bg-[#0a0a0f]',
        isEditable && slot.playerId ? 'cursor-grab active:cursor-grabbing hover:border-[#3e3e52]' : '',
        slot.isBench ? 'opacity-75' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* Position label */}
        <span className="shrink-0 w-14 text-[#55556a] font-mono text-[10px]">
          {slot.isBench ? `PAN ${slot.benchOrder ?? ''}` : slot.positionName}
        </span>

        {slot.playerId ? (
          <>
            <span className={`shrink-0 font-bold text-[10px] ${color.split(' ')[1]}`}>
              {slot.playerRoles[0] ?? '?'}
            </span>
            <span className="truncate text-white">{slot.playerName}</span>
            <span className="shrink-0 text-[#55556a]">{slot.playerClub}</span>
          </>
        ) : (
          <span className="text-[#3e3e52] italic">vuoto</span>
        )}
      </div>

      {/* Fantavoto */}
      <span className={`shrink-0 font-mono font-bold ml-2 ${
        fv === null ? 'text-[#55556a]' : fv >= 7 ? 'text-green-400' : fv >= 6 ? 'text-white' : 'text-amber-400'
      }`}>
        {fmtFv(fv)}
      </span>
    </div>
  )
}

// ---- Main component --------------------------------------------------------

export function AllLineupsClient({ matchdayId, matchdayStatus, teamLineups }: Props) {
  const isEditable = matchdayStatus !== 'archived'

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {teamLineups.map((team) => (
        <TeamCard
          key={team.teamId}
          team={team}
          matchdayId={matchdayId}
          isEditable={isEditable}
        />
      ))}
    </div>
  )
}
