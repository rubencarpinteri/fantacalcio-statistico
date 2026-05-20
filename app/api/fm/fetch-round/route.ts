import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/fantamondiale/server'
import { fetchFotMobMatch } from '@/lib/ratings/fotmob'

export type FetchRoundResponse = {
  matchesProcessed: number
  playersUpserted: number
  errors: string[]
}

// Determine W/D/L from FotMob events or from the parsed stat totals
function resolveMatchResult(
  homeGoals: number,
  awayGoals: number,
): 'home_win' | 'draw' | 'away_win' {
  if (homeGoals > awayGoals) return 'home_win'
  if (homeGoals < awayGoals) return 'away_win'
  return 'draw'
}

// Infer home/away score from FotMob goal events. Events are the authoritative
// source since player stat goals_scored may double-count in some edge cases.
function tallyScoredGoals(
  events: Array<{ type: string; player_id: number | null; own_goal: boolean }>,
  stats: Array<{ fotmob_id: number; team_name: string }>,
  homeTeamName: string,
): { homeGoals: number; awayGoals: number } {
  // Build a map from fotmob_id → team_name for goal attribution
  const teamByPlayer = new Map(stats.map((s) => [s.fotmob_id, s.team_name]))

  let homeGoals = 0
  let awayGoals = 0

  for (const ev of events) {
    const isGoalEvent = ev.type === 'Goal' || ev.type === 'PenaltyGoal' || ev.type === 'OwnGoal'
    if (!isGoalEvent) continue
    if (ev.player_id == null) continue

    const team = teamByPlayer.get(ev.player_id) ?? ''
    const scorerIsHome = team === homeTeamName

    // Own goals count for the other team
    if (ev.own_goal) {
      if (scorerIsHome) awayGoals++
      else homeGoals++
    } else {
      if (scorerIsHome) homeGoals++
      else awayGoals++
    }
  }

  return { homeGoals, awayGoals }
}

export async function POST(req: NextRequest): Promise<NextResponse<FetchRoundResponse>> {
  try {
    await requireSuperAdmin()
  } catch {
    return NextResponse.json({ matchesProcessed: 0, playersUpserted: 0, errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await req.json() as { roundId?: string }
  const { roundId } = body
  if (!roundId) {
    return NextResponse.json({ matchesProcessed: 0, playersUpserted: 0, errors: ['roundId required'] }, { status: 400 })
  }

  // Load real matches for this round that have a FotMob ID
  const { data: matches, error: matchError } = await supabase
    .from('fm_real_match')
    .select('id, fotmob_match_id, home_team_id, away_team_id')
    .eq('scoring_round_id', roundId)
    .not('fotmob_match_id', 'is', null)

  if (matchError) {
    return NextResponse.json({ matchesProcessed: 0, playersUpserted: 0, errors: [matchError.message] }, { status: 500 })
  }

  if (!matches?.length) {
    return NextResponse.json({ matchesProcessed: 0, playersUpserted: 0, errors: ['No matches with FotMob IDs in this round'] }, { status: 400 })
  }

  // Load team names for home/away detection. We need fotmob_team_id → national_team_id mapping.
  const teamIds = [...new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id]))]
  const { data: teams } = await supabase
    .from('fm_national_team')
    .select('id, name, fotmob_team_id')
    .in('id', teamIds)

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]))

  // Load fm_player fotmob_player_id → player uuid lookup
  const { data: allPlayers } = await supabase
    .from('fm_player')
    .select('id, fotmob_player_id, national_team_id')
    .not('fotmob_player_id', 'is', null)

  const playerByFotmobId = new Map(
    (allPlayers ?? []).map((p) => [p.fotmob_player_id!, p])
  )

  const errors: string[] = []
  let matchesProcessed = 0
  let playersUpserted = 0

  for (const match of matches) {
    const fotmobId = match.fotmob_match_id!
    const { data: fotmobData, status: httpStatus } = await fetchFotMobMatch(fotmobId)

    if (!fotmobData) {
      errors.push(`FotMob fetch failed for match ${fotmobId} — HTTP ${httpStatus || 'network error'}`)
      continue
    }

    if (!fotmobData.finished) {
      errors.push(`Match ${fotmobId} not finished yet — skipping`)
      continue
    }

    // Determine home team name for goal tally
    const homeTeam = teamById.get(match.home_team_id)
    const awayTeam = teamById.get(match.away_team_id)

    if (!homeTeam || !awayTeam) {
      errors.push(`Teams not found for match ${fotmobId}`)
      continue
    }

    // Tally goals from goal events (authoritative) with player→team lookup from stats
    const { homeGoals, awayGoals } = tallyScoredGoals(fotmobData.events, fotmobData.stats, homeTeam.name)
    const result = resolveMatchResult(homeGoals, awayGoals)

    // Update fm_real_match with result
    const { error: updateError } = await supabase
      .from('fm_real_match')
      .update({
        home_score: homeGoals,
        away_score: awayGoals,
        result,
        status: 'finished',
        kickoff_at: fotmobData.kickoffAt ?? undefined,
      })
      .eq('id', match.id)

    if (updateError) {
      errors.push(`Failed to update match ${fotmobId}: ${updateError.message}`)
      continue
    }

    // Find MVP: player with highest rating (non-null)
    const ranked = [...fotmobData.stats]
      .filter((s) => s.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    const mvpFotmobId = ranked[0]?.fotmob_id ?? null

    // Upsert fm_player_match_stats for each matched player
    const statsRows = []
    for (const s of fotmobData.stats) {
      const player = playerByFotmobId.get(s.fotmob_id)
      if (!player) continue // player not in competition roster

      statsRows.push({
        real_match_id: match.id,
        player_id: player.id,
        minutes_played: s.minutes_played,
        rating: s.rating,
        goals: s.goals_scored,
        assists: s.assists,
        yellow_cards: s.fouls_committed > 0 ? 0 : 0, // FotMob doesn't surface cards directly in stats; use events
        red_cards: 0,
        penalties_saved: s.saves > 0 ? 0 : 0, // approximated; penalties_saved not in FotMob stat keys
        penalties_missed: 0,
        own_goals: s.goals_scored > 0 ? 0 : 0, // own_goal flag from events, not stats
        clean_sheet: false,
        goals_conceded: s.goals_conceded,
        is_mvp: s.fotmob_id === mvpFotmobId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw_payload: s as any,
      })
    }

    // Extract cards and own goals from events
    const cardsByPlayerId = new Map<number, { yellow: number; red: number }>()
    const ownGoalsByPlayerId = new Map<number, number>()
    const penaltySavedByPlayerId = new Map<number, number>()
    const penaltyMissedByPlayerId = new Map<number, number>()

    for (const ev of fotmobData.events) {
      if (ev.player_id == null) continue
      if (ev.card === 'Yellow') {
        const c = cardsByPlayerId.get(ev.player_id) ?? { yellow: 0, red: 0 }
        cardsByPlayerId.set(ev.player_id, { ...c, yellow: c.yellow + 1 })
      } else if (ev.card === 'Red' || ev.card === 'YellowRed') {
        const c = cardsByPlayerId.get(ev.player_id) ?? { yellow: 0, red: 0 }
        cardsByPlayerId.set(ev.player_id, { ...c, red: c.red + 1 })
      }
      if (ev.own_goal) {
        ownGoalsByPlayerId.set(ev.player_id, (ownGoalsByPlayerId.get(ev.player_id) ?? 0) + 1)
      }
      if (ev.goal_description === 'PenaltySaved') {
        // The player who saved it — but FotMob event attributes this to the kicker or keeper?
        // FotMob events attribute PenaltySaved to the shooter (missed). We handle it via goal_description.
        penaltyMissedByPlayerId.set(ev.player_id, (penaltyMissedByPlayerId.get(ev.player_id) ?? 0) + 1)
      }
    }

    // Merge event data back into stats rows
    const enriched = statsRows.map((row) => {
      const stat = fotmobData.stats.find((s) => {
        const p = playerByFotmobId.get(s.fotmob_id)
        return p?.id === row.player_id
      })
      if (!stat) return row
      const cards = cardsByPlayerId.get(stat.fotmob_id) ?? { yellow: 0, red: 0 }
      return {
        ...row,
        yellow_cards: cards.yellow,
        red_cards: cards.red,
        own_goals: ownGoalsByPlayerId.get(stat.fotmob_id) ?? 0,
        penalties_missed: penaltyMissedByPlayerId.get(stat.fotmob_id) ?? 0,
        penalties_saved: penaltySavedByPlayerId.get(stat.fotmob_id) ?? 0,
      }
    })

    if (enriched.length > 0) {
      const { error: upsertError } = await supabase
        .from('fm_player_match_stats')
        .upsert(enriched, { onConflict: 'real_match_id,player_id' })

      if (upsertError) {
        errors.push(`Stats upsert failed for match ${fotmobId}: ${upsertError.message}`)
      } else {
        playersUpserted += enriched.length
      }
    }

    matchesProcessed++
  }

  // Audit log
  await supabase.from('fm_audit_log').insert({
    competition_id: null,
    action: 'ratings_ingest',
    entity_type: 'fm_scoring_round',
    entity_id: roundId,
    payload: { matchesProcessed, playersUpserted, errors },
  })

  return NextResponse.json({ matchesProcessed, playersUpserted, errors })
}
