'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Renders the "live" pill and owns the polling loop for the all-lineups
// page. Two timers run in parallel:
//
//   1. Page poll — every `pageRefreshMs` we router.refresh() so the server
//      component re-runs and pulls any new rows from live_player_scores.
//   2. Cron self-ping — every `pingMs` we POST /api/live/refresh which runs
//      the same refresh pipeline as the GitHub Actions cron. This is gated
//      on `hasLiveMatch` (at least one fixture currently in progress) and
//      on document.visibilityState — so we never hit FotMob when no game
//      is on or when the tab is in the background.

const DEFAULT_PAGE_REFRESH_MS = 60_000
const DEFAULT_PING_MS = 60_000

export function LiveAutoRefresh({
  matchdayId,
  hasLiveMatch,
  pageRefreshMs = DEFAULT_PAGE_REFRESH_MS,
  pingMs = DEFAULT_PING_MS,
  refreshedAt,
}: {
  matchdayId: string
  /** True iff at least one fixture is currently in progress. Gates self-ping. */
  hasLiveMatch: boolean
  pageRefreshMs?: number
  pingMs?: number
  /** ISO timestamp of the last cron write — shown as "aggiornato Xm fa". */
  refreshedAt?: string | null
}) {
  const router = useRouter()
  const seconds = Math.max(1, Math.round(pageRefreshMs / 1000))
  const [secondsLeft, setSecondsLeft] = useState<number>(seconds)
  const [now, setNow] = useState<number | null>(null)

  // Page poll — always running.
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

  // Cron self-ping — runs only when a match is live and the tab is visible.
  // Fires once on mount so the user gets fresh data immediately, then on
  // the configured interval.
  useEffect(() => {
    if (!hasLiveMatch) return
    let cancelled = false

    const ping = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      try {
        await fetch(`/api/live/refresh?matchday_id=${encodeURIComponent(matchdayId)}`, {
          method: 'POST',
          credentials: 'same-origin',
        })
        if (!cancelled) router.refresh()
      } catch {
        // Network blip — the next page poll will catch up.
      }
    }

    ping()
    const id = setInterval(ping, pingMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [matchdayId, hasLiveMatch, pingMs, router])

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
