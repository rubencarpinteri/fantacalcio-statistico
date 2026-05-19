/**
 * In-process SportMonks rate-limit tracker.
 *
 * SportMonks returns rate_limit per requested_entity ("Fixture",
 * "Squad", "Inplay", etc.) — limits are NOT global. We track the
 * latest snapshot per entity and use it to back off before the
 * next call when remaining hits 0.
 *
 * Free tier: 3000 calls/h per entity. Hard 429 is rare in practice;
 * this is mostly a safety net for cron bursts.
 */

type Snapshot = {
  resets_at_ms: number
  remaining: number
}

const state = new Map<string, Snapshot>()

export function recordRateLimit(entity: string, resetsInSeconds: number, remaining: number): void {
  state.set(entity, {
    resets_at_ms: Date.now() + resetsInSeconds * 1000,
    remaining,
  })
}

/** Returns milliseconds the caller should sleep before retrying, or 0. */
export function getRequiredWaitMs(entity: string): number {
  const snap = state.get(entity)
  if (!snap) return 0
  if (snap.remaining > 0) return 0
  return Math.max(0, snap.resets_at_ms - Date.now())
}

export function snapshot(): Record<string, Snapshot> {
  return Object.fromEntries(state.entries())
}
