'use client'

import { useState, useEffect, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { playerSatisfiesSlot } from '@/domain/lineup/slotCompatibility'
import { validateLineup } from '@/domain/lineup/validateLineup'
import { submitLineupAction } from './actions'
import type { FormationSlot } from '@/types/database.types'

interface RosterPlayer {
  id: string
  full_name: string
  club: string
  mantra_roles: string[]
  primary_mantra_role: string | null
  rating_class: string
}

interface SlimFormation {
  id: string
  name: string
}

interface CurrentSubmission {
  formation_id: string
  submission_number: number
  status: string
  players: Array<{
    player_id: string
    slot_id: string
    is_bench: boolean
    bench_order: number | null
  }>
}

interface LineupBuilderProps {
  matchdayId: string
  formations: SlimFormation[]
  rosterPlayers: RosterPlayer[]
  currentSubmission: CurrentSubmission | null
  isReadOnly: boolean
}

type Assignments = Record<string, string>

// Role display colours
const ROLE_COLORS: Record<string, string> = {
  Por: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Dc:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  B:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Dd:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Ds:  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  E:   'bg-teal-500/20 text-teal-300 border-teal-500/30',
  M:   'bg-green-500/20 text-green-300 border-green-500/30',
  C:   'bg-green-500/20 text-green-300 border-green-500/30',
  T:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  W:   'bg-orange-500/20 text-orange-300 border-orange-500/30',
  A:   'bg-red-500/20 text-red-300 border-red-500/30',
  Pc:  'bg-red-500/20 text-red-300 border-red-500/30',
}

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
}

const ALL_FILTER_ROLES = ['Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

export function LineupBuilder({
  matchdayId,
  formations,
  rosterPlayers,
  currentSubmission,
  isReadOnly,
}: LineupBuilderProps) {
  const [selectedFormationId, setSelectedFormationId] = useState<string>(
    currentSubmission?.formation_id ?? formations[0]?.id ?? ''
  )
  const [slots, setSlots] = useState<FormationSlot[]>([])
  const [assignments, setAssignments] = useState<Assignments>({})
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [playerSearch, setPlayerSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    error: string | null
    validationErrors: string[]
    validationWarnings: string[]
    success: boolean
    submissionNumber?: number
  } | null>(null)

  useEffect(() => {
    if (!selectedFormationId) return
    setLoadingSlots(true)
    setActiveSlotId(null)

    fetch(`/api/formations/${selectedFormationId}/slots`)
      .then((r) => r.json())
      .then((data: FormationSlot[]) => {
        setSlots(data)
        if (selectedFormationId !== currentSubmission?.formation_id) {
          setAssignments({})
        } else {
          const pre: Assignments = {}
          for (const sp of currentSubmission?.players ?? []) {
            pre[sp.slot_id] = sp.player_id
          }
          setAssignments(pre)
        }
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedFormationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const starterSlots = slots.filter((s) => !s.is_bench)
  const benchSlots   = slots.filter((s) =>  s.is_bench).sort((a, b) => (a.bench_order ?? 0) - (b.bench_order ?? 0))

  const usedPlayerIds = new Set(Object.values(assignments).filter(Boolean))
  const playerMap     = new Map(rosterPlayers.map((p) => [p.id, p]))

  function assign(slotId: string, playerId: string) {
    setAssignments((prev) => {
      const next = { ...prev }
      for (const [sid, pid] of Object.entries(next)) {
        if (pid === playerId && sid !== slotId) delete next[sid]
      }
      if (playerId) next[slotId] = playerId
      else delete next[slotId]
      return next
    })
    setActiveSlotId(null)
  }

  function removeFromSlot(slotId: string) {
    setAssignments((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }

  const assignmentList = slots.flatMap((slot) => {
    const pid = assignments[slot.id]
    if (!pid) return []
    return [{ player_id: pid, slot_id: slot.id, is_bench: slot.is_bench, bench_order: slot.bench_order, assigned_mantra_role: null }]
  })

  const validation = validateLineup({
    slots,
    players: playerMap,
    assignments: assignmentList.map((a) => ({
      playerId: a.player_id,
      slotId: a.slot_id,
      isBench: a.is_bench,
      benchOrder: a.bench_order,
      assignedMantraRole: null,
    })),
    isDraft: true,
  })

  function submit(isDraft: boolean) {
    startTransition(async () => {
      const res = await submitLineupAction({
        matchday_id: matchdayId,
        formation_id: selectedFormationId,
        is_draft: isDraft,
        assignments: assignmentList,
      })
      setResult(res)
    })
  }

  const activeSlot = activeSlotId ? slots.find((s) => s.id === activeSlotId) ?? null : null

  // Filter players for the right panel
  const visiblePlayers = rosterPlayers.filter((p) => {
    const matchesSearch = playerSearch.trim() === '' ||
      p.full_name.toLowerCase().includes(playerSearch.toLowerCase()) ||
      p.club.toLowerCase().includes(playerSearch.toLowerCase())
    const matchesRole = roleFilter === null || p.mantra_roles.includes(roleFilter)
    return matchesSearch && matchesRole
  })

  // Sort: unassigned first, then by primary role
  const sortedPlayers = [...visiblePlayers].sort((a, b) => {
    const aUsed = usedPlayerIds.has(a.id)
    const bUsed = usedPlayerIds.has(b.id)
    if (aUsed && !bUsed) return 1
    if (!aUsed && bUsed) return -1
    return a.full_name.localeCompare(b.full_name)
  })

  if (isReadOnly) {
    return <Alert variant="warning">La giornata non è aperta. La formazione è in sola lettura.</Alert>
  }

  return (
    <div className="space-y-4">
      {/* Header row: submission status + formation selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {currentSubmission && (
          <div className="flex items-center gap-2 text-sm text-[#8888aa]">
            <span>Ultima versione: <span className="text-white">#{currentSubmission.submission_number}</span></span>
            <Badge variant={currentSubmission.status === 'submitted' ? 'success' : 'warning'}>
              {currentSubmission.status === 'submitted' ? 'Inviata' : 'Bozza'}
            </Badge>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">Schema</label>
          <select
            value={selectedFormationId}
            onChange={(e) => setSelectedFormationId(e.target.value)}
            className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {formations.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loadingSlots ? (
        <p className="text-sm text-[#55556a]">Caricamento slot…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* ── LEFT PANEL: slots ─────────────────────────────────── */}
          <div className="space-y-4">
            {/* Instruction */}
            <p className="text-xs text-[#8888aa]">
              {activeSlotId
                ? '← Clicca un giocatore a destra per assegnarlo a questa posizione'
                : 'Clicca una posizione per selezionarla, poi scegli il giocatore →'}
            </p>

            {/* Starters */}
            <div className="rounded-xl border border-[#2e2e42] bg-[#12121a] overflow-hidden">
              <div className="border-b border-[#2e2e42] px-4 py-2.5">
                <h3 className="text-sm font-semibold text-white">Titolari</h3>
                <p className="text-xs text-[#8888aa]">{starterSlots.filter(s => assignments[s.id]).length} / {starterSlots.length} assegnati</p>
              </div>
              <div className="divide-y divide-[#1e1e2e]">
                {starterSlots.map((slot) => {
                  const assignedPlayer = assignments[slot.id] ? playerMap.get(assignments[slot.id]!) : null
                  const isActive = activeSlotId === slot.id
                  const isCompatibleActive = activeSlot && assignedPlayer
                    ? playerSatisfiesSlot(assignedPlayer, activeSlot)
                    : true

                  return (
                    <div
                      key={slot.id}
                      onClick={() => setActiveSlotId(isActive ? null : slot.id)}
                      className={[
                        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                        isActive
                          ? 'bg-indigo-500/20 border-l-2 border-indigo-400'
                          : 'hover:bg-[#1a1a28] border-l-2 border-transparent',
                      ].join(' ')}
                    >
                      {/* Slot label */}
                      <div className="w-16 shrink-0">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold border ${roleColor(slot.allowed_mantra_roles[0] ?? '')}`}>
                          {slot.slot_name}
                        </span>
                      </div>

                      {/* Assigned player or empty state */}
                      <div className="flex-1 min-w-0">
                        {assignedPlayer ? (
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${isCompatibleActive ? 'text-white' : 'text-red-400'}`}>
                              {assignedPlayer.full_name}
                            </span>
                            <span className="text-xs text-[#8888aa] shrink-0">{assignedPlayer.club}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-[#55556a] italic">
                            {isActive ? 'Scegli un giocatore →' : '— vuoto —'}
                          </span>
                        )}
                        {assignedPlayer && (
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {assignedPlayer.mantra_roles.map((r) => (
                              <span key={r} className={`inline-flex items-center rounded px-1 py-0 text-xs border ${roleColor(r)}`}>{r}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Remove button */}
                      {assignedPlayer && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); removeFromSlot(slot.id) }}
                          className="shrink-0 rounded p-1 text-[#55556a] hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          title="Rimuovi"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Bench */}
            {benchSlots.length > 0 && (
              <div className="rounded-xl border border-[#2e2e42] bg-[#12121a] overflow-hidden">
                <div className="border-b border-[#2e2e42] px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-white">Panchina</h3>
                  <p className="text-xs text-[#8888aa]">Ordine di priorità per le sostituzioni · {benchSlots.filter(s => assignments[s.id]).length} / {benchSlots.length} assegnati</p>
                </div>
                <div className="divide-y divide-[#1e1e2e]">
                  {benchSlots.map((slot) => {
                    const assignedPlayer = assignments[slot.id] ? playerMap.get(assignments[slot.id]!) : null
                    const isActive = activeSlotId === slot.id

                    return (
                      <div
                        key={slot.id}
                        onClick={() => setActiveSlotId(isActive ? null : slot.id)}
                        className={[
                          'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                          isActive
                            ? 'bg-indigo-500/20 border-l-2 border-indigo-400'
                            : 'hover:bg-[#1a1a28] border-l-2 border-transparent',
                        ].join(' ')}
                      >
                        <div className="w-8 shrink-0 text-center">
                          <span className="text-xs font-bold text-[#8888aa]">P{slot.bench_order}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {assignedPlayer ? (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white truncate">{assignedPlayer.full_name}</span>
                                <span className="text-xs text-[#8888aa] shrink-0">{assignedPlayer.club}</span>
                              </div>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {assignedPlayer.mantra_roles.map((r) => (
                                  <span key={r} className={`inline-flex items-center rounded px-1 py-0 text-xs border ${roleColor(r)}`}>{r}</span>
                                ))}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-[#55556a] italic">
                              {isActive ? 'Scegli un giocatore →' : '— vuoto —'}
                            </span>
                          )}
                        </div>
                        {assignedPlayer && (
                          <button
                            onClick={(ev) => { ev.stopPropagation(); removeFromSlot(slot.id) }}
                            className="shrink-0 rounded p-1 text-[#55556a] hover:bg-red-500/20 hover:text-red-400 transition-colors"
                            title="Rimuovi"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL: player list ───────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs text-[#8888aa]">
              {activeSlotId
                ? `Posizione selezionata: ${activeSlot?.slot_name ?? ''}  — clicca un giocatore per assegnarlo`
                : 'I tuoi giocatori'}
            </p>

            {/* Search + role filter */}
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Cerca per nome o squadra…"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setRoleFilter(null)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors border ${
                    roleFilter === null
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'border-[#2e2e42] text-[#8888aa] hover:border-indigo-500 hover:text-white'
                  }`}
                >
                  Tutti
                </button>
                {ALL_FILTER_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(roleFilter === r ? null : r)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-colors border ${
                      roleFilter === r
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : `${roleColor(r)} hover:opacity-100 opacity-70`
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Player cards */}
            <div className="rounded-xl border border-[#2e2e42] bg-[#12121a] overflow-hidden max-h-[600px] overflow-y-auto">
              {sortedPlayers.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#55556a]">Nessun giocatore trovato</p>
              ) : (
                <div className="divide-y divide-[#1e1e2e]">
                  {sortedPlayers.map((player) => {
                    const isUsed = usedPlayerIds.has(player.id)
                    const isCompatible = activeSlot ? playerSatisfiesSlot(player, activeSlot) : true
                    const isAssignedToActive = activeSlotId && assignments[activeSlotId] === player.id

                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          if (!activeSlotId || isUsed) return
                          assign(activeSlotId, player.id)
                        }}
                        className={[
                          'flex items-center gap-3 px-4 py-2.5 transition-colors',
                          isUsed
                            ? 'opacity-40 cursor-not-allowed'
                            : activeSlotId
                            ? isCompatible
                              ? 'cursor-pointer hover:bg-indigo-500/10 hover:border-l-2 hover:border-indigo-400'
                              : 'cursor-pointer opacity-50 hover:bg-[#1a1a28]'
                            : 'cursor-default',
                          isAssignedToActive ? 'bg-indigo-500/20 border-l-2 border-indigo-400' : 'border-l-2 border-transparent',
                        ].join(' ')}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white truncate">{player.full_name}</span>
                            <span className="text-xs text-[#8888aa] shrink-0">{player.club}</span>
                          </div>
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {player.mantra_roles.map((r) => (
                              <span key={r} className={`inline-flex items-center rounded px-1 py-0 text-xs border ${roleColor(r)}`}>{r}</span>
                            ))}
                          </div>
                        </div>
                        {isUsed && (
                          <span className="text-xs text-[#55556a] shrink-0">in uso</span>
                        )}
                        {!isUsed && activeSlotId && isCompatible && (
                          <span className="text-xs text-indigo-400 shrink-0">← assegna</span>
                        )}
                        {!isUsed && activeSlotId && !isCompatible && (
                          <span className="text-xs text-[#55556a] shrink-0">⚠ fuori pos.</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Validation + submit */}
      {slots.length > 0 && (
        <div className="space-y-3">
          {validation.errors.length > 0 && (
            <Alert variant="error" title="Formazione non valida">
              <ul className="list-disc pl-4 space-y-1">
                {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Alert>
          )}
          {validation.warnings.length > 0 && (
            <Alert variant="warning">
              <ul className="list-disc pl-4 space-y-1">
                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Alert>
          )}
          {result?.error && <Alert variant="error">{result.error}</Alert>}
          {result?.success && (
            <Alert variant="success">
              {result.submissionNumber !== undefined
                ? `Versione #${result.submissionNumber} salvata correttamente.`
                : 'Formazione salvata.'}
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" loading={isPending} onClick={() => submit(true)}>
              Salva bozza
            </Button>
            <Button variant="primary" loading={isPending} disabled={!validation.valid} onClick={() => submit(false)}>
              Invia formazione
            </Button>
            <a href={`/matchdays/${matchdayId}/lineup/history`} className="text-sm text-indigo-400 hover:underline self-center">
              Storico invii →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
