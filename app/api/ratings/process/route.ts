import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import {
  parseFotMobJson,
  parseSofaScoreJson,
  mergeFixtureStats,
  normalizeName,
  type FetchedPlayerStat,
} from '@/lib/ratings/parse'

export type MatchedPlayer = {
  league_player_id: string
  league_player_name: string
  club: string
  stat: FetchedPlayerStat
}
export type UnmatchedPlayer = { stat: FetchedPlayerStat; closest_name: string | null }
export type ProcessRatingsResponse = {
  matched: MatchedPlayer[]
  unmatched: UnmatchedPlayer[]
  errors: string[]
}

type FixturePayload = {
  label: string
  fotmobData: Record<string, unknown> | null
  sofascoreData: Record<string, unknown> | null
}

/**
 * POST /api/ratings/process
 *
 * Accepts raw JSON responses from FotMob and SofaScore (fetched client-side
 * from the user's browser), parses them, matches to league players, and
 * returns matched/unmatched lists ready for import.
 *
 * Body: { matchdayId: string, fixtures: FixturePayload[] }
 */
export async function POST(req: NextRequest): Promise<NextResponse<ProcessRatingsResponse>> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await req.json() as { matchdayId?: string; fixtures?: FixturePayload[] }

  if (!body.matchdayId || !body.fixtures) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['matchdayId and fixtures required'] }, { status: 400 })
  }

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, league_id')
    .eq('id', body.matchdayId)
    .single()

  if (!matchday) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Matchday not found'] }, { status: 404 })
  }

  const errors: string[] = []
  const allFetched: FetchedPlayerStat[] = []

  for (const fx of body.fixtures) {
    const fotmob = fx.fotmobData ? parseFotMobJson(fx.fotmobData) : null
    const sofascore = fx.sofascoreData ? parseSofaScoreJson(fx.sofascoreData) : null
    if (!fotmob && !sofascore) {
      errors.push(`Nessun dato per ${fx.label}`)
    }
    allFetched.push(...mergeFixtureStats(fotmob, sofascore))
  }

  if (allFetched.length === 0) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Nessun giocatore trovato', ...errors] })
  }

  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club')
    .eq('league_id', matchday.league_id)
    .eq('is_active', true)

  const dbPlayers = (leaguePlayers ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    club: p.club,
    normalized: normalizeName(p.full_name),
  }))

  const matched: MatchedPlayer[] = []
  const unmatched: UnmatchedPlayer[] = []

  for (const stat of allFetched) {
    const exact = dbPlayers.find((p) => p.normalized === stat.normalized_name)
    if (exact) {
      matched.push({ league_player_id: exact.id, league_player_name: exact.full_name, club: exact.club, stat })
    } else {
      unmatched.push({ stat, closest_name: null })
    }
  }

  return NextResponse.json({ matched, unmatched, errors })
}
