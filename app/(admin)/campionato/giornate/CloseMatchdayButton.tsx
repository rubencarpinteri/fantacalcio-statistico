'use client'

import { useTransition, useState } from 'react'
import { transitionMatchdayStatusAction } from './actions'

type ConfirmingAction = 'close' | 'draft' | null

interface Props {
  matchdayId: string
  currentStatus: 'open' | 'closed'
}

export function CloseMatchdayButton({ matchdayId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<ConfirmingAction>(null)
  const [error, setError] = useState<string | null>(null)

  function execute(newStatus: 'closed' | 'draft') {
    setError(null)
    startTransition(async () => {
      const result = await transitionMatchdayStatusAction(matchdayId, newStatus, null)
      if (result.error) {
        setError(result.error)
        setConfirming(null)
      } else {
        window.location.reload()
      }
    })
  }

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-glass-2 text-ink-4">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
        {confirming === 'close' ? 'Chiudendo…' : 'Aggiornando…'}
      </span>
    )
  }

  if (confirming !== null) {
    const label = confirming === 'close' ? 'Conferma Chiudi' : 'Conferma In Programma'
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1">
          <button
            onClick={() => execute(confirming === 'close' ? 'closed' : 'draft')}
            className={[
              'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              confirming === 'close'
                ? 'bg-red-500/25 text-red-300 hover:bg-red-500/40'
                : 'bg-glass-2 text-ink-2 hover:bg-glass-3',
            ].join(' ')}
          >
            ✓ {label}
          </button>
          <button
            onClick={() => setConfirming(null)}
            className="rounded px-1.5 py-0.5 text-[10px] text-ink-4 hover:text-ink-1 transition-colors"
          >
            ✕
          </button>
        </span>
        {error && (
          <span className="text-[10px] text-red-400 max-w-[240px] leading-tight">{error}</span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex items-center gap-1">
        {currentStatus === 'open' && (
          <button
            onClick={() => setConfirming('close')}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
          >
            Chiudi
          </button>
        )}
        <button
          onClick={() => setConfirming('draft')}
          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-glass-2 text-ink-4 hover:text-ink-1 transition-colors"
        >
          In Programma
        </button>
      </span>
      {error && (
        <span className="text-[10px] text-red-400 max-w-[240px] leading-tight">{error}</span>
      )}
    </span>
  )
}
