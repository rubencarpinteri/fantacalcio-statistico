import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import { scorePlayer } from './playerScore'
import { scoreCoach } from './coachScore'
import { aggregateTeamRoundScore } from './roundScore'
import { computeBattleRoyale } from './battleRoyale'
import type { FMEnginePlayerInput, FMEngineCoachInput } from './types'

type Supabase = SupabaseClient<Database>

// ============================================================
// Main entry point — called from the admin scoring action.
// Runs the full pipeline for one scoring round:
//   1. Score players  → fm_player_match_score
//   2. Score coaches  → fm_coach_match_score
//   3. Aggregate teams → fm_fantasy_team_round_score
//   4. Battle Royale  → fm_battle_royale_matchup
//   5. Update BR cols on fm_fantasy_team_round_score
//   6. Recompute standings → fm_competition_standing
// ============================================================

export type RoundEngineResult = {
  teamsScored: number
  playerScoresWritten: number
  coachScoresWritten: number
  brMatchupsWritten: number
}

export async function runRoundEngine(roundId: string, supabase: Supabase): Promise<RoundEngineResult> {
  // ---- 1. Load round metadata ----------------------------------------
  const { data: round, error: roundErr } = await supabase
    .from('fm_scoring_round')
    .select('id, phase_id, competition_id')
    .eq('id', roundId)
    .single()
  if (roundErr || !round) throw new Error(`Round not found: ${roundErr?.message}`)

  // ---- 2. Load and parse config ----------------------------------------
  const { data: configRow, error: configErr } = await supabase
    .from('fm_competition_config')
    .select('config')
    .eq('competition_id', round.competition_id)
    .single()
  if (configErr || !configRow) throw new Error(`Config not found: ${configErr?.message}`)
  const config = fmCompetitionConfigSchema.parse(configRow.config)

  // ---- 3. Load real matches for this round -----------------------------
  const { data: matches, error: matchErr } = await supabase
    .from('fm_real_match')
    .select('id, home_team_id, away_team_id, home_score, away_score')
    .eq('scoring_round_id', roundId)
  if (matchErr) throw new Error(`Matches load failed: ${matchErr.message}`)
  if (!matches || matches.length === 0) throw new Error('No real matches found for this round')

  const matchIds = matches.map((m) => m.id)

  // map national_team_id → match (a team plays at most one match per round)
  const matchByTeamId = new Map<string, (typeof matches)[0]>()
  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) {
      throw new Error(`Match ${m.id} has no result yet — enter scores before running the engine`)
    }
    matchByTeamId.set(m.home_team_id, m)
    matchByTeamId.set(m.away_team_id, m)
  }

  // ---- 4. Load submitted lineups with starters --------------------------
  const { data: lineups, error: lineupErr } = await supabase
    .from('fm_matchday_lineup')
    .select('id, fantasy_team_id, fm_matchday_lineup_player(player_id, is_starter)')
    .eq('scoring_round_id', roundId)
    .not('submitted_at', 'is', null)
  if (lineupErr) throw new Error(`Lineups load failed: ${lineupErr.message}`)
  if (!lineups || lineups.length === 0) throw new Error('No submitted lineups found for this round')

  // ---- 5. Load player details ------------------------------------------
  const allPlayerIds = [
    ...new Set(
      lineups.flatMap((l) =>
        l.fm_matchday_lineup_player.filter((p) => p.is_starter).map((p) => p.player_id)
      )
    ),
  ]
  const { data: players, error: playerErr } = await supabase
    .from('fm_player')
    .select('id, role, national_team_id')
    .in('id', allPlayerIds)
  if (playerErr) throw new Error(`Players load failed: ${playerErr.message}`)

  const playerById = new Map((players ?? []).map((p) => [p.id, p]))

  // ---- 6. Load player match stats --------------------------------------
  const { data: allStats, error: statsErr } = await supabase
    .from('fm_player_match_stats')
    .select(
      'real_match_id, player_id, minutes_played, rating, goals, penalties_scored, assists, yellow_cards, red_cards, penalties_saved, penalties_missed, own_goals, goals_conceded, is_mvp'
    )
    .in('real_match_id', matchIds)
  if (statsErr) throw new Error(`Stats load failed: ${statsErr.message}`)

  // key: "playerId:matchId"
  const statsByKey = new Map((allStats ?? []).map((s) => [`${s.player_id}:${s.real_match_id}`, s]))

  // ---- 7. Load ownership snapshot --------------------------------------
  const { data: ownership, error: ownerErr } = await supabase
    .from('fm_round_player_ownership')
    .select('player_id, ownership_pct')
    .eq('scoring_round_id', roundId)
  if (ownerErr) throw new Error(`Ownership load failed: ${ownerErr.message}`)

  const ownershipByPlayerId = new Map(
    (ownership ?? []).map((o) => [o.player_id, Number(o.ownership_pct)])
  )

  // ---- 8. Load phase squads (coach per team) ----------------------------
  const { data: phaseSquads, error: squadErr } = await supabase
    .from('fm_phase_squad')
    .select('fantasy_team_id, coach_id')
    .eq('phase_id', round.phase_id)
  if (squadErr) throw new Error(`Phase squads load failed: ${squadErr.message}`)

  const coachIdByTeamId = new Map(
    (phaseSquads ?? [])
      .filter((s): s is typeof s & { coach_id: string } => s.coach_id != null)
      .map((s) => [s.fantasy_team_id, s.coach_id])
  )

  // ---- 9. Load coaches + their tiers ------------------------------------
  const uniqueCoachIds = [...new Set(coachIdByTeamId.values())]

  const { data: coaches, error: coachErr } = await supabase
    .from('fm_coach')
    .select('id, national_team_id')
    .in('id', uniqueCoachIds)
  if (coachErr) throw new Error(`Coaches load failed: ${coachErr.message}`)

  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]))

  const { data: coachTiers, error: tierErr } = await supabase
    .from('fm_phase_coach_tier')
    .select('coach_id, tier')
    .eq('phase_id', round.phase_id)
    .in('coach_id', uniqueCoachIds)
  if (tierErr) throw new Error(`Coach tiers load failed: ${tierErr.message}`)

  const tierByCoachId = new Map(
    (coachTiers ?? []).map((ct) => [ct.coach_id, ct.tier as FMEngineCoachInput['tier']])
  )

  // ============================================================
  // COMPUTE — PLAYER SCORES
  // ============================================================

  // key: "playerId:matchId" → computed result (deduplicated across teams)
  const playerScoreByKey = new Map<string, ReturnType<typeof scorePlayer>>()

  for (const lineup of lineups) {
    for (const lp of lineup.fm_matchday_lineup_player) {
      if (!lp.is_starter) continue

      const player = playerById.get(lp.player_id)
      if (!player) continue

      const match = matchByTeamId.get(player.national_team_id)
      if (!match) continue // team not playing this round

      const scoreKey = `${lp.player_id}:${match.id}`
      if (playerScoreByKey.has(scoreKey)) continue // already computed

      const stats = statsByKey.get(scoreKey)
      if (!stats) continue // no ingest data for this player

      const input: FMEnginePlayerInput = {
        playerId: lp.player_id,
        role: player.role as FMEnginePlayerInput['role'],
        nationalTeamId: player.national_team_id,
        stats: {
          minutes_played: stats.minutes_played,
          rating: stats.rating != null ? Number(stats.rating) : null,
          goals: stats.goals,
          penalties_scored: stats.penalties_scored ?? 0,
          assists: stats.assists,
          yellow_cards: stats.yellow_cards,
          red_cards: stats.red_cards,
          penalties_saved: stats.penalties_saved,
          penalties_missed: stats.penalties_missed,
          own_goals: stats.own_goals,
          goals_conceded: stats.goals_conceded,
          is_mvp: stats.is_mvp,
        },
        matchContext: {
          real_match_id: match.id,
          scoring_round_id: roundId,
          home_team_id: match.home_team_id,
          away_team_id: match.away_team_id,
          home_score: match.home_score!,
          away_score: match.away_score!,
        },
        ownershipPct: ownershipByPlayerId.get(lp.player_id) ?? 0,
      }

      playerScoreByKey.set(scoreKey, scorePlayer(input, config))
    }
  }

  // Upsert fm_player_match_score
  const playerScoreRows = [...playerScoreByKey.values()].map((r) => ({
    scoring_round_id: r.scoring_round_id,
    real_match_id: r.real_match_id,
    player_id: r.player_id,
    base_rating: r.base_rating,
    z_rating: r.z_rating,
    voto_base: r.voto_base,
    football_bonus: r.football_bonus,
    football_malus: r.football_malus,
    raw_subtotal: r.raw_subtotal,
    ownership_pct: r.ownership_pct,
    mvp_bonus_pct: r.mvp_bonus_pct,
    mvp_bonus_amount: r.mvp_bonus_amount,
    popularity_penalty_pct: r.popularity_penalty_pct,
    popularity_penalty_amount: r.popularity_penalty_amount,
    final_score: r.final_score,
    calc_snapshot: r.calc_snapshot as unknown as Json,
  }))

  if (playerScoreRows.length > 0) {
    const { error } = await supabase
      .from('fm_player_match_score')
      .upsert(playerScoreRows, { onConflict: 'scoring_round_id,player_id,real_match_id' })
    if (error) throw new Error(`Player score upsert failed: ${error.message}`)
  }

  // ============================================================
  // COMPUTE — COACH SCORES
  // ============================================================

  const coachScoreRows: {
    scoring_round_id: string
    real_match_id: string
    coach_id: string
    team_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'
    match_result: 'home_win' | 'draw' | 'away_win'
    bonus_or_malus: number
    final_score: number
    calc_snapshot: Json
  }[] = []

  for (const coachId of uniqueCoachIds) {
    const coach = coachById.get(coachId)
    if (!coach) continue

    const tier = tierByCoachId.get(coachId)
    if (!tier) continue

    const match = matchByTeamId.get(coach.national_team_id)
    if (!match) continue // coach's team not in this round

    const input: FMEngineCoachInput = {
      coachId,
      nationalTeamId: coach.national_team_id,
      tier,
      matchContext: {
        real_match_id: match.id,
        scoring_round_id: roundId,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_score: match.home_score!,
        away_score: match.away_score!,
      },
    }

    const result = scoreCoach(input, config)
    if (!result) continue

    coachScoreRows.push({
      scoring_round_id: result.scoring_round_id,
      real_match_id: result.real_match_id,
      coach_id: result.coach_id,
      team_tier: result.team_tier,
      match_result: result.match_result,
      bonus_or_malus: result.bonus_or_malus,
      final_score: result.final_score,
      calc_snapshot: result.calc_snapshot as unknown as Json,
    })
  }

  if (coachScoreRows.length > 0) {
    const { error } = await supabase
      .from('fm_coach_match_score')
      .upsert(coachScoreRows, { onConflict: 'real_match_id,coach_id' })
    if (error) throw new Error(`Coach score upsert failed: ${error.message}`)
  }

  // Build coach total score per coachId (sum across all their matches in this round)
  const coachTotalByCoachId = new Map<string, number>()
  for (const row of coachScoreRows) {
    coachTotalByCoachId.set(
      row.coach_id,
      (coachTotalByCoachId.get(row.coach_id) ?? 0) + row.final_score
    )
  }

  // ============================================================
  // COMPUTE — TEAM ROUND SCORES
  // ============================================================

  // Fetch all fantasy teams now (reused for zero-score padding and standings)
  const { data: allTeams, error: teamsErr } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('competition_id', round.competition_id)
  if (teamsErr) throw new Error(`Teams load failed: ${teamsErr.message}`)

  const teamScores: ReturnType<typeof aggregateTeamRoundScore>[] = lineups.map((lineup) => {
    const starters = lineup.fm_matchday_lineup_player.filter((p) => p.is_starter)

    const playerFinalScores = starters.flatMap((lp) => {
      const player = playerById.get(lp.player_id)
      if (!player) return []
      const match = matchByTeamId.get(player.national_team_id)
      if (!match) return []
      const result = playerScoreByKey.get(`${lp.player_id}:${match.id}`)
      return result ? [result.final_score] : []
    })

    const coachId = coachIdByTeamId.get(lineup.fantasy_team_id)
    const coachFinalScore = coachId ? (coachTotalByCoachId.get(coachId) ?? 0) : 0

    return aggregateTeamRoundScore({
      scoringRoundId: roundId,
      fantasyTeamId: lineup.fantasy_team_id,
      playerFinalScores,
      coachFinalScore,
      config,
    })
  })

  // Pad zero-score entries for teams that didn't submit a lineup
  const submittedTeamIds = new Set(lineups.map((l) => l.fantasy_team_id))
  for (const team of allTeams ?? []) {
    if (!submittedTeamIds.has(team.id)) {
      teamScores.push(
        aggregateTeamRoundScore({
          scoringRoundId: roundId,
          fantasyTeamId: team.id,
          playerFinalScores: [],
          coachFinalScore: 0,
          config,
        })
      )
    }
  }

  const teamScoreRows = teamScores.map((ts) => ({
    scoring_round_id: ts.scoring_round_id,
    fantasy_team_id: ts.fantasy_team_id,
    player_total: ts.player_total,
    coach_total: ts.coach_total,
    raw_total: ts.raw_total,
    goals_scored: ts.goals_scored,
    // BR columns filled in next step
    br_wins: 0,
    br_draws: 0,
    br_losses: 0,
    br_points: 0,
  }))

  if (teamScoreRows.length > 0) {
    const { error } = await supabase
      .from('fm_fantasy_team_round_score')
      .upsert(teamScoreRows, { onConflict: 'scoring_round_id,fantasy_team_id' })
    if (error) throw new Error(`Team score upsert failed: ${error.message}`)
  }

  // ============================================================
  // COMPUTE — BATTLE ROYALE
  // ============================================================

  const matchups = computeBattleRoyale(teamScores, roundId, config)

  const matchupRows = matchups.map((m) => ({
    scoring_round_id: m.scoring_round_id,
    team_a_id: m.team_a_id,
    team_b_id: m.team_b_id,
    team_a_score: m.team_a_score,
    team_b_score: m.team_b_score,
    team_a_goals: m.team_a_goals,
    team_b_goals: m.team_b_goals,
    result: m.result,
    team_a_points: m.team_a_points,
    team_b_points: m.team_b_points,
  }))

  if (matchupRows.length > 0) {
    const { error } = await supabase
      .from('fm_battle_royale_matchup')
      .upsert(matchupRows, { onConflict: 'scoring_round_id,team_a_id,team_b_id' })
    if (error) throw new Error(`BR matchup upsert failed: ${error.message}`)
  }

  // ---- Tally BR results per team for this round -----------------------
  const brByTeam = new Map<
    string,
    { br_wins: number; br_draws: number; br_losses: number; br_points: number }
  >()

  const ensureBr = (teamId: string) => {
    if (!brByTeam.has(teamId)) {
      brByTeam.set(teamId, { br_wins: 0, br_draws: 0, br_losses: 0, br_points: 0 })
    }
    return brByTeam.get(teamId)!
  }

  for (const m of matchups) {
    const a = ensureBr(m.team_a_id)
    const b = ensureBr(m.team_b_id)
    a.br_points += m.team_a_points
    b.br_points += m.team_b_points
    if (m.result === 'home_win') {
      a.br_wins += 1
      b.br_losses += 1
    } else if (m.result === 'away_win') {
      a.br_losses += 1
      b.br_wins += 1
    } else {
      a.br_draws += 1
      b.br_draws += 1
    }
  }

  // Update fm_fantasy_team_round_score with BR results
  for (const [fantasyTeamId, br] of brByTeam) {
    const { error } = await supabase
      .from('fm_fantasy_team_round_score')
      .update(br)
      .eq('scoring_round_id', roundId)
      .eq('fantasy_team_id', fantasyTeamId)
    if (error) throw new Error(`BR update failed for team ${fantasyTeamId}: ${error.message}`)
  }

  // ============================================================
  // COMPUTE — STANDINGS (full recompute from all scored rounds)
  // ============================================================

  // Collect all scored round IDs for this competition
  const { data: scoredRounds, error: roundsErr } = await supabase
    .from('fm_scoring_round')
    .select('id')
    .eq('competition_id', round.competition_id)
    .in('status', ['scoring', 'published'])
  if (roundsErr) throw new Error(`Scored rounds load failed: ${roundsErr.message}`)

  const scoredRoundIds = (scoredRounds ?? []).map((r) => r.id)
  if (!scoredRoundIds.includes(roundId)) scoredRoundIds.push(roundId)

  // Fetch all team round scores for the competition
  const { data: allTeamRoundScores, error: allTsErr } = await supabase
    .from('fm_fantasy_team_round_score')
    .select('fantasy_team_id, raw_total, br_wins, br_draws, br_losses, br_points')
    .in('scoring_round_id', scoredRoundIds)
  if (allTsErr) throw new Error(`All team round scores load failed: ${allTsErr.message}`)

  // Aggregate per team
  type StandingAgg = {
    br_points_total: number
    raw_score_total: number
    round_wins: number
    best_round_score: number
  }

  const aggByTeam = new Map<string, StandingAgg>()

  for (const team of allTeams ?? []) {
    aggByTeam.set(team.id, {
      br_points_total: 0,
      raw_score_total: 0,
      round_wins: 0,
      best_round_score: 0,
    })
  }

  for (const ts of allTeamRoundScores ?? []) {
    const agg = aggByTeam.get(ts.fantasy_team_id)
    if (!agg) continue
    const rawTotal = Number(ts.raw_total)
    agg.br_points_total += ts.br_points
    agg.raw_score_total += rawTotal
    agg.round_wins += ts.br_wins
    agg.best_round_score = Math.max(agg.best_round_score, rawTotal)
  }

  // Rank teams by br_points_total desc, then raw_score_total desc
  const ranked = [...aggByTeam.entries()].sort(([, a], [, b]) => {
    if (b.br_points_total !== a.br_points_total) return b.br_points_total - a.br_points_total
    return b.raw_score_total - a.raw_score_total
  })

  const standingRows = ranked.map(([fantasyTeamId, agg], idx) => ({
    competition_id: round.competition_id,
    fantasy_team_id: fantasyTeamId,
    br_points_total: agg.br_points_total,
    raw_score_total: agg.raw_score_total,
    round_wins: agg.round_wins,
    best_round_score: agg.best_round_score,
    rank: idx + 1,
    computed_at: new Date().toISOString(),
  }))

  if (standingRows.length > 0) {
    const { error } = await supabase
      .from('fm_competition_standing')
      .upsert(standingRows, { onConflict: 'competition_id,fantasy_team_id' })
    if (error) throw new Error(`Standing upsert failed: ${error.message}`)
  }

  return {
    teamsScored: teamScores.length,
    playerScoresWritten: playerScoreRows.length,
    coachScoresWritten: coachScoreRows.length,
    brMatchupsWritten: matchupRows.length,
  }
}
