import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { listFixturesBetween } from '@/lib/sportmonks/fixtures'
import {
  autoCreateFMRoundsAndMatches,
  listActiveLeagueRefs,
  refreshFMSquads,
  upsertFixtureCache,
} from '@/lib/sportmonks/db'

/**
 * GET /api/cron/sportmonks-fixtures-sync
 *
 * Daily 04:00 UTC. For each active SportMonks league (per
 * leagues.active_sportmonks_league_id and fm_competition.active_sportmonks_league_id),
 * pulls fixtures for the next 14 days, upserts the cache, and
 * auto-creates fm_scoring_round + fm_real_match rows where missing.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * cron-job.org config:
 *   URL:    https://<host>/api/cron/sportmonks-fixtures-sync
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Method: GET
 *   When:   daily 04:00 UTC
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

  const today = new Date()
  const in14 = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

  const results: Array<{
    product: string
    owner_id: string
    sportmonks_league_id: number
    fixtures_fetched: number
    cache_upserted: number
    rounds_created?: number
    matches_created?: number
    squad_teams?: number
    squad_players_new?: number
    squad_errors?: string[]
    error?: string
  }> = []

  // Cache fixtures per league (dedupe across multiple competitions
  // pointing at the same SportMonks league).
  const seenLeagues = new Map<number, Awaited<ReturnType<typeof listFixturesBetween>>>()

  for (const ref of refs) {
    try {
      let fixtures = seenLeagues.get(ref.sportmonks_league_id)
      if (!fixtures) {
        fixtures = await listFixturesBetween(ref.sportmonks_league_id, today, in14)
        seenLeagues.set(ref.sportmonks_league_id, fixtures)
        await upsertFixtureCache(db, fixtures)
      }

      const entry: typeof results[number] = {
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        fixtures_fetched: fixtures.length,
        cache_upserted: fixtures.length,
      }

      if (ref.product === 'fm') {
        const { rounds_created, matches_created } = await autoCreateFMRoundsAndMatches(
          db,
          ref.owner_id,
          fixtures,
        )
        entry.rounds_created = rounds_created
        entry.matches_created = matches_created

        // Daily squad refresh — picks up roster announcements,
        // injury replacements, shirt-number changes. One API call
        // per national team.
        const squad = await refreshFMSquads(db, ref.owner_id)
        entry.squad_teams = squad.teams_processed
        entry.squad_players_new = squad.players_upserted
        if (squad.errors.length) entry.squad_errors = squad.errors
      }

      results.push(entry)
    } catch (e) {
      results.push({
        product: ref.product,
        owner_id: ref.owner_id,
        sportmonks_league_id: ref.sportmonks_league_id,
        fixtures_fetched: 0,
        cache_upserted: 0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ refs: refs.length, results })
}
