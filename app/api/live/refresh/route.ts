import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireLeagueContext } from '@/lib/league'
import { refreshMatchdayLive } from '@/lib/live/refresh'

// POST /api/live/refresh?matchday_id=...
//
// Authenticated counterpart to /api/cron/live-ratings — lets the
// all-lineups page self-trigger a refresh while a user is watching.
// GitHub Actions cron is best-effort and routinely skips ticks during
// platform load; this gives the front-end a way to keep data fresh
// for the duration of a viewing session.
//
// The route resolves the user's league from the session, verifies the
// matchday belongs to it, then runs the same refresh pipeline as the
// cron via the service client (so the upsert respects RLS the same
// way). No CRON_SECRET is shipped to the browser.
export async function POST(req: NextRequest) {
  let ctx
  try {
    ctx = await requireLeagueContext()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const matchdayId = req.nextUrl.searchParams.get('matchday_id')
  if (!matchdayId) {
    return NextResponse.json({ error: 'matchday_id required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, league_id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (matchday.status !== 'open') {
    return NextResponse.json({ skipped: 'matchday not open' })
  }

  // Use the service client for the refresh itself — the cron uses it
  // too, and refreshMatchdayLive writes to live_scores/live_player_scores
  // which require service-role privileges.
  const result = await refreshMatchdayLive(createServiceClient(), matchday.id, matchday.league_id)
  return NextResponse.json(result)
}
