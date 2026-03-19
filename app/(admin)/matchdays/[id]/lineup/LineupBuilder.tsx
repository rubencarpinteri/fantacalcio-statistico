'use client'

import { useState, useEffect, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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

// slot_id → player_id
type Assignments = Record<string, string>

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
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    error: string | null
    validationErrors: string[]
    validationWarnings: string[]
    success: boolean
    submissionNumber?: number
  } | null>(null)

  // Load slots whenever the selected formation changes
  useEffect(() => {
    if (!selectedFormationId) return
    setLoadingSlots(true)

    fetch(`/api/formations/${selectedFormationId}/slots`)
      .then((r) => r.json())
      .then((data: FormationSlot[]) => {
        setSlots(data)
        // If switching formation, clear assignments
        if (selectedFormationId !== currentSubmission?.formation_id) {
          setAssignments({})
        } else {
          // Pre-fill from current submission
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
  const benchSlots = slots.filter((s) => s.is_bench).sort((a, b) => (a.bench_order ?? 0) - (b.bench_order ?? 0))

  // Players already used in another slot
  const usedPlayerIds = new Set(Object.values(assignments).filter(Boolean))

  function assign(slotId: string, playerId: string) {
    setAssignments((prev) => {
      const next = { ...prev }
      // Remove the player from any other slot first
      for (const [sid, pid] of Object.entries(next)) {
        if (pid === playerId && sid !== slotId) delete next[sid]
      }
      if (playerId) next[slotId] = playerId
      else delete next[slotId]
      return next
    })
  }

  // Build assignments list for validation and submission
  const assignmentList = slots.flatMap((slot) => {
    const pid = assignments[slot.id]
    if (!pid) return []
    return [
      {
        player_id: pid,
        slot_id: slot.id,
        is_bench: slot.is_bench,
        bench_order: slot.bench_order,
        assigned_mantra_role: null,
      },
    ]
  })

  const playerMap = new Map(rosterPlayers.map((p) => [p.id, p]))

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
    isDraft: true, // client always validates as draft for live feedback
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

  if (isReadOnly) {
    return (
      <Alert variant="warning">
        La giornata non è aperta. La formazione è in sola lettura.
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current submission status */}
      {currentSubmission && (
        <div className="flex items-center gap-3 text-sm text-[#8888aa]">
          <span>
            Ultima versione salvata:{' '}
            <span className="text-white">#{currentSubmission.submission_number}</span>
          </span>
          <Badge variant={currentSubmission.status === 'submitted' ? 'success' : 'warning'}>
            {currentSubmission.status === 'submitted' ? 'Inviata' : 'Bozza'}
          </Badge>
        </div>
      )}

      {/* Formation selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]">
          Formazione
        </label>
        <select
          value={selectedFormationId}
          onChange={(e) => setSelectedFormationId(e.target.value)}
          className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          {formations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {loadingSlots ? (
        <p className="text-sm text-[#55556a]">Caricamento slot…</p>
      ) : (
        <>
          {/* Starter slots */}
          <Card>
            <CardHeader title="Titolari" description={`${starterSlots.length} posizioni`} />
            <CardContent className="space-y-2">
              {starterSlots.map((slot) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  assignedPlayerId={assignments[slot.id] ?? null}
                  rosterPlayers={rosterPlayers}
                  usedPlayerIds={usedPlayerIds}
                  onAssign={(pid) => assign(slot.id, pid)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Bench slots */}
          {benchSlots.length > 0 && (
            <Card>
              <CardHeader
                title="Panchina"
                description="Ordine di priorità per le sostituzioni automatiche"
              />
              <CardContent className="space-y-2">
                {benchSlots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    assignedPlayerId={assignments[slot.id] ?? null}
                    rosterPlayers={rosterPlayers}
                    usedPlayerIds={usedPlayerIds}
                    onAssign={(pid) => assign(slot.id, pid)}
                    showBenchOrder
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Live validation feedback */}
          {validation.errors.length > 0 && (
            <Alert variant="error" title="Formazione non valida">
              <ul className="list-disc pl-4 space-y-1">
                {validation.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
          {validation.warnings.length > 0 && (
            <Alert variant="warning">
              <ul className="list-disc pl-4 space-y-1">
                {validation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}

          {/* Server response */}
          {result?.error && <Alert variant="error">{result.error}</Alert>}
          {result?.success && (
            <Alert variant="success">
              {result.submissionNumber !== undefined
                ? `Versione #${result.submissionNumber} salvata correttamente.`
                : 'Formazione salvata.'}
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              loading={isPending}
              onClick={() => submit(true)}
            >
              Salva bozza
            </Button>
            <Button
              variant="primary"
              loading={isPending}
              disabled={!validation.valid}
              onClick={() => submit(false)}
            >
              Invia formazione
            </Button>
            <a
              href={`/matchdays/${matchdayId}/lineup/history`}
              className="text-sm text-indigo-400 hover:underline self-center"
            >
              Storico invii →
            </a>
          </div>
        </>
      )}
    </div>
  )
}

function SlotRow({
  slot,
  assignedPlayerId,
  rosterPlayers,
  usedPlayerIds,
  onAssign,
  showBenchOrder = false,
}: {
  slot: FormationSlot
  assignedPlayerId: string | null
  rosterPlayers: RosterPlayer[]
  usedPlayerIds: Set<string>
  onAssign: (playerId: string) => void
  showBenchOrder?: boolean
}) {
  // Compatible players for this slot
  const compatible = rosterPlayers.filter((p) =>
    playerSatisfiesSlot(p, slot)
  )

  const isCompatible = assignedPlayerId
    ? compatible.some((p) => p.id === assignedPlayerId)
    : true

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 shrink-0">
        <span className="text-xs font-mono font-semibold text-indigo-400">{slot.slot_name}</span>
        {showBenchOrder && slot.bench_order && (
          <span className="ml-1 text-xs text-[#55556a]">P{slot.bench_order}</span>
        )}
      </div>

      <div className="flex flex-1 flex-wrap gap-1">
        {slot.allowed_mantra_roles.map((r) => (
          <Badge key={r} variant="muted" className="text-xs">
            {r}
          </Badge>
        ))}
      </div>

      <select
        value={assignedPlayerId ?? ''}
        onChange={(e) => onAssign(e.target.value)}
        className={[
          'flex-1 max-w-xs rounded-lg border bg-[#1a1a24] px-2.5 py-1.5 text-sm',
          'focus:border-indigo-500 focus:outline-none',
          !isCompatible
            ? 'border-red-500/60 text-red-400'
            : assignedPlayerId
            ? 'border-green-500/40 text-white'
            : 'border-[#2e2e42] text-[#55556a]',
        ].join(' ')}
      >
        <option value="">— Seleziona —</option>
        {rosterPlayers.map((p) => {
          const compat = playerSatisfiesSlot(p, slot)
          const inUse = usedPlayerIds.has(p.id) && p.id !== assignedPlayerId
          return (
            <option
              key={p.id}
              value={p.id}
              disabled={inUse}
              style={{ color: compat ? undefined : '#888' }}
            >
              {p.full_name} ({p.mantra_roles.join('/')}) — {p.club}
              {inUse ? ' [in uso]' : ''}
              {!compat ? ' ⚠' : ''}
            </option>
          )
        })}
      </select>
    </div>
  )
}
