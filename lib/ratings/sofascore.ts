/**
 * Server-side SofaScore fantasy event fetcher.
 * Endpoint: GET https://www.sofascore.com/api/v1/fantasy/event/{eventId}
 * Returns { playerStatistics: [{ playerId, statistics: [{key, value}] }] }
 */

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchSofaScoreLineups(
  eventId: number
): Promise<{ data: Record<string, unknown> | null; status: number }> {
  const url = `https://www.sofascore.com/api/v1/fantasy/event/${eventId}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/json',
        'Referer': 'https://www.sofascore.com/',
      },
      cache: 'no-store',
    })
  } catch {
    return { data: null, status: 0 }
  }

  if (!res.ok) return { data: null, status: res.status }

  try {
    const json = await res.json() as Record<string, unknown>
    return { data: json, status: 200 }
  } catch {
    return { data: null, status: 200 }
  }
}
