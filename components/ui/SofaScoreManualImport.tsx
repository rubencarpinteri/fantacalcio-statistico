'use client'

import { useState, useEffect } from 'react'
import { parseSofaScoreFantasyJson } from '@/lib/ratings/parse'

interface Props {
  matchdayId: string
  sofascoreEventIds: number[]
}

export function ssRatingsKey(matchdayId: string) {
  return `ss_ratings_${matchdayId}`
}

export function loadSsRatings(matchdayId: string): Record<string, number | null> | null {
  try {
    const raw = localStorage.getItem(ssRatingsKey(matchdayId))
    return raw ? (JSON.parse(raw) as Record<string, number | null>) : null
  } catch {
    return null
  }
}

export function SofaScoreManualImport({ matchdayId, sofascoreEventIds }: Props) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ players: number; events: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Restore saved status from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ssRatingsKey(matchdayId))
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number | null>
        const count = Object.keys(parsed).length
        if (count > 0) setStatus({ players: count, events: sofascoreEventIds.length })
      }
    } catch { /* ignore */ }
  }, [matchdayId, sofascoreEventIds.length])

  function handleSave() {
    setError(null)
    setStatus(null)

    // Split the pasted text into individual JSON objects.
    // User may paste multiple JSONs one after another.
    const chunks = splitJsonObjects(text.trim())
    if (chunks.length === 0) {
      setError('Nessun JSON riconosciuto. Incolla il contenuto JSON direttamente dalla pagina SofaScore.')
      return
    }

    const ratings: Record<string, number | null> = {}
    let eventsOk = 0

    for (const chunk of chunks) {
      try {
        const json = JSON.parse(chunk) as Record<string, unknown>
        const stats = parseSofaScoreFantasyJson(json)
        if (stats.length > 0) {
          for (const s of stats) {
            ratings[String(s.sofascore_id)] = s.rating
          }
          eventsOk++
        }
      } catch { /* skip malformed chunks */ }
    }

    if (eventsOk === 0) {
      setError('JSON incollato non contiene dati playerStatistics validi.')
      return
    }

    localStorage.setItem(ssRatingsKey(matchdayId), JSON.stringify(ratings))
    setStatus({ players: Object.keys(ratings).length, events: eventsOk })
    setText('')
  }

  function handleClear() {
    localStorage.removeItem(ssRatingsKey(matchdayId))
    setStatus(null)
    setError(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#8888aa] uppercase tracking-wide">SofaScore (manuale)</span>
        {status && (
          <button onClick={handleClear} className="text-xs text-[#55556a] hover:text-red-400">
            Cancella dati
          </button>
        )}
      </div>

      {status ? (
        <p className="text-xs text-green-400">
          ✓ {status.players} giocatori da {status.events}/{sofascoreEventIds.length} partite salvati — usa &ldquo;Aggiorna e pubblica&rdquo;
        </p>
      ) : (
        <>
          <p className="text-xs text-[#55556a]">
            Apri i link qui sotto nel browser, seleziona tutto (Ctrl+A), copia (Ctrl+C) e incolla qui.
            Puoi incollare più partite in sequenza.
          </p>
          <div className="flex flex-wrap gap-2">
            {sofascoreEventIds.map((id) => (
              <a
                key={id}
                href={`https://www.sofascore.com/api/v1/fantasy/event/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-[#2e2e42] px-2 py-1 text-xs text-indigo-400 hover:border-indigo-500 hover:text-indigo-300 font-mono"
              >
                {id}
              </a>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'Incolla qui il JSON di una o più partite…'}
            className="w-full rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-3 py-2 text-xs font-mono text-[#f0f0fa] placeholder-[#55556a] focus:border-indigo-500 focus:outline-none resize-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Salva dati SofaScore
          </button>
        </>
      )}
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
