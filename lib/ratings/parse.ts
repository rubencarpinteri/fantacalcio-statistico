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
    // Turkish dotless i (ı U+0131) and dotted İ (U+0130) — not decomposed by NFD
    .replace(/[ıİ]/g, 'i')
    // Cyrillic і (U+0456) and І (U+0406) — visually identical to Latin i, used in Ukrainian names
    .replace(/[іІ]/g, 'i')
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
    // Search ALL stat groups — FotMob splits stats across Attack/Defence/etc. groups
    const getStat = (key: string): number => {
      for (const group of statGroups) {
        const groupStats = group['stats'] as Record<string, Record<string, unknown>> | undefined
        const v = groupStats?.[key]?.['stat'] as Record<string, unknown> | undefined
        if (v?.['value'] != null) return Number(v['value'])
      }
      return 0
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

// ─── Player name matching ──────────────────────────────────────────────────────

export type DbPlayerEntry = {
  id: string
  full_name: string
  club: string
  normalized: string
  fotmob_player_id?: number | null
}

/**
 * Multi-strategy player matching — FotMob vs DB/Leghe naming differences.
 *
 * Strategy order:
 * 0. fotmob_player_id exact match (if provided) — definitive, no false positives
 * 1. Exact normalized name match
 * 2. Token-set match (same words, any order) — "V. Milinkovic-Savic" ↔ "Milinkovic-Savic V."
 * 3. Strip single-char initials from both sides — "A. Gudmundsson" ↔ "Gudmundsson A."
 * 4. DB tokens ⊆ FotMob tokens (unique match only) — "Bisseck" ↔ "Yann Bisseck"
 */
export function findDbPlayer<T extends DbPlayerEntry>(
  statNorm: string,
  dbPlayers: T[],
  fotmobId?: number | null,
): T | undefined {
  // Step 0: ID match — fastest and most reliable
  if (fotmobId != null) {
    const idMatch = dbPlayers.find(p => p.fotmob_player_id != null && p.fotmob_player_id === fotmobId)
    if (idMatch) return idMatch
  }

  const exact = dbPlayers.find(p => p.normalized === statNorm)
  if (exact) return exact

  const statTokens = statNorm.split(' ').filter(Boolean)
  const statSig = statTokens.filter(t => t.length > 1)

  // Token-set: same tokens, any order
  if (statTokens.length > 1) {
    const statSet = new Set(statTokens)
    const ts = dbPlayers.find(p => {
      const pts = p.normalized.split(' ').filter(Boolean)
      if (pts.length !== statTokens.length) return false
      return pts.every(t => statSet.has(t))
    })
    if (ts) return ts
  }

  // Strip initials from both sides
  if (statSig.length > 0) {
    const sigSet = new Set(statSig)
    const sigCands = dbPlayers.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length !== statSig.length) return false
      return psig.every(t => sigSet.has(t))
    })
    if (sigCands.length === 1) return sigCands[0]
  }

  // DB tokens ⊆ FotMob tokens (unique match only)
  // handles: "Bisseck" (DB) ↔ "Yann Bisseck" (FotMob)
  if (statSig.length > 0) {
    const sigSet = new Set(statSig)
    const subCands = dbPlayers.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length === 0 || psig.length >= statSig.length) return false
      return psig.every(t => sigSet.has(t))
    })
    if (subCands.length === 1) return subCands[0]
  }

  // FotMob tokens ⊆ DB tokens (unique match only)
  // handles: "N'Dicka" (FotMob) ↔ "Evan N'Dicka" (DB)
  if (statSig.length > 0) {
    const superCands = dbPlayers.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length <= statSig.length) return false
      return statSig.every(t => psig.includes(t))
    })
    if (superCands.length === 1) return superCands[0]
  }

  // Surname + name-prefix abbreviation (Leghe format)
  // handles: "Thuram K." → "Khéphren Thuram", "Esposito Se." → "Sebastiano Esposito"
  // Input has exactly 2 tokens, one is short (≤ 3 chars = abbreviated first name),
  // the other is the surname. Matches DB players whose surname equals the long token
  // AND whose first name starts with the short token.
  if (statTokens.length === 2) {
    const shortIdx = statTokens[0]!.length <= 3 ? 0 : statTokens[1]!.length <= 3 ? 1 : -1
    if (shortIdx !== -1) {
      const abbrev    = statTokens[shortIdx]!          // e.g. "k" or "se"
      const surnameT  = statTokens[1 - shortIdx]!      // e.g. "thuram" or "esposito"
      const prefixCands = dbPlayers.filter(p => {
        const pts = p.normalized.split(' ').filter(Boolean)
        if (!pts.includes(surnameT)) return false
        return pts.some(t => t !== surnameT && t.startsWith(abbrev))
      })
      if (prefixCands.length === 1) return prefixCands[0]
    }
  }

  return undefined
}
