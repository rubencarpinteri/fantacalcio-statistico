'use client'

import { useTransition } from 'react'
import { toggleFreezeAction } from './actions'

export function FreezeButton({
  matchdayId,
  isFrozen,
}: {
  matchdayId: string
  isFrozen: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const msg = isFrozen
      ? 'Scongelare la giornata?'
      : 'Congelare la giornata? I manager non potranno modificare le formazioni.'
    if (!window.confirm(msg)) return
    startTransition(async () => {
      await toggleFreezeAction(matchdayId)
    })
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={[
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
        isFrozen
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
          : 'bg-glass-2 border border-hairline text-ink-4 hover:text-ink-1 hover:bg-glass-2',
      ].join(' ')}
    >
      {isPending ? '…' : isFrozen ? 'Scongela' : 'Congela'}
    </button>
  )
}
