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
}

type FotMobEvent = {
  type: string
  player_id: number | null
  card: string | null
  own_goal: boolean
  goal_description: string | null
}

export type FotMobMatchData = { stats: FotMobStat[]; events: FotMobEvent[] }

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

    // Search ALL stat groups — FotMob splits stats across Attack/Defence/etc.
    const getStat = (key: string): number => {
      for (const group of statGroups) {
        const groupStats = group['stats'] as Record<string, Record<string, unknown>> | undefined
        const v = groupStats?.[key]?.['stat'] as Record<string, unknown> | undefined
        if (v?.['value'] != null) return Number(v['value'])
      }
      return 0
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
    })
  }

  const events: FotMobEvent[] = eventsArr.map((e) => ({
    type:             String(e['type'] ?? ''),
    player_id:        e['playerId'] != null ? Number(e['playerId']) : null,
    card:             e['card'] != null ? String(e['card']) : null,
    own_goal:         e['ownGoal'] === true,
    goal_description: e['goalDescription'] != null ? String(e['goalDescription']) : null,
  }))

  return { data: { stats, events }, status: 200 }
}
