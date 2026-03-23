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
  /** true if the name match was exact, false if fuzzy */
  exact_match: boolean
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

// Levenshtein distance (simple O(m*n))
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
    }
  }
  return dp[m]![n]!
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

async function fetchFotMob(matchId: number): Promise<FotMobData | null> {
  const url = `https://www.fotmob.com/api/data/matchDetails?matchId=${matchId}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fantacalcio-statistico/1.0)',
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null

  const json = await res.json() as Record<string, unknown>
  const content = json['content'] as Record<string, unknown> | undefined
  if (!content) return null

  const playerStats = (content['playerStats'] as Record<string, unknown> | undefined) ?? {}
  const matchFacts = content['matchFacts'] as Record<string, unknown> | undefined
  const rawEvents = (matchFacts?.['events'] as Record<string, unknown> | undefined)?.['events']
  const eventsArr = Array.isArray(rawEvents) ? rawEvents as Record<string, unknown>[] : []

  // Parse playerStats
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

  // Parse events (cards, own goals, penalties)
  const events: FotMobEvent[] = eventsArr.map((e) => ({
    type: String(e['type'] ?? ''),
    player_id: e['playerId'] != null ? Number(e['playerId']) : null,
    card: e['card'] != null ? String(e['card']) : null,
    own_goal: e['ownGoal'] === true,
    goal_description: e['goalDescription'] != null ? String(e['goalDescription']) : null,
  }))

  return { stats, events }
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

async function fetchSofaScore(eventId: number): Promise<SofaScoreStat[] | null> {
  const url = `https://www.sofascore.com/api/v1/event/${eventId}/lineups`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; fantacalcio-statistico/1.0)',
      Accept: 'application/json',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) return null

  const json = await res.json() as Record<string, unknown>
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
        rating: rating,
        minutes_played: Number(stats?.['minutesPlayed'] ?? 0),
      })
    }
  }

  return out
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

export async function POST(req: NextRequest): Promise<NextResponse<FetchRatingsResponse>> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const { matchdayId } = await req.json() as { matchdayId?: string }
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

  // Fetch all fixtures in parallel
  await Promise.all(
    (fixtures ?? []).map(async (fx) => {
      const [fotmob, ss] = await Promise.all([
        fx.fotmob_match_id ? fetchFotMob(fx.fotmob_match_id) : Promise.resolve(null),
        fx.sofascore_event_id ? fetchSofaScore(fx.sofascore_event_id) : Promise.resolve(null),
      ])

      if (fx.fotmob_match_id && !fotmob) {
        errors.push(`FotMob fetch failed for match ${fx.fotmob_match_id}${fx.label ? ` (${fx.label})` : ''}`)
      }
      if (fx.sofascore_event_id && !ss) {
        errors.push(`SofaScore fetch failed for event ${fx.sofascore_event_id}${fx.label ? ` (${fx.label})` : ''}`)
      }

      const merged = mergeFixtureStats(fotmob, ss)
      allFetched.push(...merged)
    })
  )

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
    // Exact normalized name match
    const exact = dbPlayers.find((p) => p.normalized === stat.normalized_name)
    if (exact) {
      matched.push({
        league_player_id: exact.id,
        league_player_name: exact.full_name,
        club: exact.club,
        stat,
        exact_match: true,
      })
      continue
    }

    // Fuzzy: find DB player with minimum Levenshtein distance ≤ 3
    let best: typeof dbPlayers[number] | null = null
    let bestDist = Infinity
    for (const p of dbPlayers) {
      const d = levenshtein(stat.normalized_name, p.normalized)
      if (d < bestDist) { bestDist = d; best = p }
    }

    if (best && bestDist <= 3) {
      matched.push({
        league_player_id: best.id,
        league_player_name: best.full_name,
        club: best.club,
        stat,
        exact_match: false,
      })
    } else {
      unmatched.push({ stat, closest_name: best?.full_name ?? null })
    }
  }

  return NextResponse.json({ matched, unmatched, errors })
}
