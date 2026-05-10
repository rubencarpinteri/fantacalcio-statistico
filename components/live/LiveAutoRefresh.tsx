'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Renders a small "live" pill that counts down to the next page poll.
// When the timer hits 0, calls router.refresh() so the parent server
// component re-runs and pulls any new rows the cron has written.
//
// The countdown is intentionally tied to the page-poll interval, not the
// cron interval — that way it always reflects "when will the screen check
// for new data," which is the thing the user actually sees change. The
// last cron-write timestamp is shown as a separate "aggiornato Xm fa"
// caption so freshness is transparent.

const DEFAULT_INTERVAL_MS = 30_000

export function LiveAutoRefresh({
  intervalMs = DEFAULT_INTERVAL_MS,
  refreshedAt,
}: {
  intervalMs?: number
  /** ISO timestamp of the last cron write — shown as "aggiornato Xm fa". */
  refreshedAt?: string | null
}) {
  const router = useRouter()
  const seconds = Math.max(1, Math.round(intervalMs / 1000))
  const [secondsLeft, setSecondsLeft] = useState<number>(seconds)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setSecondsLeft(seconds)
    setNow(Date.now())
    const id = setInterval(() => {
      setNow(Date.now())
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.refresh()
          return seconds
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [router, seconds])

  const mm = Math.floor(secondsLeft / 60)
  const ss = (secondsLeft % 60).toString().padStart(2, '0')
  const countdownLabel = `${mm}:${ss}`

  let staleness: string | null = null
  if (refreshedAt && now !== null) {
    const ageSec = Math.max(0, Math.floor((now - new Date(refreshedAt).getTime()) / 1000))
    if (ageSec < 60) staleness = `aggiornato ${ageSec}s fa`
    else staleness = `aggiornato ${Math.floor(ageSec / 60)}m fa`
  }

  return (
    <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-glass-2 px-3 py-1 text-[12px] text-ink-1 shadow-sm">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
      </span>
      <span className="font-medium">In tempo reale</span>
      <span className="text-ink-4">·</span>
      <span className="text-ink-2">prossimo controllo in</span>
      <span className="tabular-nums font-semibold text-ink-1">{countdownLabel}</span>
      {staleness && (
        <>
          <span className="text-ink-4">·</span>
          <span className="text-ink-3">{staleness}</span>
        </>
      )}
    </span>
  )
}
