'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Pings router.refresh() so the page re-reads live_player_scores, and
// renders a small pill counting down to the next *data* write — the
// external cron writes new ratings every `cronIntervalMs` (5min by default).
// We poll the page every `pageRefreshMs` so a new row shows up within ~30s
// of the cron landing, but the visible countdown is anchored to the cron
// cadence (which is what actually changes the values).

const DEFAULT_CRON_INTERVAL_MS = 2 * 60_000
const DEFAULT_PAGE_REFRESH_MS = 30_000

export function LiveAutoRefresh({
  cronIntervalMs = DEFAULT_CRON_INTERVAL_MS,
  pageRefreshMs = DEFAULT_PAGE_REFRESH_MS,
  refreshedAt,
}: {
  cronIntervalMs?: number
  pageRefreshMs?: number
  /** ISO timestamp of the last live data write — anchors the countdown. */
  refreshedAt?: string | null
}) {
  const router = useRouter()
  // Skip the countdown on the server / first hydration to avoid a mismatch
  // between server `Date.now()` and client `Date.now()`. The pill appears
  // immediately with a placeholder, then the countdown fills in on mount.
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const tickId = setInterval(() => setNow(Date.now()), 1000)
    const refreshId = setInterval(() => router.refresh(), pageRefreshMs)
    return () => {
      clearInterval(tickId)
      clearInterval(refreshId)
    }
  }, [router, pageRefreshMs])

  let label = 'in arrivo…'
  if (now !== null) {
    const anchor = refreshedAt ? new Date(refreshedAt).getTime() : now
    const msUntilNext = Math.max(0, anchor + cronIntervalMs - now)
    const secondsLeft = Math.ceil(msUntilNext / 1000)
    const mm = Math.floor(secondsLeft / 60)
    const ss = (secondsLeft % 60).toString().padStart(2, '0')
    label = msUntilNext === 0 ? 'in arrivo…' : `prossimo aggiornamento tra ${mm}:${ss}`
  }

  return (
    <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11.5px] font-medium text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
      </span>
      <span className="text-emerald-200">In tempo reale</span>
      <span className="text-emerald-300/70">·</span>
      <span className="tabular-nums text-emerald-100">{label}</span>
    </span>
  )
}
