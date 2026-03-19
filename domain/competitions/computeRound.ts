// ============================================================
// domain/competitions/computeRound.ts
// ============================================================
// Pure computation core for a single competition round.
// No DB calls, no side effects — fully testable.
//
// Accepts fixture matchup pairs, a fantaVotoMap derived from
// published_team_scores, a scoring config, and prior standings.
// Returns enriched fixture results + new accumulated standings.
// ============================================================

import { fantaVotoToGoals } from './goalThresholds'
import type { GoalThreshold } from './goalThresholds'

// ---- Config types ------------------------------------------

export type ScoringMethod = 'goal_thresholds' | 'direct_comparison'

export interface ScoringConfig {
  method: ScoringMethod
  thresholds?: GoalThreshold[]
  points: { win: number; draw: number; loss: number }
}

// ---- Input / output types ----------------------------------

export interface FixtureInput {
  fixture_id: string
  home_team_id: string
  away_team_id: string
}

export interface FixtureResult {
  fixture_id: string
  home_team_id: string
  away_team_id: string
  home_fantavoto: number
  away_fantavoto: number
  /** null when method is direct_comparison */
  home_score: number | null
  away_score: number | null
  result: 'home_win' | 'away_win' | 'draw'
  home_points: number
  away_points: number
}

export interface TeamStandingRow {
  team_id: string
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  /** Cumulative sum of total_fantavoto across all rounds — used as tiebreaker */
  total_fantavoto: number
}

export interface RoundComputeResult {
  fixtures: FixtureResult[]
  /** Standings after including this round — sorted by tiebreaker_config order */
  standings: TeamStandingRow[]
}

// ---- Main computation --------------------------------------

/**
 * Computes fixture results for a round and returns updated standings.
 *
 * @param fixtures        Matchup pairs for this round
 * @param fantaVotoMap    Map<team_id, total_fantavoto> from published_team_scores
 * @param scoringConfig   How to translate fantavoto into outcomes
 * @param priorStandings  Accumulated standings from all prior rounds (empty for round 1)
 * @param tiebreakerOrder Ordered field names for standings sort (e.g. ["points","goal_difference",...])
 */
export function computeRound(
  fixtures: FixtureInput[],
  fantaVotoMap: Map<string, number>,
  scoringConfig: ScoringConfig,
  priorStandings: TeamStandingRow[],
  tiebreakerOrder: string[]
): RoundComputeResult {
  const { points: pts } = scoringConfig
  const fixtureResults: FixtureResult[] = []

  // Deltas accumulated within this round
  interface Delta {
    played: number; wins: number; draws: number; losses: number
    goals_for: number; goals_against: number; goal_difference: number
    points: number; fantavoto_delta: number
  }
  const deltas = new Map<string, Delta>()
  const initDelta = (): Delta => ({
    played: 0, wins: 0, draws: 0, losses: 0,
    goals_for: 0, goals_against: 0, goal_difference: 0,
    points: 0, fantavoto_delta: 0,
  })

  for (const f of fixtures) {
    const homeFV = fantaVotoMap.get(f.home_team_id) ?? 0
    const awayFV = fantaVotoMap.get(f.away_team_id) ?? 0

    let homeScore: number | null = null
    let awayScore: number | null = null
    let result: 'home_win' | 'away_win' | 'draw'

    if (scoringConfig.method === 'goal_thresholds' && scoringConfig.thresholds) {
      homeScore = fantaVotoToGoals(homeFV, scoringConfig.thresholds)
      awayScore = fantaVotoToGoals(awayFV, scoringConfig.thresholds)
      if (homeScore > awayScore)      result = 'home_win'
      else if (awayScore > homeScore) result = 'away_win'
      else                            result = 'draw'
    } else {
      // direct_comparison
      if (homeFV > awayFV)      result = 'home_win'
      else if (awayFV > homeFV) result = 'away_win'
      else                      result = 'draw'
    }

    const homePoints = result === 'home_win' ? pts.win : result === 'draw' ? pts.draw : pts.loss
    const awayPoints = result === 'away_win' ? pts.win : result === 'draw' ? pts.draw : pts.loss

    fixtureResults.push({
      fixture_id:     f.fixture_id,
      home_team_id:   f.home_team_id,
      away_team_id:   f.away_team_id,
      home_fantavoto: homeFV,
      away_fantavoto: awayFV,
      home_score:     homeScore,
      away_score:     awayScore,
      result,
      home_points:    homePoints,
      away_points:    awayPoints,
    })

    // Accumulate deltas for both teams
    if (!deltas.has(f.home_team_id)) deltas.set(f.home_team_id, initDelta())
    if (!deltas.has(f.away_team_id)) deltas.set(f.away_team_id, initDelta())

    const hd = deltas.get(f.home_team_id)!
    const ad = deltas.get(f.away_team_id)!

    const gf = homeScore ?? 0
    const ga = awayScore ?? 0

    hd.played++; hd.goals_for += gf; hd.goals_against += ga
    hd.goal_difference += gf - ga; hd.points += homePoints
    hd.fantavoto_delta += homeFV
    if (result === 'home_win') hd.wins++
    else if (result === 'draw') hd.draws++
    else hd.losses++

    ad.played++; ad.goals_for += ga; ad.goals_against += gf
    ad.goal_difference += ga - gf; ad.points += awayPoints
    ad.fantavoto_delta += awayFV
    if (result === 'away_win') ad.wins++
    else if (result === 'draw') ad.draws++
    else ad.losses++
  }

  // Merge prior standings with this round's deltas
  const standingsMap = new Map<string, TeamStandingRow>()
  for (const row of priorStandings) {
    standingsMap.set(row.team_id, { ...row })
  }
  // Ensure all teams touched this round are present
  for (const teamId of deltas.keys()) {
    if (!standingsMap.has(teamId)) {
      standingsMap.set(teamId, {
        team_id: teamId, played: 0, wins: 0, draws: 0, losses: 0,
        goals_for: 0, goals_against: 0, goal_difference: 0,
        points: 0, total_fantavoto: 0,
      })
    }
  }
  for (const [teamId, d] of deltas) {
    const row = standingsMap.get(teamId)!
    row.played          += d.played
    row.wins            += d.wins
    row.draws           += d.draws
    row.losses          += d.losses
    row.goals_for       += d.goals_for
    row.goals_against   += d.goals_against
    row.goal_difference += d.goal_difference
    row.points          += d.points
    row.total_fantavoto += d.fantavoto_delta
  }

  // Sort by tiebreaker order (all fields are numeric, descending)
  const sorted = [...standingsMap.values()].sort((a, b) => {
    for (const field of tiebreakerOrder) {
      // tiebreakerOrder strings are keys of TeamStandingRow whose values are
      // all numeric. TS forbids direct `TeamStandingRow as Record<string,
      // number>` (types don't sufficiently overlap), so we bridge via unknown.
      const av = (a as unknown as Record<string, number>)[field] ?? 0
      const bv = (b as unknown as Record<string, number>)[field] ?? 0
      if (bv !== av) return bv - av
    }
    return 0
  })

  return { fixtures: fixtureResults, standings: sorted }
}
