// Shared types for the all-lineups page tree.
// Pulled out of AllLineupsClient.tsx so the parent server component
// (page.tsx) can `import type` from a leaf file rather than from the
// client component bundle.

export interface SlotData {
  slotId: string
  positionName: string
  slotOrder: number
  isBench: boolean
  benchOrder: number | null
  allowedRoles: string[]
  playerId: string | null
  playerName: string | null
  playerClub: string | null
  playerRoles: string[]
  playerRatingClass: string | null
  fantavoto: number | null
  votoBase: number | null
  bonusMalus: Array<{ label: string; total: number }> | null
  zRating: number | null
  minutesFactor: number | null
  roleMultiplier: number | null
  // Raw ratings as fetched from the source (before any z-score / engine transformation)
  rawRating: number | null
  // Match stats from player_match_stats
  minutesPlayed: number | null
  goalsScored: number | null
  assists: number | null
  yellowCards: number | null
  redCards: number | null
  saves: number | null
  goalsConceded: number | null
  cleanSheet: boolean | null
  // SportMonks stats
  shots: number | null
  shotsOnTarget: number | null
  bigChanceCreated: number | null
  bigChanceMissed: number | null
  blockedScoringAttempt: number | null
  xg: number | null
  xa: number | null
  keyPasses: number | null
  totalPasses: number | null
  accuratePasses: number | null
  totalLongBalls: number | null
  accurateLongBalls: number | null
  totalCrosses: number | null
  successfulDribbles: number | null
  dribbleAttempts: number | null
  touches: number | null
  ballCarries: number | null
  progressiveCarries: number | null
  dispossessed: number | null
  possessionLostCtrl: number | null
  tackles: number | null
  totalTackles: number | null
  interceptions: number | null
  clearances: number | null
  blockedShots: number | null
  duelWon: number | null
  duelLost: number | null
  aerialWon: number | null
  aerialLost: number | null
  ballRecoveries: number | null
  foulsCommitted: number | null
  wasFouled: number | null
  marketValue: number | null
  height: number | null
  assignedMantraRole: string | null
  isBenchAssignment: boolean
  benchOrderAssignment: number | null
}

export interface TeamLineupData {
  teamId: string
  teamName: string
  formationId: string
  formationName: string
  submissionId: string | null
  submissionNumber: number | null
  slots: SlotData[]
}

export interface MatchupPair {
  homeTeamId: string
  awayTeamId: string
  homeGoals: number | null
  awayGoals: number | null
}
