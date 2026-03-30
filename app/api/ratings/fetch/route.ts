import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { normalizeName, mergeFixtureStats, findDbPlayer } from '@/lib/ratings/parse'
import { fetchFotMobMatch } from '@/lib/ratings/fotmob'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchedPlayerStat = {
  /** FotMob player ID */
  fotmob_id: number | null
  /** SofaScore player ID */
  sofascore_id: number | null
  name: string
  /** Normalized name used for matching (no accents, lowercase) */
  normalized_name: string
  team_label: string
  sofascore_rating: number | null
  fotmob_rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  goals_conceded: number
  saves: number
}

export type MatchedPlayer = {
  league_player_id: string
  league_player_name: string
  club: string
  stat: FetchedPlayerStat
}

export type UnmatchedPlayer = {
  stat: FetchedPlayerStat
  /** closest DB name, if any */
  closest_name: string | null
}

export type FetchRatingsResponse = {
  matched: MatchedPlayer[]
  unmatched: UnmatchedPlayer[]
  errors: string[]
}


// ---------------------------------------------------------------------------
// SofaScore fetcher
// ---------------------------------------------------------------------------

type SofaScoreStat = {
  sofascore_id: number
  name: string
  position: string
  rating: number | null
  minutes_played: number
}

function parseSofaScoreStats(json: Record<string, unknown>): SofaScoreStat[] {
  const out: SofaScoreStat[] = []
  for (const side of ['home', 'away'] as const) {
    const team = json[side] as Record<string, unknown> | undefined
    const players = team?.['players'] as Array<Record<string, unknown>> | undefined
    for (const p of players ?? []) {
      const player = p['player'] as Record<string, unknown> | undefined
      const stats = p['statistics'] as Record<string, unknown> | undefined
      if (!player) continue
      const rating = stats?.['rating'] != null ? Number(stats['rating']) : null
      out.push({
        sofascore_id: Number(player['id']),
        name: String(player['name'] ?? ''),
        position: String(p['position'] ?? ''),
        rating,
        minutes_played: Number(stats?.['minutesPlayed'] ?? 0),
      })
    }
  }
  return out
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function fetchSofaScore(eventId: number): Promise<{ data: SofaScoreStat[] | null; status: number }> {
  const url = `https://api.sofascore.com/api/v1/event/${eventId}/lineups`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': '*/*',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
    })
  } catch {
    return { data: null, status: 0 }
  }
  if (!res.ok) return { data: null, status: res.status }

  const json = await res.json() as Record<string, unknown>
  return { data: parseSofaScoreStats(json), status: 200 }
}


// ---------------------------------------------------------------------------
// POST /api/ratings/fetch
// ---------------------------------------------------------------------------

type RequestBody = {
  matchdayId?: string
  /**
   * Pre-fetched SofaScore lineups keyed by sofascore_event_id.
   * SofaScore blocks server-side and cross-origin browser requests.
   * Data must be provided by the client via manual paste or a direct browser fetch.
   * If absent, SofaScore is skipped entirely (FotMob-only mode).
   */
  sofascoreByEventId?: Record<string, Record<string, unknown>>
}

export async function POST(req: NextRequest): Promise<NextResponse<FetchRatingsResponse>> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await req.json() as RequestBody
  const { matchdayId, sofascoreByEventId } = body
  if (!matchdayId) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['matchdayId required'] }, { status: 400 })
  }

  // Load fixtures + league context
  const [{ data: matchday }, { data: fixtures }] = await Promise.all([
    supabase.from('matchdays').select('id, league_id').eq('id', matchdayId).single(),
    supabase.from('matchday_fixtures').select('*').eq('matchday_id', matchdayId),
  ])

  if (!matchday) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Matchday not found'] }, { status: 404 })
  }

  const errors: string[] = []
  const allFetched: FetchedPlayerStat[] = []

  // Fetch fixtures sequentially to avoid rate-limiting
  for (const fx of fixtures ?? []) {
    // FotMob: always fetch server-side
    const fotmobResult = fx.fotmob_match_id
      ? await fetchFotMobMatch(fx.fotmob_match_id)
      : { data: null, status: 0 }

    // SofaScore: only use pre-fetched browser data; server-side is IP-blocked (403)
    let ssResult: { data: SofaScoreStat[] | null; status: number }
    if (fx.sofascore_event_id && sofascoreByEventId?.[String(fx.sofascore_event_id)]) {
      ssResult = { data: parseSofaScoreStats(sofascoreByEventId[String(fx.sofascore_event_id)]!), status: 200 }
    } else {
      ssResult = { data: null, status: 0 }
    }

    const label = fx.label ? ` (${fx.label})` : ''
    if (fx.fotmob_match_id && !fotmobResult.data) {
      errors.push(`FotMob fetch failed for match ${fx.fotmob_match_id}${label} — HTTP ${fotmobResult.status || 'network error'}`)
    }
    // SofaScore absence is not an error — it is skipped when no data is provided

    const merged = mergeFixtureStats(fotmobResult.data, ssResult.data)
    allFetched.push(...merged)
  }

  if (allFetched.length === 0) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['No player data fetched', ...errors] })
  }

  // Load all active league players for matching
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
    const found = findDbPlayer(stat.normalized_name, dbPlayers)
    if (found) {
      matched.push({
        league_player_id: found.id,
        league_player_name: found.full_name,
        club: found.club,
        stat,
      })
    } else {
      unmatched.push({ stat, closest_name: null })
    }
  }

  return NextResponse.json({ matched, unmatched, errors })
}
