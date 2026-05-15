/**
 * Pure parsing functions for FotMob match data.
 * No server imports — safe to use from both client and server.
 */

export type FetchedPlayerStat = {
  fotmob_id: number | null
  name: string
  normalized_name: string
  team_label: string
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
  /** True when the player's team conceded 0 goals in the match. Derived from FotMob GK data. */
  clean_sheet: boolean
  // Advanced FotMob stats — fed straight through to player_match_stats columns.
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
  xg: number | null; xa: number | null
  shots: number; shots_on_target: number; blocked_scoring_attempt: number
  big_chance_created: number; big_chance_missed: number
  key_passes: number; accurate_passes: number; final_third_passes: number
  accurate_long_balls: number; total_crosses: number; successful_dribbles: number
  touches: number; dispossessed: number
  tackles_won: number; interceptions: number; clearances: number; blocks: number
  dribbled_past: number; ball_recoveries: number
  duel_won: number; duel_lost: number; aerial_won: number
  fouls_committed: number; was_fouled: number; error_leading_to_goal: number
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
      fotmob_id: Number(idStr),
      name: String(p['name'] ?? ''),
      team_name: String(p['teamName'] ?? ''),
      rating: getStat('FotMob rating') || null,
      minutes_played: getStat('Minutes played'),
      goals_scored: getStat('Goals'),
      assists: getStat('Assists'),
      goals_conceded: getStat('Goals conceded'),
      saves: getStat('Saves'),
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
    type: String(e['type'] ?? ''),
    player_id: e['playerId'] != null ? Number(e['playerId']) : null,
    card: e['card'] != null ? String(e['card']) : null,
    own_goal: e['ownGoal'] === true,
    goal_description: e['goalDescription'] != null ? String(e['goalDescription']) : null,
  }))

  return { stats, events }
}

// ─── Build FetchedPlayerStat[] from FotMob data only ──────────────────────────

export function buildFixtureStats(
  fotmob: FotMobData | null,
): FetchedPlayerStat[] {
  if (!fotmob) return []

  const yellowsByFotmobId = new Map<number, number>()
  const redsByFotmobId = new Map<number, number>()
  const ownGoalsByFotmobId = new Map<number, number>()
  const penScoredByFotmobId = new Map<number, number>()
  const penMissedByFotmobId = new Map<number, number>()

  for (const e of fotmob.events) {
    if (!e.player_id) continue
    const pid = e.player_id
    if (e.type === 'Card') {
      if (e.card === 'Yellow') yellowsByFotmobId.set(pid, (yellowsByFotmobId.get(pid) ?? 0) + 1)
      else if (e.card === 'Red') redsByFotmobId.set(pid, (redsByFotmobId.get(pid) ?? 0) + 1)
      else if (e.card === 'YellowRed') {
        // Second yellow → sent off: count as red and subsume the prior yellow.
        redsByFotmobId.set(pid, (redsByFotmobId.get(pid) ?? 0) + 1)
        yellowsByFotmobId.set(pid, Math.max(0, (yellowsByFotmobId.get(pid) ?? 0) - 1))
      }
    } else if (e.type === 'Goal') {
      if (e.own_goal) ownGoalsByFotmobId.set(pid, (ownGoalsByFotmobId.get(pid) ?? 0) + 1)
      else if (e.goal_description?.toLowerCase() === 'penalty')
        penScoredByFotmobId.set(pid, (penScoredByFotmobId.get(pid) ?? 0) + 1)
    } else if (e.type === 'MissedPenalty') {
      penMissedByFotmobId.set(pid, (penMissedByFotmobId.get(pid) ?? 0) + 1)
    }
  }

  // Derive clean_sheet per team: max goals_conceded across all players on each
  // team (FotMob only populates this for GKs). max === 0 → clean sheet.
  const maxGoalsConcededByTeam = new Map<string, number>()
  for (const s of fotmob.stats) {
    const prev = maxGoalsConcededByTeam.get(s.team_name) ?? 0
    maxGoalsConcededByTeam.set(s.team_name, Math.max(prev, s.goals_conceded))
  }

  const out: FetchedPlayerStat[] = []
  for (const s of fotmob.stats) {
    const key = normalizeName(s.name)
    const teamConceded = maxGoalsConcededByTeam.get(s.team_name) ?? 0
    out.push({
      fotmob_id: s.fotmob_id,
      name: s.name, normalized_name: key, team_label: s.team_name,
      fotmob_rating: s.rating,
      minutes_played: s.minutes_played,
      goals_scored: s.goals_scored, assists: s.assists,
      own_goals: ownGoalsByFotmobId.get(s.fotmob_id) ?? 0,
      yellow_cards: yellowsByFotmobId.get(s.fotmob_id) ?? 0,
      red_cards: redsByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_scored: penScoredByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_missed: penMissedByFotmobId.get(s.fotmob_id) ?? 0,
      penalties_saved: 0,
      goals_conceded: s.goals_conceded, saves: s.saves,
      clean_sheet: teamConceded === 0,
      xg: s.xg, xa: s.xa,
      shots: s.shots, shots_on_target: s.shots_on_target,
      blocked_scoring_attempt: s.blocked_scoring_attempt,
      big_chance_created: s.big_chance_created,
      big_chance_missed: s.big_chance_missed,
      key_passes: s.key_passes,
      accurate_passes: s.accurate_passes,
      final_third_passes: s.final_third_passes,
      accurate_long_balls: s.accurate_long_balls,
      total_crosses: s.total_crosses,
      successful_dribbles: s.successful_dribbles,
      touches: s.touches, dispossessed: s.dispossessed,
      tackles_won: s.tackles_won, interceptions: s.interceptions,
      clearances: s.clearances, blocks: s.blocks,
      dribbled_past: s.dribbled_past, ball_recoveries: s.ball_recoveries,
      duel_won: s.duel_won, duel_lost: s.duel_lost, aerial_won: s.aerial_won,
      fouls_committed: s.fouls_committed, was_fouled: s.was_fouled,
      error_leading_to_goal: s.error_leading_to_goal,
    })
  }

  return out
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

  // Name-matching candidates: exclude any DB player that has a fotmob_player_id set
  // to a value OTHER than the current stat's fotmob_id.
  const candidates = dbPlayers.filter(p =>
    p.fotmob_player_id == null || p.fotmob_player_id === fotmobId
  )

  const exact = candidates.find(p => p.normalized === statNorm)
  if (exact) return exact

  const statTokens = statNorm.split(' ').filter(Boolean)
  const statSig = statTokens.filter(t => t.length > 1)

  // Token-set: same tokens, any order
  if (statTokens.length > 1) {
    const statSet = new Set(statTokens)
    const ts = candidates.find(p => {
      const pts = p.normalized.split(' ').filter(Boolean)
      if (pts.length !== statTokens.length) return false
      return pts.every(t => statSet.has(t))
    })
    if (ts) return ts
  }

  // Strip initials from both sides
  if (statSig.length > 0) {
    const sigSet = new Set(statSig)
    const sigCands = candidates.filter(p => {
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
    const subCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length === 0 || psig.length >= statSig.length) return false
      return psig.every(t => sigSet.has(t))
    })
    if (subCands.length === 1) return subCands[0]
  }

  // FotMob tokens ⊆ DB tokens (unique match only)
  // handles: "N'Dicka" (FotMob) ↔ "Evan N'Dicka" (DB)
  if (statSig.length > 0) {
    const superCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length <= statSig.length) return false
      return statSig.every(t => psig.includes(t))
    })
    if (superCands.length === 1) return superCands[0]
  }

  // Surname + name-prefix abbreviation (Leghe format)
  // handles: "Thuram K." → "Khéphren Thuram", "Esposito Se." → "Sebastiano Esposito"
  if (statTokens.length === 2) {
    const shortIdx = statTokens[0]!.length <= 3 ? 0 : statTokens[1]!.length <= 3 ? 1 : -1
    if (shortIdx !== -1) {
      const abbrev    = statTokens[shortIdx]!
      const surnameT  = statTokens[1 - shortIdx]!
      const prefixCands = candidates.filter(p => {
        const pts = p.normalized.split(' ').filter(Boolean)
        if (!pts.includes(surnameT)) return false
        return pts.some(t => t !== surnameT && t.startsWith(abbrev))
      })
      if (prefixCands.length === 1) return prefixCands[0]
    }
  }

  // Multiple abbreviations — "Esposito F. P." → "esposito f p"
  {
    const longTks  = statTokens.filter(t => t.length > 2)
    const shortTks = statTokens.filter(t => t.length <= 2)
    if (longTks.length > 0 && shortTks.length > 0) {
      const multiAbbrevCands = candidates.filter(p => {
        const pts = p.normalized.split(' ').filter(Boolean)
        if (!longTks.every(lt => pts.includes(lt))) return false
        const remaining = pts.filter(t => !longTks.includes(t))
        return shortTks.every(abbr => remaining.some(t => t.startsWith(abbr)))
      })
      if (multiAbbrevCands.length === 1) return multiAbbrevCands[0]
    }
  }

  // Apostrophe-concatenation — "N'Dicka" normalises to "n dicka" but DB
  // may store it as "ndicka" (apostrophe removed at import time).
  for (let i = 0; i < statTokens.length - 1; i++) {
    const tok = statTokens[i]
    if (tok && tok.length <= 2) {
      const altTokens = [
        ...statTokens.slice(0, i),
        tok + statTokens[i + 1]!,
        ...statTokens.slice(i + 2),
      ]
      const altNorm = altTokens.join(' ')
      const altSig  = altTokens.filter(t => t.length > 1)

      const exactAlt = candidates.find(p => p.normalized === altNorm)
      if (exactAlt) return exactAlt

      if (altSig.length > 0) {
        const altSuperCands = candidates.filter(p => {
          const psig = p.normalized.split(' ').filter(t => t.length > 1)
          if (psig.length <= altSig.length) return false
          return altSig.every(t => psig.includes(t))
        })
        if (altSuperCands.length === 1) return altSuperCands[0]
      }
    }
  }

  // Token intersection — "Zambo Anguissa" ↔ "Frank Anguissa"
  if (statSig.length >= 2) {
    const sigSet = new Set(statSig)
    const intersectCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      return psig.some(t => sigSet.has(t))
    })
    if (intersectCands.length === 1) return intersectCands[0]
  }

  return undefined
}
