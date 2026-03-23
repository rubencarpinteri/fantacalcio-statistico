'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { upsertStatsAction, exportStatsCsvAction } from './actions'
import type { StatRowInput } from './actions'
import type { RatingClass } from '@/types/database.types'

// ---- Types ----------------------------------------------------------------

interface Player {
  id: string
  full_name: string
  club: string
  mantra_roles: string[]
  primary_mantra_role: string | null
  rating_class: RatingClass
  is_active: boolean
}

interface ExistingStat {
  player_id: string
  minutes_played: number
  rating_class_override: RatingClass | null
  sofascore_rating: number | null
  fotmob_rating: number | null
  tackles_won: number
  interceptions: number
  clearances: number
  blocks: number
  aerial_duels_won: number
  dribbled_past: number
  saves: number
  goals_conceded: number
  error_leading_to_goal: number
  penalties_saved: number
  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  clean_sheet: boolean
  key_passes: number | null
  expected_assists: number | null
  successful_dribbles: number | null
  dribble_success_rate: number | null
  completed_passes: number | null
  pass_accuracy: number | null
  final_third_passes: number | null
  progressive_passes: number | null
  is_provisional: boolean
  has_decisive_event: boolean
}

interface StatsGridProps {
  matchdayId: string
  players: Player[]
  existingStats: ExistingStat[]
  lineupPlayerIds: string[]
  isEditable: boolean
}

// ---- Default stat row for a player without existing stats -----------------

function emptyRow(playerId: string): StatRowInput {
  return {
    player_id: playerId,
    minutes_played: 0,
    rating_class_override: null,
    sofascore_rating: null,
    fotmob_rating: null,
    tackles_won: 0, interceptions: 0, clearances: 0, blocks: 0,
    aerial_duels_won: 0, dribbled_past: 0, saves: 0,
    goals_conceded: 0, error_leading_to_goal: 0, penalties_saved: 0,
    goals_scored: 0, assists: 0, own_goals: 0,
    yellow_cards: 0, red_cards: 0,
    penalties_scored: 0, penalties_missed: 0,
    clean_sheet: false,
    key_passes: null, expected_assists: null, successful_dribbles: null,
    dribble_success_rate: null, completed_passes: null, pass_accuracy: null,
    final_third_passes: null, progressive_passes: null,
    is_provisional: false,
    has_decisive_event: false,
  }
}

// ---- Active tab -----------------------------------------------------------

type TabKey = 'evento' | 'voti' | 'difensivo' | 'avanzato'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'evento',    label: 'Evento' },
  { key: 'voti',      label: 'Voti' },
  { key: 'difensivo', label: 'Difensivo' },
  { key: 'avanzato',  label: 'Avanzato' },
]

const RATING_CLASS_ORDER: RatingClass[] = ['GK', 'DEF', 'MID', 'ATT']
const RATING_CLASS_LABELS: Record<RatingClass, string> = {
  GK: 'Portieri', DEF: 'Difensori', MID: 'Centrocampisti', ATT: 'Attaccanti',
}

// ---- Main component -------------------------------------------------------

export function StatsGrid({
  matchdayId,
  players,
  existingStats,
  lineupPlayerIds,
  isEditable,
}: StatsGridProps) {
  const lineupSet = new Set(lineupPlayerIds)

  // Initialize grid state from existing stats
  const initialRows = () => {
    const map: Record<string, StatRowInput> = {}
    for (const p of players) {
      const existing = existingStats.find((s) => s.player_id === p.id)
      map[p.id] = existing
        ? { ...existing, rating_class_override: existing.rating_class_override ?? null }
        : emptyRow(p.id)
    }
    return map
  }

  const [rows, setRows] = useState<Record<string, StatRowInput>>(initialRows)
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<TabKey>('evento')
  const [saveResult, setSaveResult] = useState<{ error: string | null; saved?: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showOnlyLineup, setShowOnlyLineup] = useState(false)
  const [showOnlyDirty, setShowOnlyDirty] = useState(false)

  const updateField = useCallback(
    (playerId: string, field: keyof StatRowInput, value: unknown) => {
      setRows((prev) => ({
        ...prev,
        [playerId]: { ...prev[playerId]!, [field]: value },
      }))
      setDirty((prev) => new Set([...prev, playerId]))
      setSaveResult(null)
    },
    []
  )

  const saveAll = () => {
    if (dirty.size === 0) return
    const dirtyRows = Array.from(dirty)
      .map((id) => rows[id])
      .filter(Boolean) as StatRowInput[]

    startTransition(async () => {
      const result = await upsertStatsAction({ matchday_id: matchdayId, rows: dirtyRows })
      if (!result.error) {
        setDirty(new Set())
        setSaveResult({ error: null, saved: result.upserted_count })
      } else {
        setSaveResult({ error: result.error })
      }
    })
  }

  const exportCsv = () => {
    startTransition(async () => {
      const csv = await exportStatsCsvAction(matchdayId)
      if (!csv) return
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `statistiche_giornata_${matchdayId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  // Filter and group players
  const filteredPlayers = players.filter((p) => {
    if (showOnlyLineup && !lineupSet.has(p.id)) return false
    if (showOnlyDirty && !dirty.has(p.id)) return false
    return true
  })

  const grouped = RATING_CLASS_ORDER.reduce<Record<RatingClass, Player[]>>(
    (acc, rc) => {
      acc[rc] = filteredPlayers.filter((p) => p.rating_class === rc)
      return acc
    },
    { GK: [], DEF: [], MID: [], ATT: [] }
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {isEditable && (
          <Button
            variant="primary"
            loading={isPending}
            disabled={dirty.size === 0}
            onClick={saveAll}
          >
            Salva modifiche {dirty.size > 0 && `(${dirty.size})`}
          </Button>
        )}
        <Button variant="ghost" onClick={exportCsv} loading={isPending}>
          Esporta CSV
        </Button>
        <a
          href={`/matchdays/${matchdayId}/stats/import`}
          className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-sm text-[#8888aa] hover:border-indigo-500/50 hover:text-white transition-colors"
        >
          Importa CSV
        </a>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-[#8888aa] select-none">
          <input
            type="checkbox"
            checked={showOnlyLineup}
            onChange={(e) => setShowOnlyLineup(e.target.checked)}
            className="rounded border-[#2e2e42] bg-[#1a1a24] accent-indigo-500"
          />
          Solo in formazione
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-[#8888aa] select-none">
          <input
            type="checkbox"
            checked={showOnlyDirty}
            onChange={(e) => setShowOnlyDirty(e.target.checked)}
            className="rounded border-[#2e2e42] bg-[#1a1a24] accent-indigo-500"
          />
          Solo modificati
        </label>
      </div>

      {/* Save feedback */}
      {saveResult?.error && <Alert variant="error">{saveResult.error}</Alert>}
      {saveResult && !saveResult.error && (
        <Alert variant="success">{saveResult.saved} righe salvate.</Alert>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'text-[#8888aa] hover:text-white',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid groups */}
      {RATING_CLASS_ORDER.map((rc) => {
        const group = grouped[rc]
        if (group.length === 0) return null
        return (
          <div key={rc}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#8888aa]">
              {RATING_CLASS_LABELS[rc]} ({group.length})
            </p>
            <div className="overflow-x-auto rounded-xl border border-[#2e2e42]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42]">
                    <th className="sticky left-0 z-10 bg-[#0a0a0f] px-3 py-2 text-left text-xs font-medium text-[#8888aa] min-w-[160px]">
                      Giocatore
                    </th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-[#8888aa] w-12">Min</th>
                    <th className="px-2 py-2 text-center text-xs font-medium text-[#8888aa] w-10">Prov</th>
                    <TabHeaders tab={activeTab} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2a]">
                  {group.map((player) => (
                    <StatRow
                      key={player.id}
                      player={player}
                      row={rows[player.id] ?? emptyRow(player.id)}
                      isDirty={dirty.has(player.id)}
                      isInLineup={lineupSet.has(player.id)}
                      isEditable={isEditable}
                      activeTab={activeTab}
                      onUpdate={updateField}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {filteredPlayers.length === 0 && (
        <p className="py-8 text-center text-sm text-[#55556a]">Nessun giocatore trovato con i filtri attivi.</p>
      )}
    </div>
  )
}

// ---- Tab column headers ---------------------------------------------------

function TabHeaders({ tab }: { tab: TabKey }) {
  if (tab === 'evento') return (
    <>
      <Th>Gol</Th><Th>Ass</Th><Th>AG</Th>
      <Th>GS</Th><Th>CS</Th>
      <Th>G</Th><Th>R</Th>
      <Th>RS</Th><Th>RM</Th><Th>RP</Th>
    </>
  )
  if (tab === 'voti') return (
    <>
      <Th>SofaS</Th><Th>WhoSc</Th><Th>FotM</Th>
    </>
  )
  if (tab === 'difensivo') return (
    <>
      <Th>Tkl</Th><Th>Int</Th><Th>Clr</Th>
      <Th>Blk</Th><Th>DA</Th><Th>Slt</Th>
      <Th>Par</Th><Th>ELG</Th>
    </>
  )
  // avanzato
  return (
    <>
      <Th>KP</Th><Th>xA</Th><Th>Drib</Th>
      <Th>%Drib</Th><Th>Pas</Th><Th>%Pas</Th>
      <Th>T3P</Th><Th>ProgP</Th>
    </>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-1.5 py-2 text-center text-xs font-medium text-[#8888aa] min-w-[46px]">
      {children}
    </th>
  )
}

// ---- Individual stat row --------------------------------------------------

function StatRow({
  player,
  row,
  isDirty,
  isInLineup,
  isEditable,
  activeTab,
  onUpdate,
}: {
  player: Player
  row: StatRowInput
  isDirty: boolean
  isInLineup: boolean
  isEditable: boolean
  activeTab: TabKey
  onUpdate: (playerId: string, field: keyof StatRowInput, value: unknown) => void
}) {
  const pid = player.id

  const num = (field: keyof StatRowInput) => (
    <NumCell
      value={row[field] as number | null}
      disabled={!isEditable}
      onChange={(v) => onUpdate(pid, field, v)}
    />
  )

  const bool = (field: keyof StatRowInput) => (
    <BoolCell
      value={row[field] as boolean}
      disabled={!isEditable}
      onChange={(v) => onUpdate(pid, field, v)}
    />
  )

  return (
    <tr
      className={[
        'transition-colors',
        isDirty ? 'bg-indigo-500/5' : '',
        isInLineup ? 'border-l-2 border-l-indigo-500/40' : '',
      ].join(' ')}
    >
      {/* Sticky name cell */}
      <td className="sticky left-0 z-10 bg-[#0a0a0f] px-3 py-2">
        <div className="flex items-center gap-2">
          {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />}
          <div className="min-w-0">
            <p className="truncate text-sm text-white max-w-[140px]">{player.full_name}</p>
            <p className="text-xs text-[#55556a]">{player.club} · {player.mantra_roles.join('/')}</p>
          </div>
          {isInLineup && (
            <Badge variant="muted" className="text-xs shrink-0">In campo</Badge>
          )}
        </div>
      </td>

      {/* Minutes */}
      <td className="px-1.5 py-2">
        <NumCell
          value={row.minutes_played as number}
          disabled={!isEditable}
          max={120}
          onChange={(v) => onUpdate(pid, 'minutes_played', v ?? 0)}
          className="w-12"
        />
      </td>

      {/* Provisional toggle */}
      <td className="px-1.5 py-2 text-center">
        <BoolCell
          value={row.is_provisional as boolean}
          disabled={!isEditable}
          onChange={(v) => onUpdate(pid, 'is_provisional', v)}
          trueClass="text-amber-400"
          label={row.is_provisional ? 'P' : '✓'}
        />
      </td>

      {/* Tab-specific columns */}
      {activeTab === 'evento' && (
        <>
          {num('goals_scored')}
          {num('assists')}
          {num('own_goals')}
          {num('goals_conceded')}
          {bool('clean_sheet')}
          {num('yellow_cards')}
          {num('red_cards')}
          {num('penalties_scored')}
          {num('penalties_missed')}
          {num('penalties_saved')}
        </>
      )}
      {activeTab === 'voti' && (
        <>
          {num('sofascore_rating')}
          {num('fotmob_rating')}
        </>
      )}
      {activeTab === 'difensivo' && (
        <>
          {num('tackles_won')}
          {num('interceptions')}
          {num('clearances')}
          {num('blocks')}
          {num('aerial_duels_won')}
          {num('dribbled_past')}
          {num('saves')}
          {num('error_leading_to_goal')}
        </>
      )}
      {activeTab === 'avanzato' && (
        <>
          {num('key_passes')}
          {num('expected_assists')}
          {num('successful_dribbles')}
          {num('dribble_success_rate')}
          {num('completed_passes')}
          {num('pass_accuracy')}
          {num('final_third_passes')}
          {num('progressive_passes')}
        </>
      )}
    </tr>
  )
}

// ---- Cell primitives ------------------------------------------------------

function NumCell({
  value,
  onChange,
  disabled,
  max,
  className = '',
}: {
  value: number | null
  onChange: (v: number | null) => void
  disabled: boolean
  max?: number
  className?: string
}) {
  const [local, setLocal] = useState(value == null ? '' : String(value))

  const commit = () => {
    if (local === '' || local === '-') {
      onChange(null)
      return
    }
    const n = parseFloat(local.replace(',', '.'))
    if (!isNaN(n)) onChange(n)
    else setLocal(value == null ? '' : String(value))
  }

  return (
    <td className={`px-1.5 py-2 ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        className={[
          'w-full min-w-[40px] rounded border bg-transparent px-1.5 py-0.5 text-center text-sm',
          'focus:border-indigo-500 focus:outline-none',
          disabled
            ? 'border-transparent text-[#8888aa] cursor-default'
            : 'border-[#2e2e42] text-white hover:border-[#3e3e52]',
        ].join(' ')}
        max={max}
      />
    </td>
  )
}

function BoolCell({
  value,
  onChange,
  disabled,
  trueClass = 'text-green-400',
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  trueClass?: string
  label?: string
}) {
  return (
    <td className="px-1.5 py-2 text-center">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={[
          'text-sm font-medium transition-colors',
          disabled ? 'cursor-default' : 'cursor-pointer',
          value ? trueClass : 'text-[#55556a] hover:text-[#8888aa]',
        ].join(' ')}
      >
        {label ?? (value ? '✓' : '—')}
      </button>
    </td>
  )
}
