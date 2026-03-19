// ============================================================
// domain/competitions/goalThresholds.ts
// ============================================================
// Pure helper: converts a team's total_fantavoto to a fantasy
// goal count using the league-configured threshold table.
//
// Thresholds are evaluated in ascending `min` order.
// The last threshold whose `min` <= fantavoto wins.
// If fantavoto is below every threshold's min (i.e., < thresholds[0].min),
// 0 goals are returned.
// ============================================================

export interface GoalThreshold {
  min: number
  goals: number
}

/**
 * Default Italian Mantra thresholds used when creating a new competition.
 * Admins may override these per competition.
 */
export const DEFAULT_MANTRA_THRESHOLDS: GoalThreshold[] = [
  { min: 0,  goals: 0 },
  { min: 60, goals: 1 },
  { min: 66, goals: 2 },
  { min: 72, goals: 3 },
  { min: 78, goals: 4 },
  { min: 84, goals: 5 },
  { min: 90, goals: 6 },
]

/**
 * Converts a team's total_fantavoto to fantasy goals.
 * Thresholds are sorted ascending by `min` internally — caller order does not matter.
 */
export function fantaVotoToGoals(
  fantavoto: number,
  thresholds: GoalThreshold[]
): number {
  const sorted = [...thresholds].sort((a, b) => a.min - b.min)
  let goals = 0
  for (const t of sorted) {
    if (fantavoto >= t.min) {
      goals = t.goals
    } else {
      break
    }
  }
  return goals
}
