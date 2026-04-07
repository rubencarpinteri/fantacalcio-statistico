import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * GET /api/sofascore-proxy?eventId=...
 *
 * Edge-runtime proxy for SofaScore fantasy API.
 * Server-side Node.js gets 403 (cloud IP + TLS fingerprint blocked).
 * Browser gets 403 (requires SofaScore session cookies, incompatible with CORS).
 * Edge runtime (Cloudflare Workers) may bypass bot detection via intra-CF routing.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const eventId = req.nextUrl.searchParams.get('eventId')
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  let res: Response
  try {
    res = await fetch(`https://www.sofascore.com/api/v1/fantasy/event/${eventId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }

  if (!res.ok) {
    return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
