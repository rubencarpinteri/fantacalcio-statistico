'use client'

import { useState } from 'react'
import { triggerCalculationAction, publishCalculationAction } from '@/app/(admin)/campionato/giornate/[id]/calculate/actions'

type Phase =
  | 'idle'
  | 'calculating'
  | 'publishing'
  | 'done'
  | 'error'

interface Props {
  matchdayId: string
  compact?: boolean
}

// Calculates and publishes from data already in player_match_stats.
// The SportMonks ratings cron is the writer — this button just runs the
// engine over what's there and publishes the result.
export function QuickFetchAndCalculateButton({ matchdayId, compact }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState<{ scored: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPhase('calculating')
    setError(null)
    setSummary(null)

    const calcResult = await triggerCalculationAction(matchdayId)
    if (calcResult.error) { setPhase('error'); setError(calcResult.error); return }

    setPhase('publishing')
    const publishResult = await publishCalculationAction(matchdayId, calcResult.run_id!)
    if (publishResult.error) { setPhase('error'); setError(publishResult.error); return }

    setSummary({ scored: calcResult.scored_count })
    setPhase('done')
    setTimeout(() => window.location.reload(), 1500)
  }

  if (phase === 'done' && summary) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          ✓ {summary.scored} calcolati · pubblicato
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
  const label = phase === 'calculating' ? 'Calcolando…'
    : phase === 'publishing' ? 'Pubblicando…'
    : compact ? '⚡ Calcola e Pubblica' : '⚡ Calcola e pubblica'

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <button
          disabled={busy}
          onClick={run}
          title="Calcola dai voti SportMonks e pubblica"
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
        title="Calcola dai voti SportMonks e pubblica in un click"
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
          <span>⚡ Calcola e pubblica</span>
        )}
      </button>
    </div>
  )
}
