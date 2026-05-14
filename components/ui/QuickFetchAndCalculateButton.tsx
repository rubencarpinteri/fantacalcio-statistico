'use client'

import { useState } from 'react'
import { importRatingsAction } from '@/app/(admin)/matchdays/[id]/fixtures/actions'
import { triggerCalculationAction, publishCalculationAction } from '@/app/(admin)/matchdays/[id]/calculate/actions'
import type { FetchRatingsResponse } from '@/app/api/ratings/fetch/route'
import type { ImportMatch } from '@/app/(admin)/matchdays/[id]/fixtures/actions'

type Phase =
  | 'idle'
  | 'fetching'
  | 'importing'
  | 'calculating'
  | 'publishing'
  | 'done'
  | 'error'

interface Props {
  matchdayId: string
  compact?: boolean
}

export function QuickFetchAndCalculateButton({ matchdayId, compact }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState<{ imported: number; scored: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPhase('fetching')
    setError(null)
    setSummary(null)

    let fetchData: FetchRatingsResponse
    try {
      const res = await fetch('/api/ratings/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchdayId }),
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
      setError('Nessun giocatore abbinato.')
      return
    }

    setPhase('importing')
    const toImport: ImportMatch[] = fetchData.matched.map((m) => ({
      league_player_id: m.league_player_id,
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
    if (importResult.error) { setPhase('error'); setError(importResult.error); return }

    setPhase('calculating')
    const calcResult = await triggerCalculationAction(matchdayId)
    if (calcResult.error) { setPhase('error'); setError(calcResult.error); return }

    setPhase('publishing')
    const publishResult = await publishCalculationAction(matchdayId, calcResult.run_id!)
    if (publishResult.error) { setPhase('error'); setError(publishResult.error); return }

    setSummary({ imported: importResult.imported ?? toImport.length, scored: calcResult.scored_count })
    setPhase('done')
    setTimeout(() => window.location.reload(), 1500)
  }

  if (phase === 'done' && summary) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          ✓ {summary.imported} importati · {summary.scored} calcolati · pubblicato
        </span>
        <button onClick={() => { setPhase('idle'); setSummary(null) }} className="text-xs text-ink-4 hover:text-indigo-400">↺</button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-rose-700 dark:text-rose-400">{error}</span>
        <button onClick={() => { setPhase('idle'); setError(null) }} className="text-xs text-ink-4 hover:text-indigo-400">↺ Riprova</button>
      </div>
    )
  }

  const busy = phase !== 'idle'
  const label = phase === 'fetching' ? 'Scaricando voti…'
    : phase === 'importing' ? 'Importando…'
    : phase === 'calculating' ? 'Calcolando…'
    : phase === 'publishing' ? 'Pubblicando…'
    : compact ? '⚡ Aggiorna e Pubblica' : '⚡ Aggiorna e pubblica'

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <button
          disabled={busy}
          onClick={run}
          title="Scarica voti da FotMob, calcola e pubblica"
          className={[
            'btn btn-sm whitespace-nowrap',
            busy ? 'cursor-wait' : '',
          ].join(' ')}
          style={busy ? undefined : {
            background: 'rgba(217, 154, 74, 0.14)',
            color: 'var(--btn-amber-color)',
            borderColor: 'rgba(217, 154, 74, 0.30)',
          }}
        >
          {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />}
          {label}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <button
        disabled={busy}
        onClick={run}
        title="Scarica voti da FotMob, calcola e pubblica in un click"
        className={[
          'btn w-full justify-center text-[14px] font-semibold py-3.5',
          busy ? 'cursor-wait' : '',
        ].join(' ')}
        style={busy ? undefined : {
          background: 'rgba(217, 154, 74, 0.14)',
          color: 'var(--btn-amber-color)',
          borderColor: 'rgba(217, 154, 74, 0.32)',
        }}
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
    </div>
  )
}
