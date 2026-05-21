/**
 * Common Supabase select-join shapes.
 *
 * Our generated types in `types/database.types.ts` carry
 * `Relationships: never[]`, so the select-query parser cannot resolve
 * embedded selects like `leagues(*)` or `league_players(full_name)` and
 * returns them typed as `unknown`. Call sites still need a cast, but
 * naming the target shape here keeps query → shape contracts consistent
 * and gives us a single migration checklist when typegen produces real
 * FK metadata.
 *
 * Usage:
 *   const player = row.league_players as unknown as JoinedPlayerNameClub | null
 *   const team   = row.fantasy_teams  as unknown as JoinedTeamName | null
 *
 * When a query needs columns not covered here, declare an inline shape
 * at the call site rather than enlarging this file.
 */

export type JoinedLeagueName = { name: string }
export type JoinedLeagueId = { league_id: string }
export type JoinedProfileName = { username: string; full_name: string | null }
export type JoinedPlayerName = { full_name: string }
export type JoinedPlayerNameClub = { full_name: string; club: string }
export type JoinedPlayerNameClubClass = {
  full_name: string
  club: string
  rating_class: string
}
export type JoinedTeamName = { name: string }
export type JoinedCompetitionNameType = { name: string; type: string }
