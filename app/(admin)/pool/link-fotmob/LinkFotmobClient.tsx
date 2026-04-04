'use client'

import { useState, useTransition, useMemo } from 'react'
import { linkFotmobPlayerAction, ignoreForeverAction, ignoreAllUnmatchedAction } from './actions'

export type UnmatchedEntry = {
  matchday_id: string
  matchday_name: string
  fotmob_player_id: number
  fotmob_name: string
  fotmob_team: string | null
}

export type LeaguePlayerOption = {
  id: string
  full_name: string
  club: string
  rating_class: string
  fotmob_player_id: number | null
}

function normalizeSearch(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

function PlayerSearch({
  options,
  onSelect,
}: {
  options: LeaguePlayerOption[]
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LeaguePlayerOption | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return []
    const q = normalizeSearch(query)
    return options
      .filter(o => normalizeSearch(o.full_name).includes(q) || normalizeSearch(o.club).includes(q))
      .slice(0, 8)
  }, [query, options])

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-white">{selected.full_name}</span>
        <span className="text-xs text-[#55556a]">{selected.club}</span>
        {selected.fotmob_player_id != null && (
          <span className="text-xs text-amber-400">ha già ID {selected.fotmob_player_id}</span>
        )}
        <button
          type="button"
          onClick={() => { setSelected(null); setQuery(''); onSelect(''); }}
          className="text-xs text-[#55556a] hover:text-white ml-1"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Cerca giocatore…"
        className="w-full rounded border border-[#3a3a52] bg-[#1a1a2e] px-2 py-1 text-sm text-white placeholder-[#55556a] focus:outline-none focus:border-indigo-500"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-[#3a3a52] bg-[#1a1a2e] shadow-lg">
          {filtered.map(o => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => { setSelected(o); setQuery(o.full_name); onSelect(o.id); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[#2a2a42]"
              >
                <span className="text-white">{o.full_name}</span>
                <span className="text-xs text-[#55556a]">{o.club}</span>
                <span className="text-xs text-[#55556a] ml-auto">{o.rating_class}</span>
                {o.fotmob_player_id != null && (
                  <span className="text-xs text-amber-400">ID{o.fotmob_player_id}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function UnmatchedRow({
  entry,
  options,
}: {
  entry: UnmatchedEntry
  options: LeaguePlayerOption[]
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleLink = () => {
    if (!selectedPlayerId) return
    startTransition(async () => {
      const res = await linkFotmobPlayerAction(selectedPlayerId, entry.fotmob_player_id)
      if (res.ok) {
        setMsg({ ok: true, text: 'Collegato!' })
        setTimeout(() => setDismissed(true), 1000)
      } else {
        setMsg({ ok: false, text: res.error })
      }
    })
  }

  const handleIgnoreForever = () => {
    startTransition(async () => {
      const res = await ignoreForeverAction(entry.fotmob_player_id, entry.fotmob_name)
      if (res.ok) setDismissed(true)
      else setMsg({ ok: false, text: res.error })
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-[#3a3a52] bg-[#16162a] p-3 sm:flex-row sm:items-center">
      {/* FotMob info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-white">{entry.fotmob_name}</span>
          {entry.fotmob_team && (
            <span className="text-xs text-[#55556a]">{entry.fotmob_team}</span>
          )}
          <span className="text-xs text-[#55556a]">ID {entry.fotmob_player_id}</span>
        </div>
        <div className="mt-0.5 text-xs text-[#55556a]">{entry.matchday_name}</div>
      </div>

      {/* Search + link */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {msg ? (
          <span className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</span>
        ) : (
          <>
            <div className="flex-1">
              <PlayerSearch options={options} onSelect={setSelectedPlayerId} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!selectedPlayerId || isPending}
                onClick={handleLink}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {isPending ? '…' : 'Collega'}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleIgnoreForever}
                className="rounded border border-[#3a3a52] px-3 py-1 text-xs text-[#55556a] hover:text-white disabled:opacity-40"
                title="Non è un tuo giocatore — ignora per sempre in tutte le giornate future"
              >
                Ignora sempre
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function LinkFotmobClient({
  unmatched,
  leaguePlayers,
}: {
  unmatched: UnmatchedEntry[]
  leaguePlayers: LeaguePlayerOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [ignored, setIgnored] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  if (unmatched.length === 0 || ignored) {
    return (
      <p className="text-sm text-[#55556a]">
        Nessun giocatore FotMob da collegare. Ottimo!
      </p>
    )
  }

  const handleIgnoreAll = () => {
    startTransition(async () => {
      const res = await ignoreAllUnmatchedAction(
        unmatched.map(e => ({ fotmob_player_id: e.fotmob_player_id, fotmob_name: e.fotmob_name }))
      )
      if (res.ok) setIgnored(true)
      else setBulkMsg(res.error)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleIgnoreAll}
          className="rounded border border-[#3a3a52] px-3 py-1.5 text-xs text-[#55556a] hover:text-white disabled:opacity-40"
        >
          {isPending ? '…' : `Ignora sempre tutti (${unmatched.length})`}
        </button>
        {bulkMsg && <span className="text-xs text-red-400">{bulkMsg}</span>}
      </div>
      <div className="space-y-2">
        {unmatched.map(entry => (
          <UnmatchedRow
            key={`${entry.matchday_id}-${entry.fotmob_player_id}`}
            entry={entry}
            options={leaguePlayers}
          />
        ))}
      </div>
    </div>
  )
}
