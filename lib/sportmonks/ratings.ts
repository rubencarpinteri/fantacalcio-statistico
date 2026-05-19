/**
 * One-shot fetch+parse for a single fixture. Used by manual admin
 * re-fetch and by the reconcile cron.
 */

import { fetchFixtureWithDetail } from './fixtures'
import { parseFixture } from './parse'
import type { ParsedFixture } from './types'

export async function fetchAndParseFixture(fixtureId: number): Promise<ParsedFixture> {
  const fx = await fetchFixtureWithDetail(fixtureId)
  return parseFixture(fx)
}
