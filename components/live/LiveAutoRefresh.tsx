'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Calls router.refresh() every `intervalMs` while mounted, so the parent
// server component re-runs and pulls fresh data from live_player_scores.
// Mount only on pages where the matchday is currently 'open' and live data
// is being polled — otherwise it is wasted re-rendering.

const DEFAULT_INTERVAL_MS = 60_000

export function LiveAutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  intervalMs?: number
}) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
