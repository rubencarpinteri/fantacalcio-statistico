// ============================================================
// domain/competitions/battleRoyalePairing.ts
// ============================================================
// Generates all pairings for a Battle Royal round.
// Every team plays every other team — C(n,2) fixtures per round.
// Home/away assignment is cosmetic (BR has no real home advantage).
// ============================================================

import type { FixtureInput } from './computeRound'

/**
 * Generates all pairings for n teams. For team-id list ordered as [a,b,c,d]
 * produces fixtures: a-b, a-c, a-d, b-c, b-d, c-d.
 *
 * The first id in each pair is the "home" — purely cosmetic for BR.
 *
 * @param teamIds Stable ordered list of team ids.
 * @param fixtureIdFn Generator for unique fixture ids (e.g. crypto.randomUUID).
 *                    Allows callers to pass any id strategy without coupling.
 */
export function generateBattleRoyalePairings(
  teamIds: string[],
  fixtureIdFn: (homeId: string, awayId: string) => string
): FixtureInput[] {
  const fixtures: FixtureInput[] = []
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const home = teamIds[i]!
      const away = teamIds[j]!
      fixtures.push({
        fixture_id: fixtureIdFn(home, away),
        home_team_id: home,
        away_team_id: away,
      })
    }
  }
  return fixtures
}
