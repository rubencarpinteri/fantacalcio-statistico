/**
 * Pure parsing functions for FotMob and SofaScore match data.
 * No server imports — safe to use from both client and server.
 */

export type FetchedPlayerStat = {
  fotmob_id: number | null
  sofascore_id: number | null
  name: string
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

export function normalizeName(name: string): string {
  return name
    // Map characters that NFD does NOT decompose to a base letter
    .replace(/[Øø]/g, 'o')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Łł]/g, 'l')
    .replace(/[Ðð]/g, 'd')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── FotMob parser ────────────────────────────────────────────────────────────

type FotMobStat = {
  fotmob_id: number; name: string; team_name: string
  rating: number | null; minutes_played: number
  goals_scored: number; assists: number; goals_conceded: number; saves: number
}
type FotMobEvent = {
  type: string; player_id: number | null; card: string | null
  own_goal: boolean; goal_description: string | null
}
type FotMobData = { stats: FotMobStat[]; events: FotMobEvent[] }

export function parseFotMobJson(json: Record<string, unknown>): FotMobData {
  const content = json['content'] as Record<string, unknown> | undefined
  if (!content) return { stats: [], events: [] }

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

  return { stats, events }
}

// ─── SofaScore parser ─────────────────────────────────────────────────────────

type SofaScoreStat = {
  sofascore_id: number; name: string
  rating: number | null; minutes_played: number
}

export function parseSofaScoreJson(json: Record<string, unknown>): SofaScoreStat[] {
  const out: SofaScoreStat[] = []
  for (const side of ['home', 'away'] as const) {
    const team = json[side] as Record<string, unknown> | undefined
    const players = team?.['players'] as Array<Record<string, unknown>> | undefined
    for (const p of players ?? []) {
      const player = p['player'] as Record<string, unknown> | undefined
      const stats = p['statistics'] as Record<string, unknown> | undefined
      if (!player) continue
      out.push({
        sofascore_id: Number(player['id']),
        name: String(player['name'] ?? ''),
        rating: stats?.['rating'] != null ? Number(stats['rating']) : null,
        minutes_played: Number(stats?.['minutesPlayed'] ?? 0),
      })
    }
  }
  return out
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export function mergeFixtureStats(
  fotmob: FotMobData | null,
  sofascore: SofaScoreStat[] | null,
): FetchedPlayerStat[] {
  const map = new Map<string, FetchedPlayerStat>()

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

  for (const s of fotmob?.stats ?? []) {
    const key = normalizeName(s.name)
    map.set(key, {
      fotmob_id: s.fotmob_id, sofascore_id: null,
      name: s.name, normalized_name: key, team_label: s.team_name,
      sofascore_rating: null, fotmob_rating: s.rating,
      minutes_played: s.minutes_played,
      goals_scored: s.goals_scored, assists: s.assists,
      own_goals: ownGoalsByFotmobId.get(s.fotmob_id) ?? 0,
      yellow_cards: yellowsByFotmobId.get(s.fotmob_id) ?? 0,
      red_cards: redsByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_scored: penScoredByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_missed: penMissedByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_saved: 0,
      goals_conceded: s.goals_conceded, saves: s.saves,
    })
  }

  for (const ss of sofascore ?? []) {
    const key = normalizeName(ss.name)
    const existing = map.get(key)
    if (existing) {
      existing.sofascore_id = ss.sofascore_id
      existing.sofascore_rating = ss.rating
      if (existing.minutes_played === 0 && ss.minutes_played > 0)
        existing.minutes_played = ss.minutes_played
    } else {
      map.set(key, {
        fotmob_id: null, sofascore_id: ss.sofascore_id,
        name: ss.name, normalized_name: key, team_label: '',
        sofascore_rating: ss.rating, fotmob_rating: null,
        minutes_played: ss.minutes_played,
        goals_scored: 0, assists: 0, own_goals: 0,
        yellow_cards: 0, red_cards: 0,
        penalties_scored: 0, penalties_missed: 0, penalties_saved: 0,
        goals_conceded: 0, saves: 0,
      })
    }
  }

  return Array.from(map.values())
}
