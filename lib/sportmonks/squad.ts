/**
 * Team squad — used by the seed/backfill script.
 *
 * GET /squads/teams/{team_id}?include=player
 *
 * Returns one row per current contract. We dedupe on player_id
 * (a player may have multiple contract rows in edge cases).
 */

import { fetchSportMonks } from './client'
import type { SMPlayer, SMSquadEntry } from './types'

export async function fetchTeamSquad(teamId: number): Promise<SMSquadEntry[]> {
  const env = await fetchSportMonks<SMSquadEntry[]>(
    `/squads/teams/${teamId}`,
    { include: 'player' },
    'Squad',
  )
  return env.data ?? []
}

/** Convenience: just the unique player rows. */
export async function fetchTeamPlayers(teamId: number): Promise<SMPlayer[]> {
  const squad = await fetchTeamSquad(teamId)
  const seen = new Set<number>()
  const out: SMPlayer[] = []
  for (const entry of squad) {
    if (seen.has(entry.player_id)) continue
    seen.add(entry.player_id)
    out.push(entry.player)
  }
  return out
}

/** GET /teams/seasons/{season_id} — all teams in a season. */
export async function listTeamsInSeason(seasonId: number): Promise<Array<{ id: number; name: string }>> {
  const env = await fetchSportMonks<Array<{ id: number; name: string }>>(
    `/teams/seasons/${seasonId}`,
    {},
    'Team',
  )
  return env.data ?? []
}

/** GET /coaches/teams/{team_id} — current coach for a team. */
export async function fetchTeamCoach(teamId: number): Promise<{ id: number; name: string } | null> {
  const env = await fetchSportMonks<Array<{ id: number; name: string }>>(
    `/coaches/teams/${teamId}`,
    {},
    'Coach',
  )
  return env.data?.[0] ?? null
}
