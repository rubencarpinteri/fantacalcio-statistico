// ============================================================
// domain/competitions/roundRobin.ts
// ============================================================
// Pure schedule generator using the standard "fix-first, rotate-rest"
// round-robin algorithm.
//
// legs = 1: each team plays every other team once (N-1 rounds)
// legs = 2: double-leg (2*(N-1) rounds) — second half reverses home/away
//
// If N is odd, a phantom "bye" team is appended. Fixtures involving
// the bye team are excluded from the output. This ensures every real
// team gets a consistent slot pattern even with an odd participant count.
// ============================================================

export interface ScheduledFixture {
  round_number: number
  home_team_id: string
  away_team_id: string
}

/**
 * Generates a complete round-robin schedule.
 * Returns fixtures sorted by round_number ascending.
 */
export function generateRoundRobin(
  teamIds: string[],
  legs: 1 | 2 = 2
): ScheduledFixture[] {
  if (teamIds.length < 2) return []

  const BYE = '__bye__'
  const teams = [...teamIds]
  if (teams.length % 2 !== 0) teams.push(BYE)

  const n = teams.length
  const fixed    = teams[0]!
  const rotating = teams.slice(1)
  const firstLeg: ScheduledFixture[] = []

  for (let r = 0; r < n - 1; r++) {
    const current = [fixed, ...rotating]
    for (let i = 0; i < n / 2; i++) {
      const home = current[i]!
      const away = current[n - 1 - i]!
      if (home !== BYE && away !== BYE) {
        firstLeg.push({ round_number: r + 1, home_team_id: home, away_team_id: away })
      }
    }
    // Rotate: move the last element of rotating to the front
    rotating.unshift(rotating.pop()!)
  }

  if (legs === 1) return firstLeg

  const offset = n - 1
  const secondLeg = firstLeg.map((f) => ({
    round_number: f.round_number + offset,
    home_team_id: f.away_team_id,
    away_team_id: f.home_team_id,
  }))

  return [...firstLeg, ...secondLeg]
}
