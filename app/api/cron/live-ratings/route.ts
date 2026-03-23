import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { refreshMatchdayLive } from '@/lib/live/refresh'

/**
 * GET /api/cron/live-ratings
 *
 * Called by an external cron service (e.g. cron-job.org) every N minutes.
 * Protected by Authorization: Bearer <CRON_SECRET>.
 *
 * Finds all matchdays in 'scoring' state that have fixtures configured,
 * and runs a live refresh for each one.
 *
 * Vercel Hobby plan: crons run at most once/day — use cron-job.org instead:
 *   URL:    https://<your-domain>/api/cron/live-ratings
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Method: GET
 *   Every:  5 minutes
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Find all scoring matchdays
  const { data: matchdays, error: mdErr } = await supabase
    .from('matchdays')
    .select('id, league_id')
    .eq('status', 'scoring')

  if (mdErr) {
    return NextResponse.json({ error: mdErr.message }, { status: 500 })
  }

  if (!matchdays?.length) {
    return NextResponse.json({ message: 'No scoring matchdays', updated: 0 })
  }

  // Filter to those with at least one fixture
  const matchdayIds = matchdays.map((m) => m.id)
  const { data: fixtures } = await supabase
    .from('matchday_fixtures')
    .select('matchday_id')
    .in('matchday_id', matchdayIds)

  const matchdaysWithFixtures = new Set((fixtures ?? []).map((f) => f.matchday_id))
  const toRefresh = matchdays.filter((m) => matchdaysWithFixtures.has(m.id))

  if (!toRefresh.length) {
    return NextResponse.json({ message: 'No fixtures configured', updated: 0 })
  }

  const results: Array<{ matchday_id: string; ok: boolean; error?: string }> = []

  for (const matchday of toRefresh) {
    const result = await refreshMatchdayLive(supabase, matchday.id, matchday.league_id)
    results.push({ matchday_id: matchday.id, ok: result.ok, error: result.error })
  }

  return NextResponse.json({
    updated: results.filter((r) => r.ok).length,
    results,
  })
}
