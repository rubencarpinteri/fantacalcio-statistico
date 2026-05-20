import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { fetchInplayForLeague } from '@/lib/sportmonks/livescores'
import { parseFixture } from '@/lib/sportmonks/parse'
import {
  hasFixturesInLiveWindow,
  listActiveLeagueRefs,
  upsertFMPlayerStats,
  upsertSerieAPlayerStats,
} from '@/lib/sportmonks/db'

/**
 * GET /api/cron/sportmonks-ratings-tick
 *
 * Every 1 minute. Cheap pre-check: any fixture in the live window
 * (kickoff−5min .. kickoff+130min)? If not, exit fast — costs zero
 * SportMonks calls.
 *
 * If yes: for each active SportMonks league, GET /livescores/inplay,
 * parse each fixture, upsert per-player stats and bump match score/status.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  const inWindow = await hasFixturesInLiveWindow(db)
  if (!inWindow) {
    return NextResponse.json({ message: 'No fixtures in live window', live: 0 })
  }

  const refs = await listActiveLeagueRefs(db)
  if (!refs.length) {
    return NextResponse.json({ message: 'No active SportMonks leagues', live: 0 })
  }

  // Dedupe live fetches across competitions sharing a league.
  const liveByLeague = new Map<number, Awaited<ReturnType<typeof fetchInplayForLeague>>>()
  for (const ref of refs) {
    if (!liveByLeague.has(ref.sportmonks_league_id)) {
      try {
        liveByLeague.set(ref.sportmonks_league_id, await fetchInplayForLeague(ref.sportmonks_league_id))
      } catch (e) {
        liveByLeague.set(ref.sportmonks_league_id, [])
        console.error(`[ratings-tick] fetch failed for league ${ref.sportmonks_league_id}:`, e)
      }
    }
  }

  const results: Array<{
    product: string
    owner_id: string
    sportmonks_league_id: number
    live_fixtures: number
    fixtures_upserted: number
    stats_total: number
    error?: string
  }> = []

  for (const ref of refs) {
    const live = liveByLeague.get(ref.sportmonks_league_id) ?? []
    if (!live.length) {
      results.push({
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        live_fixtures: 0,
        fixtures_upserted: 0,
        stats_total: 0,
      })
      continue
    }

    let fixtures_upserted = 0
    let stats_total = 0
    let err: string | undefined

    try {
      for (const fx of live) {
        const parsed = parseFixture(fx)
        if (ref.product === 'fm') {
          const r = await upsertFMPlayerStats(db, ref.owner_id, parsed)
          if (r.match_updated) fixtures_upserted += 1
          stats_total += r.stats_upserted
        } else if (ref.product === 'serie_a') {
          const r = await upsertSerieAPlayerStats(db, ref.owner_id, parsed)
          if (r.matchday_id) fixtures_upserted += 1
          stats_total += r.stats_upserted
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
    }

    results.push({
      product: ref.product,
      owner_id: ref.owner_id,
      sportmonks_league_id: ref.sportmonks_league_id,
      live_fixtures: live.length,
      fixtures_upserted,
      stats_total,
      error: err,
    })
  }

  return NextResponse.json({ live: liveByLeague.size, results })
}
