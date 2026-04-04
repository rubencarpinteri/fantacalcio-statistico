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
  teamId: string
  formations: SlimFormation[]
  rosterPlayers: RosterPlayer[]
  currentSubmission: CurrentSubmission | null
  isReadOnly: boolean
}

type Assignments = Record<string, string>

const ROLE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Por: { bg: 'bg-yellow-900/60', text: 'text-yellow-300', border: 'border-yellow-500/50' },
  Dc:  { bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-500/50'   },
  B:   { bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-500/50'   },
  Dd:  { bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-500/50'   },
  Ds:  { bg: 'bg-blue-900/60',   text: 'text-blue-300',   border: 'border-blue-500/50'   },
  E:   { bg: 'bg-teal-900/60',   text: 'text-teal-300',   border: 'border-teal-500/50'   },
  M:   { bg: 'bg-green-900/60',  text: 'text-green-300',  border: 'border-green-500/50'  },
  C:   { bg: 'bg-green-900/60',  text: 'text-green-300',  border: 'border-green-500/50'  },
  T:   { bg: 'bg-orange-900/60', text: 'text-orange-300', border: 'border-orange-500/50' },
  W:   { bg: 'bg-orange-900/60', text: 'text-orange-300', border: 'border-orange-500/50' },
  A:   { bg: 'bg-red-900/60',    text: 'text-red-300',    border: 'border-red-500/50'    },
  Pc:  { bg: 'bg-red-900/60',    text: 'text-red-300',    border: 'border-red-500/50'    },
}

function rs(role: string) {
  return ROLE_STYLE[role] ?? { bg: 'bg-indigo-900/60', text: 'text-indigo-300', border: 'border-indigo-500/50' }
}

function parseRows(name: string): number[] {
  return name.split('-').map(Number).filter(n => !isNaN(n) && n > 0)
}

const ALL_ROLES = ['Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

export function LineupBuilder({
  matchdayId,
  teamId,
  formations,
  rosterPlayers,
  currentSubmission,
  isReadOnly,
}: LineupBuilderProps) {
  const [selectedFormationId, setSelectedFormationId] = useState(
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
      .then(r => r.json())
      .then((data: FormationSlot[]) => {
        setSlots(data)
        if (selectedFormationId !== currentSubmission?.formation_id) {
          setAssignments({})
        } else {
          const pre: Assignments = {}
          for (const sp of currentSubmission?.players ?? []) pre[sp.slot_id] = sp.player_id
          setAssignments(pre)
        }
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [selectedFormationId]) // eslint-disable-line

  const starterSlots = slots.filter(s => !s.is_bench)
  const benchSlots   = slots.filter(s =>  s.is_bench).sort((a, b) => (a.bench_order ?? 0) - (b.bench_order ?? 0))
  const usedPlayerIds = new Set(Object.values(assignments).filter(Boolean))
  const playerMap = new Map(rosterPlayers.map(p => [p.id, p]))
  const activeSlot = activeSlotId ? slots.find(s => s.id === activeSlotId) ?? null : null
  const selectedFormation = formations.find(f => f.id === selectedFormationId)

  // Distribute starter slots onto pitch rows
  const gkSlot = starterSlots[0] ?? null
  const outfield = starterSlots.slice(1)
  const rowCounts = selectedFormation ? parseRows(selectedFormation.name) : []
  const pitchRows: FormationSlot[][] = []
  let cur = 0
  for (const n of rowCounts) {
    pitchRows.push(outfield.slice(cur, cur + n))
    cur += n
  }

  function assign(slotId: string, playerId: string) {
    setAssignments(prev => {
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

  function removeFromSlot(slotId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    setAssignments(prev => { const next = { ...prev }; delete next[slotId]; return next })
  }

  const assignmentList = slots.flatMap(slot => {
    const pid = assignments[slot.id]
    if (!pid) return []
    return [{ player_id: pid, slot_id: slot.id, is_bench: slot.is_bench, bench_order: slot.bench_order, assigned_mantra_role: null }]
  })

  const validation = validateLineup({
    slots,
    players: playerMap,
    assignments: assignmentList.map(a => ({
      playerId: a.player_id, slotId: a.slot_id,
      isBench: a.is_bench, benchOrder: a.bench_order, assignedMantraRole: null,
    })),
    isDraft: true,
  })

  function submit(isDraft: boolean) {
    startTransition(async () => {
      const res = await submitLineupAction({
        matchday_id: matchdayId,
        team_id: teamId,
        formation_id: selectedFormationId,
        is_draft: isDraft,
        assignments: assignmentList,
      })
      setResult(res)
    })
  }

  const visiblePlayers = rosterPlayers
    .filter(p => {
      const matchSearch = !playerSearch.trim() ||
        p.full_name.toLowerCase().includes(playerSearch.toLowerCase()) ||
        p.club.toLowerCase().includes(playerSearch.toLowerCase())
      const matchRole = !roleFilter || p.mantra_roles.includes(roleFilter)
      return matchSearch && matchRole
    })
    .sort((a, b) => {
      if (activeSlot) {
        const ac = playerSatisfiesSlot(a, activeSlot)
        const bc = playerSatisfiesSlot(b, activeSlot)
        if (ac && !bc) return -1
        if (!ac && bc) return 1
      }
      const au = usedPlayerIds.has(a.id)
      const bu = usedPlayerIds.has(b.id)
      if (!au && bu) return -1
      if (au && !bu) return 1
      return a.full_name.localeCompare(b.full_name)
    })

  if (isReadOnly) {
    return <Alert variant="warning">La giornata non è aperta. La formazione è in sola lettura.</Alert>
  }

  function SlotCard({ slot }: { slot: FormationSlot }) {
    const player = assignments[slot.id] ? playerMap.get(assignments[slot.id]!) : null
    const isActive = activeSlotId === slot.id
    const style = rs(slot.allowed_mantra_roles[0] ?? '')

    return (
      <div
        onClick={() => setActiveSlotId(isActive ? null : slot.id)}
        className={[
          'relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer transition-all select-none flex-1',
          'min-h-[62px] px-1 py-1.5',
          isActive
            ? 'border-white bg-white/25 shadow-lg scale-105 z-10'
            : player
            ? `${style.border} ${style.bg}`
            : 'border-white/25 bg-black/20 hover:border-white/50',
        ].join(' ')}
      >
        <span className={`text-[10px] font-bold uppercase tracking-wide leading-none ${isActive ? 'text-white' : 'text-white/50'}`}>
          {slot.slot_name}
        </span>
        {player ? (
          <>
            <span className={`text-[11px] font-semibold text-center leading-tight mt-1 px-0.5 ${isActive ? 'text-white' : style.text}`}>
              {player.full_name.split(' ').slice(-1)[0]}
            </span>
            <button
              onClick={e => removeFromSlot(slot.id, e)}
              className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center hover:bg-red-400 z-20"
            >
              ✕
            </button>
          </>
        ) : (
          <span className="text-base text-white/20 mt-0.5 leading-none">{isActive ? '●' : '+'}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto">

      {/* Top bar: status + formation picker */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {currentSubmission ? (
          <Badge variant={currentSubmission.status === 'submitted' ? 'success' : 'warning'}>
            {currentSubmission.status === 'submitted'
              ? `✓ Inviata #${currentSubmission.submission_number}`
              : `Bozza #${currentSubmission.submission_number}`}
          </Badge>
        ) : <div />}
        <select
          value={selectedFormationId}
          onChange={e => setSelectedFormationId(e.target.value)}
          className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-1.5 text-sm font-semibold text-white focus:border-indigo-500 focus:outline-none"
        >
          {formations.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {loadingSlots ? (
        <p className="text-center text-sm text-[#55556a] py-12">Caricamento…</p>
      ) : (
        <>
          {/* ── PITCH ─────────────────────────────────── */}
          <div
            className="relative rounded-2xl p-3 flex flex-col gap-2"
            style={{
              background: 'linear-gradient(180deg, #14532d 0%, #166534 30%, #15803d 60%, #16a34a 85%, #15803d 100%)',
              boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            {/* Pitch lines decoration */}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-white/15 -translate-y-1/2" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
            <div className="pointer-events-none absolute inset-x-10 top-2 h-8 rounded-t-xl border-b-0 border border-white/10" />
            <div className="pointer-events-none absolute inset-x-10 bottom-2 h-8 rounded-b-xl border-t-0 border border-white/10" />

            {/* GK — top */}
            {gkSlot && (
              <div className="flex justify-center px-6 relative z-0">
                <div className="w-28"><SlotCard slot={gkSlot} /></div>
              </div>
            )}

            {/* Outfield rows: defense → ... → attack (bottom) */}
            {pitchRows.map((row, i) => (
              <div key={i} className="flex gap-2 px-1 relative z-0">
                {row.map(slot => <SlotCard key={slot.id} slot={slot} />)}
              </div>
            ))}
          </div>

          {/* ── BENCH ──────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8888aa] mb-2">
              Panchina · ordine sostituzione
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {benchSlots.map(slot => {
                const player = assignments[slot.id] ? playerMap.get(assignments[slot.id]!) : null
                const isActive = activeSlotId === slot.id
                return (
                  <div
                    key={slot.id}
                    onClick={() => setActiveSlotId(isActive ? null : slot.id)}
                    className={[
                      'relative flex flex-col items-center justify-center rounded-xl border-2 cursor-pointer shrink-0 transition-all',
                      'w-[58px] h-[58px]',
                      isActive
                        ? 'border-white bg-white/20 scale-105'
                        : player
                        ? 'border-[#3e3e5a] bg-[#1e1e2e]'
                        : 'border-[#2e2e42] bg-[#12121a]',
                    ].join(' ')}
                  >
                    <span className="text-[9px] font-bold text-[#55556a]">P{slot.bench_order}</span>
                    {player ? (
                      <>
                        <span className="text-[10px] text-white font-medium leading-tight text-center px-0.5">
                          {player.full_name.split(' ').slice(-1)[0]}
                        </span>
                        <button
                          onClick={e => removeFromSlot(slot.id, e)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center"
                        >✕</button>
                      </>
                    ) : (
                      <span className="text-sm text-[#3e3e52]">{isActive ? '●' : '+'}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── PLAYER POOL ────────────────────────────── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8888aa]">
                {activeSlotId ? `Scegli per: ${activeSlot?.slot_name}` : 'I tuoi giocatori'}
              </p>
              <span className="text-xs text-[#55556a]">
                {rosterPlayers.length - usedPlayerIds.size} / {rosterPlayers.length} disponibili
              </span>
            </div>

            <input
              type="text"
              placeholder="Cerca per nome o squadra…"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              className="w-full rounded-xl border border-[#2e2e42] bg-[#1a1a24] px-4 py-2.5 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
            />

            {/* Role chips */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setRoleFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                  roleFilter === null ? 'bg-white text-black border-white' : 'border-[#2e2e42] text-[#8888aa] hover:border-white/40 hover:text-white'
                }`}
              >Tutti</button>
              {ALL_ROLES.map(r => {
                const s = rs(r)
                return (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(roleFilter === r ? null : r)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold border transition-colors ${
                      roleFilter === r ? 'bg-white text-black border-white' : `${s.border} ${s.text} ${s.bg}`
                    }`}
                  >{r}</button>
                )
              })}
            </div>

            {/* Player cards */}
            <div className="space-y-1.5">
              {visiblePlayers.length === 0 && (
                <p className="text-center text-sm text-[#55556a] py-8">Nessun giocatore trovato</p>
              )}
              {visiblePlayers.map(player => {
                const isUsed = usedPlayerIds.has(player.id)
                const isCompatible = activeSlot ? playerSatisfiesSlot(player, activeSlot) : null
                const prs = rs(player.mantra_roles[0] ?? '')

                return (
                  <div
                    key={player.id}
                    onClick={() => { if (!activeSlotId || isUsed) return; assign(activeSlotId, player.id) }}
                    className={[
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
                      isUsed
                        ? 'opacity-30 cursor-not-allowed border-[#2e2e42] bg-[#12121a]'
                        : activeSlotId
                        ? isCompatible
                          ? 'cursor-pointer border-green-500/60 bg-green-950/60 active:scale-[0.98]'
                          : 'cursor-pointer border-[#2e2e42] bg-[#12121a] opacity-50'
                        : 'border-[#2e2e42] bg-[#12121a]',
                    ].join(' ')}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${prs.bg} ${prs.text} ${prs.border}`}>
                      {player.mantra_roles[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{player.full_name}</p>
                      <p className="text-xs text-[#8888aa]">{player.mantra_roles.join(' · ')} · {player.club}</p>
                    </div>
                    {isUsed && <span className="text-xs text-[#55556a] shrink-0">in uso</span>}
                    {!isUsed && activeSlotId && isCompatible === true && <span className="text-green-400 text-lg shrink-0">+</span>}
                    {!isUsed && activeSlotId && isCompatible === false && <span className="text-xs text-[#55556a] shrink-0">⚠</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── VALIDATION + SUBMIT ─────────────────────── */}
          <div className="space-y-3 pb-6">
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
                {result.submissionNumber !== undefined ? `✓ Versione #${result.submissionNumber} salvata.` : '✓ Formazione salvata.'}
              </Alert>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" loading={isPending} onClick={() => submit(true)} className="flex-1">
                Salva bozza
              </Button>
              <Button variant="primary" loading={isPending} disabled={!validation.valid} onClick={() => submit(false)} className="flex-1">
                Invia ⚽
              </Button>
            </div>
            <a href={`/matchdays/${matchdayId}/lineup/history`} className="block text-center text-xs text-[#55556a] hover:text-indigo-400">
              Storico invii →
            </a>
          </div>
        </>
      )}
    </div>
  )
}
