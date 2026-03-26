import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'

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
// Name normalisation
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// FotMob fetcher
// ---------------------------------------------------------------------------

type FotMobStat = {
  fotmob_id: number
  name: string
  team_name: string
  is_goalkeeper: boolean
  rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  goals_conceded: number
  saves: number
}

type FotMobEvent = {
  type: string
  player_id: number | null
  card: string | null
  own_goal: boolean
  goal_description: string | null
}

type FotMobData = { stats: FotMobStat[]; events: FotMobEvent[] }

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * FotMob no longer exposes a public JSON API endpoint.
 * The full match data is embedded in the HTML page as __NEXT_DATA__ JSON.
 * We fetch the HTML page and extract the data — no auth token required.
 */
async function fetchFotMob(matchId: number): Promise<{ data: FotMobData | null; status: number }> {
  const url = `https://www.fotmob.com/match/${matchId}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    })
  } catch {
    return { data: null, status: 0 }
  }
  if (!res.ok) return { data: null, status: res.status }

  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)
  if (!m?.[1]) return { data: null, status: 200 }

  let pageProps: Record<string, unknown>
  try {
    const nextData = JSON.parse(m[1]) as Record<string, unknown>
    pageProps = (nextData['props'] as Record<string, unknown>)?.['pageProps'] as Record<string, unknown> ?? {}
  } catch {
    return { data: null, status: 200 }
  }

  const content = pageProps['content'] as Record<string, unknown> | undefined
  if (!content) return { data: null, status: 200 }

  const playerStats = (content['playerStats'] as Record<string, unknown> | undefined) ?? {}
  const matchFacts = content['matchFacts'] as Record<string, unknown> | undefined
  const rawEvents = (matchFacts?.['events'] as Record<string, unknown> | undefined)?.['events']
  const eventsArr = Array.isArray(rawEvents) ? rawEvents as Record<string, unknown>[] : []

  const stats: FotMobStat[] = []
  for (const [idStr, raw] of Object.entries(playerStats)) {
    const p = raw as Record<string, unknown>
    const statGroups = p['stats'] as Array<Record<string, unknown>> | undefined
    if (!statGroups?.length) continue

    const topGroup = statGroups[0]!['stats'] as Record<string, Record<string, unknown>> | undefined
    const getStat = (key: string): number => {
      const v = topGroup?.[key]?.['stat'] as Record<string, unknown> | undefined
      return Number(v?.['value'] ?? 0)
    }

    stats.push({
      fotmob_id: Number(idStr),
      name: String(p['name'] ?? ''),
      team_name: String(p['teamName'] ?? ''),
      is_goalkeeper: Boolean(p['isGoalkeeper']),
      rating: getStat('FotMob rating') || null,
      minutes_played: getStat('Minutes played'),
      goals_scored: getStat('Goals'),
      assists: getStat('Assists'),
      goals_conceded: getStat('Goals conceded'),
      saves: getStat('Saves'),
    })
  }

  const events: FotMobEvent[] = eventsArr.map((e) => ({
    type: String(e['type'] ?? ''),
    player_id: e['playerId'] != null ? Number(e['playerId']) : null,
    card: e['card'] != null ? String(e['card']) : null,
    own_goal: e['ownGoal'] === true,
    goal_description: e['goalDescription'] != null ? String(e['goalDescription']) : null,
  }))

  return { data: { stats, events }, status: 200 }
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
// Merge FotMob + SofaScore into unified FetchedPlayerStat[]
// ---------------------------------------------------------------------------

function mergeFixtureStats(
  fotmob: FotMobData | null,
  sofascore: SofaScoreStat[] | null,
): FetchedPlayerStat[] {
  const map = new Map<string, FetchedPlayerStat>()

  // Build event counters from FotMob
  const yellowsByFotmobId = new Map<number, number>()
  const redsByFotmobId = new Map<number, number>()
  const ownGoalsByFotmobId = new Map<number, number>()
  const penScoredByFotmobId = new Map<number, number>()
  const penMissedByFotmobId = new Map<number, number>()

  for (const e of fotmob?.events ?? []) {
    if (!e.player_id) continue
    const pid = e.player_id
    if (e.type === 'Card') {
      if (e.card === 'Yellow') yellowsByFotmobId.set(pid, (yellowsByFotmobId.get(pid) ?? 0) + 1)
      else if (e.card === 'Red') redsByFotmobId.set(pid, (redsByFotmobId.get(pid) ?? 0) + 1)
    } else if (e.type === 'Goal') {
      if (e.own_goal) ownGoalsByFotmobId.set(pid, (ownGoalsByFotmobId.get(pid) ?? 0) + 1)
      else if (e.goal_description?.toLowerCase() === 'penalty')
        penScoredByFotmobId.set(pid, (penScoredByFotmobId.get(pid) ?? 0) + 1)
    } else if (e.type === 'MissedPenalty') {
      penMissedByFotmobId.set(pid, (penMissedByFotmobId.get(pid) ?? 0) + 1)
    }
  }

  // Seed from FotMob playerStats
  for (const s of fotmob?.stats ?? []) {
    const key = normalizeName(s.name)
    map.set(key, {
      fotmob_id: s.fotmob_id,
      sofascore_id: null,
      name: s.name,
      normalized_name: key,
      team_label: s.team_name,
      sofascore_rating: null,
      fotmob_rating: s.rating,
      minutes_played: s.minutes_played,
      goals_scored: s.goals_scored,
      assists: s.assists,
      own_goals: ownGoalsByFotmobId.get(s.fotmob_id) ?? 0,
      yellow_cards: yellowsByFotmobId.get(s.fotmob_id) ?? 0,
      red_cards: redsByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_scored: penScoredByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_missed: penMissedByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_saved: 0, // Not available in this endpoint
      goals_conceded: s.goals_conceded,
      saves: s.saves,
    })
  }

  // Merge SofaScore rating by normalized name
  for (const ss of sofascore ?? []) {
    const key = normalizeName(ss.name)
    const existing = map.get(key)
    if (existing) {
      existing.sofascore_id = ss.sofascore_id
      existing.sofascore_rating = ss.rating
      // Use SofaScore minutes as tiebreaker if FotMob gave 0
      if (existing.minutes_played === 0 && ss.minutes_played > 0) {
        existing.minutes_played = ss.minutes_played
      }
    } else {
      // Player only in SofaScore (FotMob stats may be missing for subs with 0 stat lines)
      map.set(key, {
        fotmob_id: null,
        sofascore_id: ss.sofascore_id,
        name: ss.name,
        normalized_name: key,
        team_label: '',
        sofascore_rating: ss.rating,
        fotmob_rating: null,
        minutes_played: ss.minutes_played,
        goals_scored: 0,
        assists: 0,
        own_goals: 0,
        yellow_cards: 0,
        red_cards: 0,
        penalties_scored: 0,
        penalties_missed: 0,
        penalties_saved: 0,
        goals_conceded: 0,
        saves: 0,
      })
    }
  }

  return Array.from(map.values())
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
    // FotMob: always fetch server-side (requires x-mas token)
    const fotmobResult = fx.fotmob_match_id
      ? await fetchFotMob(fx.fotmob_match_id)
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
    const exact = dbPlayers.find((p) => p.normalized === stat.normalized_name)
    if (exact) {
      matched.push({
        league_player_id: exact.id,
        league_player_name: exact.full_name,
        club: exact.club,
        stat,
      })
    } else {
      unmatched.push({ stat, closest_name: null })
    }
  }

  return NextResponse.json({ matched, unmatched, errors })
}
