'use client'

import { useTransition, useState } from 'react'
import { transitionMatchdayStatusAction } from './actions'

export function CloseMatchdayButton({ matchdayId }: { matchdayId: string }) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFirstClick() {
    setConfirming(true)
    setError(null)
  }

  function handleCancel() {
    setConfirming(false)
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await transitionMatchdayStatusAction(matchdayId, 'closed', null)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
      } else {
        window.location.reload()
      }
    })
  }

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-[#1a1a2e] text-[#55556a]">
        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
        Chiudendo…
      </span>
    )
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1">
          <button
            onClick={handleConfirm}
            className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/25 text-red-300 hover:bg-red-500/40 transition-colors"
          >
            ✓ Conferma
          </button>
          <button
            onClick={handleCancel}
            className="rounded px-1.5 py-0.5 text-[10px] text-[#55556a] hover:text-white transition-colors"
          >
            ✕
          </button>
        </span>
        {error && (
          <span className="text-[10px] text-red-400 max-w-[220px] leading-tight">{error}</span>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={handleFirstClick}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
      >
        Chiudi
      </button>
      {error && (
        <span className="text-[10px] text-red-400 max-w-[220px] leading-tight">{error}</span>
      )}
    </span>
  )
}
