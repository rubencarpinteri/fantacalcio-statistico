'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Polls the page every `intervalMs` so the parent server component re-runs
// and pulls fresh data from live_player_scores. Renders a small pill with
// the countdown to the next refresh.
//
// Mount only on pages where the matchday is currently 'open' and live data
// is being polled — otherwise it's wasted re-rendering.

const DEFAULT_INTERVAL_MS = 60_000

export function LiveAutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
  refreshedAt,
}: {
  intervalMs?: number
  /** ISO timestamp of the last live data write — resets countdown on change. */
  refreshedAt?: string | null
}) {
  const router = useRouter()
  const [secondsLeft, setSecondsLeft] = useState(Math.round(intervalMs / 1000))

  useEffect(() => {
    setSecondsLeft(Math.round(intervalMs / 1000))
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.refresh()
          return Math.round(intervalMs / 1000)
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [router, intervalMs, refreshedAt])

  const mm = Math.floor(secondsLeft / 60)
  const ss = (secondsLeft % 60).toString().padStart(2, '0')

  return (
    <p className="mt-3 inline-flex items-center gap-2 text-[12px] text-ink-3">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      In tempo reale — voti provvisori, prossimo refresh tra {mm}:{ss}
    </p>
  )
}
