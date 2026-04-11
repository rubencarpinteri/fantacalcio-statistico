'use client'

import { useState, useEffect } from 'react'
import { parseSofaScoreLineupsJson, type SofaScoreFantasyStat } from '@/lib/ratings/parse'

interface FixtureItem {
  sofascoreEventId: number
  label: string
}

interface Props {
  matchdayId: string
  fixtures: FixtureItem[]
}

export function ssRatingsKey(matchdayId: string) {
  return `ss_ratings_${matchdayId}`
}

export function loadSsStats(matchdayId: string): Record<string, SofaScoreFantasyStat> | null {
  try {
    const raw = localStorage.getItem(ssRatingsKey(matchdayId))
    return raw ? (JSON.parse(raw) as Record<string, SofaScoreFantasyStat>) : null
  } catch {
    return null
  }
}

export function SofaScoreManualImport({ matchdayId, fixtures }: Props) {
  const [text, setText] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [lastAdded, setLastAdded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore saved count from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ssRatingsKey(matchdayId))
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, SofaScoreFantasyStat>
        setSavedCount(Object.keys(parsed).length)
      }
    } catch { /* ignore */ }
  }, [matchdayId])

  function handleSave() {
    setError(null)
    setLastAdded(null)

    const chunks = splitJsonObjects(text.trim())
    if (chunks.length === 0) {
      setError('Nessun JSON riconosciuto. Incolla il contenuto JSON direttamente dalla pagina SofaScore.')
      return
    }

    // Load existing data and merge on top — don't wipe previous matches
    const existing = loadSsStats(matchdayId) ?? {}
    const merged: Record<string, SofaScoreFantasyStat> = { ...existing }
    const beforeCount = Object.keys(merged).length
    let eventsOk = 0

    for (const chunk of chunks) {
      try {
        const json = JSON.parse(chunk) as Record<string, unknown>
        const stats = parseSofaScoreLineupsJson(json)
        if (stats.length > 0) {
          for (const s of stats) {
            merged[String(s.sofascore_id)] = s
          }
          eventsOk++
        }
      } catch { /* skip malformed chunks */ }
    }

    if (eventsOk === 0) {
      setError('JSON incollato non contiene dati lineups validi (nessun giocatore con minutesPlayed > 0).')
      return
    }

    localStorage.setItem(ssRatingsKey(matchdayId), JSON.stringify(merged))
    const totalCount = Object.keys(merged).length
    setSavedCount(totalCount)
    setLastAdded(totalCount - beforeCount)
    setText('')
  }

  function handleClear() {
    localStorage.removeItem(ssRatingsKey(matchdayId))
    setSavedCount(0)
    setLastAdded(null)
    setError(null)
  }

  const hasData = savedCount > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#8888aa] uppercase tracking-wide">SofaScore (manuale)</span>
        {hasData && (
          <button onClick={handleClear} className="text-xs text-[#55556a] hover:text-red-400">
            Cancella dati
          </button>
        )}
      </div>

      {hasData && (
        <p className="text-xs text-green-400">
          ✓ {savedCount} giocatori salvati
          {lastAdded !== null && lastAdded > 0 && (
            <span className="text-[#8888aa]"> (+{lastAdded} nuovi)</span>
          )}
          {lastAdded === 0 && (
            <span className="text-[#55556a]"> (nessun nuovo giocatore)</span>
          )}
        </p>
      )}

      <p className="text-xs text-[#55556a]">
        {hasData
          ? 'Incolla altre partite per aggiungerne i dati — verranno uniti a quelli già salvati.'
          : 'Apri i link qui sotto nel browser, seleziona tutto (Ctrl+A), copia (Ctrl+C) e incolla qui. Puoi incollare più partite in sequenza.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {fixtures.map((fx) => (
          <a
            key={fx.sofascoreEventId}
            href={`https://www.sofascore.com/api/v1/event/${fx.sofascoreEventId}/lineups`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[#2e2e42] px-2 py-1 text-xs text-indigo-400 hover:border-indigo-500 hover:text-indigo-300"
            title={String(fx.sofascoreEventId)}
          >
            {fx.label}
          </a>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={hasData ? 'Incolla qui il JSON delle partite da aggiungere…' : 'Incolla qui il JSON di una o più partite…'}
        className="w-full rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-3 py-2 text-xs font-mono text-[#f0f0fa] placeholder-[#55556a] focus:border-indigo-500 focus:outline-none resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={!text.trim()}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {hasData ? 'Aggiungi dati SofaScore' : 'Salva dati SofaScore'}
      </button>
    </div>
  )
}

/** Split a string that may contain one or more concatenated JSON objects. */
function splitJsonObjects(input: string): string[] {
  const results: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        results.push(input.slice(start, i + 1))
        start = -1
      }
    }
  }
  return results
}
