import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'
import type { FMTeamRoundScoreResult } from './types'

export function computeGoals(rawTotal: number, thresholds: number[]): number {
  const sorted = [...thresholds].sort((a, b) => a - b)
  return sorted.filter((t) => rawTotal >= t).length
}

export function aggregateTeamRoundScore(opts: {
  scoringRoundId: string
  fantasyTeamId: string
  playerFinalScores: number[]
  coachFinalScore: number
  config: FMCompetitionConfig
}): FMTeamRoundScoreResult {
  const { scoringRoundId, fantasyTeamId, playerFinalScores, coachFinalScore, config } = opts

  const player_total = playerFinalScores.reduce((s, v) => s + v, 0)
  const raw_total = player_total + coachFinalScore

  return {
    scoring_round_id: scoringRoundId,
    fantasy_team_id: fantasyTeamId,
    player_total,
    coach_total: coachFinalScore,
    raw_total,
    goals_scored: computeGoals(raw_total, config.battle_royale.goal_thresholds),
  }
}
