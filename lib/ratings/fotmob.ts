/**
 * Server-side FotMob match data fetcher.
 * Extracts player stats and match events from the page's __NEXT_DATA__ JSON.
 * No auth token required — data is embedded in the HTML.
 */

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
  xg: number | null
  xa: number | null
  shots: number
  shots_on_target: number
  blocked_scoring_attempt: number
  big_chance_created: number
  big_chance_missed: number
  key_passes: number
  accurate_passes: number
  final_third_passes: number
  accurate_long_balls: number
  total_crosses: number
  successful_dribbles: number
  touches: number
  dispossessed: number
  tackles_won: number
  interceptions: number
  clearances: number
  blocks: number
  dribbled_past: number
  ball_recoveries: number
  duel_won: number
  duel_lost: number
  aerial_won: number
  fouls_committed: number
  was_fouled: number
  error_leading_to_goal: number
}

type FotMobEvent = {
  type: string
  player_id: number | null
  card: string | null
  own_goal: boolean
  goal_description: string | null
}

export type FotMobMatchData = {
  stats: FotMobStat[]
  events: FotMobEvent[]
  started: boolean
  finished: boolean
  /** ISO UTC kickoff time from general.matchTimeUTCDate, when present. */
  kickoffAt: string | null
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function fetchFotMobMatch(
  matchId: number
): Promise<{ data: FotMobMatchData | null; status: number }> {
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

  const general = pageProps['general'] as Record<string, unknown> | undefined
  const started = general?.['started'] === true
  const finished = general?.['finished'] === true
  const kickoffRaw = general?.['matchTimeUTCDate']
  const kickoffAt = typeof kickoffRaw === 'string' ? kickoffRaw : null

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

    // Search ALL stat groups — FotMob splits stats across Top/Attack/Defence/Duels.
    const getStat = (key: string): number => {
      for (const group of statGroups) {
        const groupStats = group['stats'] as Record<string, Record<string, unknown>> | undefined
        const v = groupStats?.[key]?.['stat'] as Record<string, unknown> | undefined
        if (v?.['value'] != null) return Number(v['value'])
      }
      return 0
    }
    const getStatOrNull = (key: string): number | null => {
      for (const group of statGroups) {
        const groupStats = group['stats'] as Record<string, Record<string, unknown>> | undefined
        const v = groupStats?.[key]?.['stat'] as Record<string, unknown> | undefined
        if (v?.['value'] != null) return Number(v['value'])
      }
      return null
    }

    stats.push({
      fotmob_id:     Number(idStr),
      name:          String(p['name'] ?? ''),
      team_name:     String(p['teamName'] ?? ''),
      is_goalkeeper: Boolean(p['isGoalkeeper']),
      rating:        getStat('FotMob rating') || null,
      minutes_played: getStat('Minutes played'),
      goals_scored:  getStat('Goals'),
      assists:       getStat('Assists'),
      // FotMob reports team goals conceded for every player on the team.
      // Only the GK entry is meaningful — zero it out for all others.
      goals_conceded: Boolean(p['isGoalkeeper']) ? getStat('Goals conceded') : 0,
      saves:         getStat('Saves'),
      xg: getStatOrNull('Expected goals (xG)'),
      xa: getStatOrNull('Expected assists (xA)'),
      shots: getStat('Total shots'),
      shots_on_target: getStat('Shots on target'),
      blocked_scoring_attempt: getStat('Blocked shots'),
      big_chance_created: getStat('Big chances created'),
      big_chance_missed: getStat('Big chances missed'),
      key_passes: getStat('Chances created'),
      accurate_passes: getStat('Accurate passes'),
      final_third_passes: getStat('Passes into final third'),
      accurate_long_balls: getStat('Accurate long balls'),
      total_crosses: getStat('Accurate crosses'),
      successful_dribbles: getStat('Successful dribbles'),
      touches: getStat('Touches'),
      dispossessed: getStat('Dispossessed'),
      tackles_won: getStat('Tackles'),
      interceptions: getStat('Interceptions'),
      clearances: getStat('Clearances'),
      blocks: getStat('Blocks'),
      dribbled_past: getStat('Dribbled past'),
      ball_recoveries: getStat('Recoveries'),
      duel_won: getStat('Duels won'),
      duel_lost: getStat('Duels lost'),
      aerial_won: getStat('Aerial duels won'),
      fouls_committed: getStat('Fouls committed'),
      was_fouled: getStat('Was fouled'),
      error_leading_to_goal: getStat('Error led to goal'),
    })
  }

  const events: FotMobEvent[] = eventsArr.map((e) => ({
    type:             String(e['type'] ?? ''),
    player_id:        e['playerId'] != null ? Number(e['playerId']) : null,
    card:             e['card'] != null ? String(e['card']) : null,
    own_goal:         e['ownGoal'] === true,
    goal_description: e['goalDescription'] != null ? String(e['goalDescription']) : null,
  }))

  // Strip players who didn't appear. For live (in-progress) matches FotMob
  // omits `Minutes played` from the stat groups even for players already on
  // the pitch with a rating — so a strict `minutes_played > 0` filter erases
  // the entire match. Keep anyone with minutes OR a rating; bench/unused
  // squad members have neither.
  const playingStats = stats.filter((s) => s.minutes_played > 0 || s.rating != null)

  return { data: { stats: playingStats, events, started, finished, kickoffAt }, status: 200 }
}
