'use client'

import { useState } from 'react'
import { importRatingsAction } from '@/app/(admin)/matchdays/[id]/fixtures/actions'
import { triggerCalculationAction, publishCalculationAction } from '@/app/(admin)/matchdays/[id]/calculate/actions'
import type { FetchRatingsResponse } from '@/app/api/ratings/fetch/route'
import type { ImportMatch } from '@/app/(admin)/matchdays/[id]/fixtures/actions'

type Phase =
  | 'idle'
  | 'fetching-ids'
  | 'fetching-sofascore'
  | 'fetching'
  | 'importing'
  | 'calculating'
  | 'publishing'
  | 'done'
  | 'error'

interface Props {
  matchdayId: string
  /** When true renders a compact icon-only variant for tight spaces */
  compact?: boolean
}

const SS_FANTASY_BASE = 'https://www.sofascore.com/api/v1/fantasy/event'

export function QuickFetchAndCalculateButton({ matchdayId, compact }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState<{ imported: number; scored: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPhase('fetching-ids')
    setError(null)
    setSummary(null)

    // ── Step 0: get sofascore_event_ids for this matchday ───────────────────
    let sofascoreEventIds: number[] = []
    try {
      const idsRes = await fetch(`/api/ratings/fixtures?matchdayId=${matchdayId}`)
      if (idsRes.ok) {
        const idsData = await idsRes.json() as { sofascore_event_ids: number[] }
        sofascoreEventIds = idsData.sofascore_event_ids ?? []
      }
    } catch {
      // Non-fatal — proceed without SofaScore (FotMob-only mode)
    }

    // ── Step 1: browser-fetch SofaScore fantasy data ────────────────────────
    // SofaScore /api/v1/fantasy/event/{id} has CORS access-control-allow-origin: *
    // so browser fetches work fine. Server-side is blocked by TLS fingerprinting.
    setPhase('fetching-sofascore')
    const sofascoreByEventId: Record<string, Record<string, unknown>> = {}
    for (const eventId of sofascoreEventIds) {
      try {
        const ssRes = await fetch(`${SS_FANTASY_BASE}/${eventId}`)
        if (ssRes.ok) {
          sofascoreByEventId[String(eventId)] = await ssRes.json() as Record<string, unknown>
        }
      } catch {
        // Non-fatal — skip this fixture's SofaScore data
      }
    }

    // ── Step 2: fetch FotMob ratings (server-side) + merge SofaScore ────────
    setPhase('fetching')
    let fetchData: FetchRatingsResponse
    try {
      const res = await fetch('/api/ratings/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchdayId,
          sofascoreByEventId: Object.keys(sofascoreByEventId).length > 0
            ? sofascoreByEventId
            : undefined,
        }),
      })
      if (!res.ok) throw new Error(`Fetch fallito (HTTP ${res.status})`)
      fetchData = (await res.json()) as FetchRatingsResponse
    } catch (e) {
      setPhase('error')
      setError(String(e))
      return
    }

    if (fetchData.matched.length === 0) {
      setPhase('error')
      setError('Nessun giocatore abbinato. Verifica che le fixture siano configurate.')
      return
    }

    // ── Step 3: import stats ─────────────────────────────────────────────────
    setPhase('importing')
    const toImport: ImportMatch[] = fetchData.matched.map((m) => ({
      league_player_id: m.league_player_id,
      sofascore_rating: m.stat.sofascore_rating,
      fotmob_rating: m.stat.fotmob_rating,
      minutes_played: m.stat.minutes_played,
      goals_scored: m.stat.goals_scored,
      assists: m.stat.assists,
      own_goals: m.stat.own_goals,
      yellow_cards: m.stat.yellow_cards,
      red_cards: m.stat.red_cards,
      penalties_scored: m.stat.penalties_scored,
      penalties_missed: m.stat.penalties_missed,
      penalties_saved: m.stat.penalties_saved,
      goals_conceded: m.stat.goals_conceded,
      saves: m.stat.saves,
      clean_sheet: m.stat.clean_sheet,
    }))

    const importResult = await importRatingsAction(matchdayId, toImport)
    if (importResult.error) {
      setPhase('error')
      setError(importResult.error)
      return
    }

    // ── Step 4: trigger calculation ──────────────────────────────────────────
    setPhase('calculating')
    const calcResult = await triggerCalculationAction(matchdayId)
    if (calcResult.error) {
      setPhase('error')
      setError(calcResult.error)
      return
    }

    // ── Step 5: publish ──────────────────────────────────────────────────────
    setPhase('publishing')
    const publishResult = await publishCalculationAction(matchdayId, calcResult.run_id!)
    if (publishResult.error) {
      setPhase('error')
      setError(publishResult.error)
      return
    }

    setSummary({
      imported: importResult.imported ?? toImport.length,
      scored: calcResult.scored_count,
    })
    setPhase('done')
    // Show success message briefly, then hard-reload so all page data reflects the new publish.
    setTimeout(() => window.location.reload(), 1500)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (phase === 'done' && summary) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-emerald-400 font-medium">
          ✓ {summary.imported} importati · {summary.scored} calcolati · pubblicato
        </span>
        <button
          onClick={() => { setPhase('idle'); setSummary(null) }}
          className="text-xs text-[#55556a] hover:text-indigo-400 transition-colors"
        >
          ↺
        </button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="max-w-[260px] truncate text-xs text-red-400" title={error ?? ''}>
          {error}
        </span>
        <button
          onClick={() => { setPhase('idle'); setError(null) }}
          className="text-xs text-[#55556a] hover:text-indigo-400 transition-colors whitespace-nowrap"
        >
          ↺ Riprova
        </button>
      </div>
    )
  }

  const busy = phase !== 'idle'
  const label = phase === 'fetching-ids'
    ? 'Preparando…'
    : phase === 'fetching-sofascore'
    ? 'SofaScore…'
    : phase === 'fetching'
    ? 'Scaricando voti…'
    : phase === 'importing'
    ? 'Importando…'
    : phase === 'calculating'
    ? 'Calcolando…'
    : phase === 'publishing'
    ? 'Pubblicando…'
    : compact
    ? '⚡'
    : '⚡ Aggiorna e pubblica'

  if (compact) {
    return (
      <button
        disabled={busy}
        onClick={run}
        title="Scarica voti da FotMob + SofaScore, calcola e pubblica"
        className={[
          'flex items-center gap-1.5 rounded-lg border font-medium transition-colors px-2 py-1 text-xs',
          busy
            ? 'cursor-wait border-[#2e2e42] bg-[#0d0d1a] text-[#55556a]'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50',
        ].join(' ')}
      >
        {busy && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        )}
        {label}
      </button>
    )
  }

  // Full (large) variant
  return (
    <button
      disabled={busy}
      onClick={run}
      title="Scarica voti da FotMob + SofaScore, calcola e pubblica in un click"
      className={[
        'flex w-full items-center justify-center gap-2 rounded-xl border-2 py-4 text-base font-bold transition-all',
        busy
          ? 'cursor-wait border-[#2e2e42] bg-[#0d0d1a] text-[#55556a]'
          : 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 active:scale-[0.98]',
      ].join(' ')}
    >
      {busy ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{label}</span>
        </>
      ) : (
        <span>⚡ Aggiorna e pubblica</span>
      )}
    </button>
  )
}
