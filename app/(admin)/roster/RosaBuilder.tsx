'use client'

import { useState, useCallback, useRef, useTransition, useEffect } from 'react'
import { assignPlayerAction, releasePlayerAction } from './rosaActions'

// ============================================================
// Types
// ============================================================

export interface RosterPlayer {
  entry_id: string
  player_id: string
  full_name: string
  club: string
  mantra_roles: string[]
  rating_class: string
}

interface Team {
  id: string
  name: string
  manager_name: string
}

interface SearchResult {
  id: string
  full_name: string
  club: string
  mantra_roles: string[]
  rating_class: string
}

interface Props {
  teams: Team[]
  initialRosters: Record<string, RosterPlayer[]>
  leagueId: string
}

// ============================================================
// Constants
// ============================================================

const RC_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, ATT: 3 }

const RC_COLORS: Record<string, string> = {
  GK:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  DEF: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  MID: 'bg-green-500/20 text-green-300 border-green-500/30',
  ATT: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const MIN_ROSTER = 25
const MAX_ROSTER = 30
const MIN_GK = 2

// ============================================================
// Sub-components
// ============================================================

function RCBadge({ rc }: { rc: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-bold shrink-0',
        RC_COLORS[rc] ?? 'bg-[#2e2e42] text-[#8888aa] border-[#3a3a52]',
      ].join(' ')}
    >
      {rc}
    </span>
  )
}

// ============================================================
// Team status dot
// ============================================================

function statusDot(count: number, gkCount: number): { dot: string; title: string } {
  if (count < MIN_ROSTER || gkCount < MIN_GK) {
    return { dot: 'bg-red-500', title: `${count}/${MAX_ROSTER} — Rosa incompleta` }
  }
  if (count < MAX_ROSTER) {
    return { dot: 'bg-amber-400', title: `${count}/${MAX_ROSTER} — Rosa parziale` }
  }
  return { dot: 'bg-green-500', title: `${count}/${MAX_ROSTER} — Rosa completa` }
}

// ============================================================
// Validation banner
// ============================================================

function ValidationBanner({ roster }: { roster: RosterPlayer[] }) {
  const count = roster.length
  const gkCount = roster.filter((p) => p.rating_class === 'GK').length

  if (count >= MAX_ROSTER && gkCount >= MIN_GK) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
        Rosa completa ✓ ({count}/{MAX_ROSTER})
      </div>
    )
  }

  const messages: string[] = []

  if (count < MIN_ROSTER) {
    messages.push(`Rosa incompleta: ${count}/${MIN_ROSTER} minimi`)
  }
  if (gkCount < MIN_GK) {
    messages.push(`Almeno ${MIN_GK} portieri richiesti (${gkCount} attuali)`)
  }

  if (messages.length > 0) {
    return (
      <div className="space-y-1.5">
        {messages.map((msg) => (
          <div
            key={msg}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {msg}
          </div>
        ))}
      </div>
    )
  }

  // 25–29 and GK OK
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
      Rosa OK — aggiungi ancora {MAX_ROSTER - count} per completare
    </div>
  )
}

// ============================================================
// Debounce hook
// ============================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ============================================================
// Main component
// ============================================================

export function RosaBuilder({ teams, initialRosters, leagueId }: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    teams[0]?.id ?? null
  )
  const [rosters, setRosters] = useState<Record<string, RosterPlayer[]>>(initialRosters)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const searchRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  // ---- Close dropdown on outside click ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ---- Debounced search ----
  const doSearch = useCallback(
    async (q: string) => {
      if (!selectedTeamId || q.length < 2) {
        setSearchResults([])
        setShowDropdown(false)
        return
      }
      setSearchLoading(true)
      try {
        const url = `/api/pool/search?q=${encodeURIComponent(q)}&league_id=${encodeURIComponent(leagueId)}`
        const res = await fetch(url)
        if (!res.ok) {
          setSearchResults([])
          return
        }
        const json = (await res.json()) as { results?: SearchResult[] }
        setSearchResults(json.results ?? [])
        setShowDropdown(true)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    },
    [selectedTeamId, leagueId]
  )

  useEffect(() => {
    void doSearch(debouncedQuery)
  }, [debouncedQuery, doSearch])

  // ---- Assign player ----
  const handleAssign = useCallback(
    (player: SearchResult) => {
      if (!selectedTeamId) return
      setShowDropdown(false)
      setSearchQuery('')
      setErrorMessage(null)

      startTransition(async () => {
        const result = await assignPlayerAction(selectedTeamId, player.id)
        if (result.error) {
          setErrorMessage(result.error)
          return
        }

        const newEntry: RosterPlayer = {
          entry_id: result.rosterEntryId ?? '',
          player_id: result.leaguePlayerId ?? '',
          full_name: player.full_name,
          club: player.club,
          mantra_roles: player.mantra_roles,
          rating_class: player.rating_class,
        }

        setRosters((prev) => ({
          ...prev,
          [selectedTeamId]: [...(prev[selectedTeamId] ?? []), newEntry],
        }))
      })
    },
    [selectedTeamId]
  )

  // ---- Release player ----
  const handleRelease = useCallback(
    (teamId: string, entryId: string, playerName: string) => {
      if (!confirm(`Rilasciare ${playerName} dalla rosa?`)) return
      setErrorMessage(null)

      startTransition(async () => {
        const result = await releasePlayerAction(entryId)
        if (result.error) {
          setErrorMessage(result.error)
          return
        }
        setRosters((prev) => ({
          ...prev,
          [teamId]: (prev[teamId] ?? []).filter((p) => p.entry_id !== entryId),
        }))
      })
    },
    []
  )

  const selectedRoster = selectedTeamId ? (rosters[selectedTeamId] ?? []) : []

  // Sort roster: GK → DEF → MID → ATT, then by name
  const sortedRoster = [...selectedRoster].sort((a, b) => {
    const rcA = RC_ORDER[a.rating_class] ?? 99
    const rcB = RC_ORDER[b.rating_class] ?? 99
    if (rcA !== rcB) return rcA - rcB
    return a.full_name.localeCompare(b.full_name, 'it')
  })

  const selectedTeam = teams.find((t) => t.id === selectedTeamId)

  // ---- No teams ----
  if (teams.length === 0) {
    return (
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] px-6 py-10 text-center">
        <p className="text-[#8888aa]">Nessuna squadra trovata in questa lega.</p>
        <p className="mt-1 text-sm text-[#55556a]">
          Crea prima le squadre dalla pagina Lega.
        </p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* ---- Left panel: team list ---- */}
      <div className="w-64 shrink-0">
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] overflow-hidden">
          <div className="border-b border-[#2e2e42] px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#55556a]">
              Squadre
            </h3>
          </div>
          <div className="divide-y divide-[#1e1e2a]">
            {teams.map((team) => {
              const roster = rosters[team.id] ?? []
              const count = roster.length
              const gkCount = roster.filter((p) => p.rating_class === 'GK').length
              const { dot, title } = statusDot(count, gkCount)
              const isActive = team.id === selectedTeamId

              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(team.id)
                    setSearchQuery('')
                    setShowDropdown(false)
                    setErrorMessage(null)
                  }}
                  className={[
                    'w-full px-4 py-3 text-left transition-colors',
                    isActive
                      ? 'bg-indigo-500/10 border-l-2 border-indigo-500'
                      : 'hover:bg-[#13131e]',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-medium ${isActive ? 'text-indigo-300' : 'text-white'}`}
                      >
                        {team.name}
                      </p>
                      <p className="truncate text-xs text-[#55556a]">{team.manager_name}</p>
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full ${dot}`}
                      title={title}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-[#8888aa]">{count}/{MAX_ROSTER}</span>
                    <span
                      className={[
                        'text-xs',
                        gkCount >= MIN_GK ? 'text-green-500' : 'text-red-400',
                      ].join(' ')}
                    >
                      P: {gkCount}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ---- Right panel: selected team rosa ---- */}
      <div className="flex-1 min-w-0">
        {selectedTeam ? (
          <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] overflow-hidden">
            {/* Header */}
            <div className="border-b border-[#2e2e42] px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Rosa — {selectedTeam.name}</h3>
                <p className="text-xs text-[#55556a]">{selectedRoster.length}/{MAX_ROSTER} giocatori</p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Validation banner */}
              <ValidationBanner roster={selectedRoster} />

              {/* Error message */}
              {errorMessage && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {errorMessage}
                  <button
                    type="button"
                    onClick={() => setErrorMessage(null)}
                    className="ml-2 text-red-300 hover:text-red-200"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Search box */}
              <div ref={searchRef} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowDropdown(true)
                  }}
                  placeholder="Aggiungi giocatore..."
                  className="w-full rounded-lg border border-[#2e2e42] bg-[#13131e] px-3 py-2 text-sm text-[#f0f0fa] placeholder-[#55556a] outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
                  disabled={isPending}
                />

                {/* Loading indicator */}
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#55556a]">
                    …
                  </div>
                )}

                {/* Dropdown */}
                {showDropdown && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#2e2e42] bg-[#13131e] shadow-xl overflow-hidden">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-[#55556a]">
                        Nessun risultato per &quot;{debouncedQuery}&quot;
                      </div>
                    ) : (
                      <div className="divide-y divide-[#1e1e2a]">
                        {searchResults.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => handleAssign(player)}
                            className="w-full px-3 py-2.5 text-left hover:bg-[#1a1a2e] transition-colors flex items-center gap-2.5"
                          >
                            <RCBadge rc={player.rating_class} />
                            <div className="flex-1 min-w-0">
                              <span className="block text-sm font-medium text-white truncate">
                                {player.full_name}
                              </span>
                              <span className="block text-xs text-[#55556a] truncate">
                                {player.club}
                                {player.mantra_roles.length > 0
                                  ? ` — ${player.mantra_roles.join('/')}`
                                  : ''}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Player list */}
              {sortedRoster.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#2e2e42] px-4 py-8 text-center">
                  <p className="text-sm text-[#55556a]">Nessun giocatore in rosa.</p>
                  <p className="mt-1 text-xs text-[#3a3a52]">
                    Usa la ricerca per aggiungere giocatori dal pool.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#2e2e42]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2e2e42] text-left">
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                          Classe
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                          Giocatore
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                          Squadra
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                          Ruoli
                        </th>
                        <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-[#8888aa] w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e2a]">
                      {sortedRoster.map((player) => (
                        <tr key={player.entry_id} className="hover:bg-[#0f0f1a] group">
                          <td className="px-3 py-2">
                            <RCBadge rc={player.rating_class} />
                          </td>
                          <td className="px-3 py-2 font-medium text-white">
                            {player.full_name}
                          </td>
                          <td className="px-3 py-2 text-[#8888aa] text-xs">
                            {player.club}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {player.mantra_roles.map((role) => (
                                <span
                                  key={role}
                                  className="rounded bg-[#1e1e2e] px-1.5 py-0.5 text-xs text-[#8888aa] border border-[#2e2e42]"
                                >
                                  {role}
                                </span>
                              ))}
                              {player.mantra_roles.length === 0 && (
                                <span className="text-xs text-[#55556a]">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleRelease(
                                  selectedTeamId!,
                                  player.entry_id,
                                  player.full_name
                                )
                              }
                              disabled={isPending}
                              title={`Rilascia ${player.full_name}`}
                              className="opacity-0 group-hover:opacity-100 rounded px-1.5 py-0.5 text-xs text-[#55556a] hover:bg-red-500/20 hover:text-red-400 transition-all disabled:cursor-not-allowed"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[#2e2e42] px-4 py-12 text-center">
            <p className="text-[#55556a]">Seleziona una squadra dalla lista.</p>
          </div>
        )}
      </div>
    </div>
  )
}
