'use client'

import { useTransition, useState } from 'react'
import { transitionMatchdayStatusAction } from './actions'

export function CloseMatchdayButton({ matchdayId }: { matchdayId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClose() {
    if (!window.confirm('Chiudere la giornata? Le formazioni saranno bloccate e la prossima giornata in bozza verrà aperta automaticamente.')) return
    startTransition(async () => {
      const result = await transitionMatchdayStatusAction(matchdayId, 'closed', null)
      if (result.error) setError(result.error)
    })
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handleClose}
        disabled={isPending}
        className={[
          'rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          isPending
            ? 'cursor-wait bg-[#1a1a2e] text-[#55556a]'
            : 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
        ].join(' ')}
      >
        {isPending ? 'Chiudendo…' : 'Chiudi'}
      </button>
      {error && (
        <span className="text-[10px] text-red-400 max-w-[200px] leading-tight">{error}</span>
      )}
    </span>
  )
}
