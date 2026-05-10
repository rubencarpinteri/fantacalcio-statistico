'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Live pill + polling loop for the all-lineups page.
//
// One timer drives everything: every `pingMs` we POST /api/live/refresh.
// That endpoint runs the same refresh pipeline as the GitHub Actions cron
// (fetch FotMob, run engine, upsert live_player_scores). When it returns
// we call router.refresh() so the parent server component re-runs and
// pulls the new rows. The visible countdown ticks down from `pingMs`
// to zero between cycles. We only fire while the tab is visible — when
// hidden we skip pings entirely.

const DEFAULT_PING_MS = 60_000

export function LiveAutoRefresh({
  matchdayId,
  pingMs = DEFAULT_PING_MS,
  refreshedAt,
}: {
  matchdayId: string
  pingMs?: number
  /** ISO timestamp of the last cron write — shown as "aggiornato Xs/m fa". */
  refreshedAt?: string | null
}) {
  const router = useRouter()
  const seconds = Math.max(1, Math.round(pingMs / 1000))
  const [secondsLeft, setSecondsLeft] = useState<number>(seconds)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
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
        // Network blip — next tick will catch up.
      }
    }

    setSecondsLeft(seconds)
    setNow(Date.now())
    void ping()

    const id = setInterval(() => {
      setNow(Date.now())
      setSecondsLeft((s) => {
        if (s <= 1) {
          void ping()
          return seconds
        }
        return s - 1
      })
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [matchdayId, seconds, router])

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
      <span className="text-ink-2">prossimo aggiornamento in</span>
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
