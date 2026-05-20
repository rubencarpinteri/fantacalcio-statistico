import type { FMCompetitionConfig, FMBracket } from '@/domain/fantamondiale/config/schema'
import type { FMEnginePlayerInput, FMPlayerMatchScoreResult } from './types'

function findBracket(brackets: FMBracket[], pct: number): FMBracket | null {
  return brackets.find((b) => pct >= b.min_pct && pct <= b.max_pct) ?? null
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function computeCleanSheet(input: FMEnginePlayerInput, minMinutes: number): boolean {
  const { stats, nationalTeamId, matchContext } = input
  if (stats.minutes_played < minMinutes) return false

  const isHome = nationalTeamId === matchContext.home_team_id
  const isAway = nationalTeamId === matchContext.away_team_id
  if (!isHome && !isAway) return false

  // goals conceded by this player's team
  const conceded = isHome ? matchContext.away_score : matchContext.home_score
  return conceded === 0
}

export function scorePlayer(
  input: FMEnginePlayerInput,
  config: FMCompetitionConfig,
): FMPlayerMatchScoreResult {
  const { engine, football, calc_order, mvp_bonus_brackets, popularity_brackets } = config
  const { stats, role, matchContext, ownershipPct } = input

  // ---- z-score + voto_base ------------------------------------------------
  let z_rating: number | null = null
  let voto_base: number | null = null

  if (stats.rating != null && stats.minutes_played > 0) {
    z_rating = (stats.rating - engine.rating_mean) / engine.rating_std

    const minutesFactor =
      stats.minutes_played >= engine.minutes_threshold
        ? engine.minutes_full
        : engine.minutes_partial

    const b0 = engine.target_mean_vote + engine.target_vote_std * z_rating * minutesFactor
    const b1 =
      engine.target_mean_vote + engine.role_multiplier[role] * (b0 - engine.target_mean_vote)
    voto_base = clamp(b1, engine.voto_base_min, engine.voto_base_max)
  }

  // ---- football bonuses ---------------------------------------------------
  let football_bonus = 0
  let football_malus = 0

  const isGk = role === 'P'
  const isDef = role === 'D'
  const played = stats.minutes_played > 0
  const cleanSheet = played
    ? computeCleanSheet(input, football.clean_sheet.min_minutes)
    : false

  if (played) {
    // goals
    football_bonus += stats.goals * football.goal[role]
    // brace / hat-trick
    if (stats.goals >= 3) football_bonus += football.hat_trick_bonus
    else if (stats.goals >= 2) football_bonus += football.brace_bonus

    // assists
    football_bonus += stats.assists * football.assist

    // clean sheet
    if (isGk && cleanSheet) football_bonus += football.clean_sheet.P
    else if (isDef && cleanSheet) football_bonus += football.clean_sheet.D

    // goalkeeper-specific
    if (isGk) {
      football_bonus += stats.penalties_saved * football.penalty_saved
      football_malus += Math.abs(stats.goals_conceded * football.goal_conceded_P)
    }

    // discipline (malus stored as negative values in config, we store the absolute)
    football_malus += Math.abs(stats.yellow_cards * football.yellow_card)
    football_malus += Math.abs(stats.red_cards * football.red_card)
    football_malus += Math.abs(stats.own_goals * football.own_goal)

    // penalty missed (can be any role)
    football_malus += Math.abs(stats.penalties_missed * football.penalty_missed)
  }

  // ---- raw subtotal -------------------------------------------------------
  const raw_subtotal = (voto_base ?? 0) + football_bonus - football_malus

  // ---- MVP bonus ----------------------------------------------------------
  const mvp_bonus_pct = stats.is_mvp
    ? (findBracket(mvp_bonus_brackets, ownershipPct)?.pct ?? 0)
    : 0
  const mvp_bonus_amount = (raw_subtotal * mvp_bonus_pct) / 100

  // ---- popularity penalty -------------------------------------------------
  const popularity_penalty_pct = findBracket(popularity_brackets, ownershipPct)?.pct ?? 0
  const popularity_penalty_amount = (raw_subtotal * popularity_penalty_pct) / 100

  // ---- final score (respects calc_order) ----------------------------------
  let final_score: number
  if (calc_order === 'mvp_then_penalty') {
    final_score = raw_subtotal + mvp_bonus_amount - popularity_penalty_amount
  } else {
    // penalty_then_mvp: penalty first on raw_subtotal, mvp on reduced
    const after_penalty = raw_subtotal - popularity_penalty_amount
    final_score = after_penalty + mvp_bonus_amount
  }

  return {
    scoring_round_id: matchContext.scoring_round_id,
    real_match_id: matchContext.real_match_id,
    player_id: input.playerId,
    base_rating: stats.rating,
    z_rating,
    voto_base,
    football_bonus,
    football_malus,
    raw_subtotal,
    ownership_pct: ownershipPct,
    mvp_bonus_pct,
    mvp_bonus_amount,
    popularity_penalty_pct,
    popularity_penalty_amount,
    final_score,
    calc_snapshot: config,
  }
}
