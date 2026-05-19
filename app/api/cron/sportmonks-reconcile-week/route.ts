import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchFixtureWithDetail } from '@/lib/sportmonks/fixtures'
import { parseFixture } from '@/lib/sportmonks/parse'
import { listActiveLeagueRefs, upsertFMPlayerStats } from '@/lib/sportmonks/db'

/**
 * GET /api/cron/sportmonks-reconcile-week
 *
 * Mon 03:00 UTC. Re-fetches every fixture from the last 7 days
 * with full include depth and force-upserts stats — catches anything
 * the 1-min ratings-tick missed (network hiccups, late-published ratings,
 * cron downtime).
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()
  const refs = await listActiveLeagueRefs(db)
  if (!refs.length) {
    return NextResponse.json({ message: 'No active SportMonks leagues', refs: 0 })
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const results: Array<{
    product: string
    owner_id: string
    sportmonks_league_id: number
    fixtures_in_week: number
    stats_total: number
    errors: string[]
  }> = []

  for (const ref of refs) {
    if (ref.product !== 'fm') {
      // Serie A reconciliation runs through the existing matchday flow
      results.push({ product: ref.product, owner_id: ref.owner_id, sportmonks_league_id: ref.sportmonks_league_id, fixtures_in_week: 0, stats_total: 0, errors: [] })
      continue
    }

    const { data: rows } = await db
      .from('sportmonks_fixtures')
      .select('sportmonks_fixture_id')
      .eq('league_id', ref.sportmonks_league_id)
      .gte('kickoff_at', weekAgo)
      .lte('kickoff_at', now)

    const ids = (rows ?? []).map((r) => r.sportmonks_fixture_id).filter((x): x is number => x != null)
    const errors: string[] = []
    let stats_total = 0

    for (const id of ids) {
      try {
        const fx = await fetchFixtureWithDetail(id)
        const parsed = parseFixture(fx)
        const r = await upsertFMPlayerStats(db, ref.owner_id, parsed)
        stats_total += r.stats_upserted
      } catch (e) {
        errors.push(`fixture ${id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    results.push({
      product: ref.product,
      owner_id: ref.owner_id,
      sportmonks_league_id: ref.sportmonks_league_id,
      fixtures_in_week: ids.length,
      stats_total,
      errors,
    })
  }

  return NextResponse.json({ refs: refs.length, results })
}
