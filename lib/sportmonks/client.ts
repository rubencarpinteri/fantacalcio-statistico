/**
 * SportMonks v3 Football API client.
 *
 * - Token from SPORTMONKS_API_TOKEN env var (server-only).
 * - Rate-limit tracked per requested_entity.
 * - 429: read resets_in_seconds and retry once.
 * - Other 4xx/5xx: throw with status + URL for cron logs.
 */

import { getRequiredWaitMs, recordRateLimit } from './rateLimit'
import type { SMEnvelope } from './types'

const BASE_URL = 'https://api.sportmonks.com/v3/football'

function getToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN
  if (!token) {
    throw new Error('SPORTMONKS_API_TOKEN is not set')
  }
  return token
}

export type SMQuery = Record<string, string | number | undefined>

function buildUrl(path: string, query: SMQuery): string {
  const url = new URL(`${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`)
  url.searchParams.set('api_token', getToken())
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Low-level SportMonks fetch. Caller specifies the expected
 * rate-limit entity name (matches what the API returns in
 * rate_limit.requested_entity, e.g. "Fixture", "Squad", "Inplay").
 */
export async function fetchSportMonks<T>(
  path: string,
  query: SMQuery = {},
  rateLimitEntity: string,
): Promise<SMEnvelope<T>> {
  // Pre-flight: wait if we know the bucket is exhausted.
  const wait = getRequiredWaitMs(rateLimitEntity)
  if (wait > 0) {
    await sleep(Math.min(wait, 5000))
  }

  const url = buildUrl(path, query)
  let res = await fetch(url, { headers: { Accept: 'application/json' } })

  if (res.status === 429) {
    const body = (await res.json().catch(() => null)) as SMEnvelope<unknown> | null
    const retryAfter = body?.rate_limit?.resets_in_seconds ?? 5
    if (body?.rate_limit) {
      recordRateLimit(rateLimitEntity, body.rate_limit.resets_in_seconds, body.rate_limit.remaining)
    }
    await sleep(Math.max(5_000, retryAfter * 1000))
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`SportMonks ${res.status} on ${path}: ${text.slice(0, 300)}`)
  }

  const body = (await res.json()) as SMEnvelope<T>
  if (body.rate_limit) {
    recordRateLimit(rateLimitEntity, body.rate_limit.resets_in_seconds, body.rate_limit.remaining)
  }
  return body
}
