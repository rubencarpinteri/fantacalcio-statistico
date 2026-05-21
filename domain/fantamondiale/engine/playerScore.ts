// ============================================================
// FantaMondiale — Player score (engine v3.0 "Pivot + Bonus")
// ============================================================
// Aligned 1:1 with the Serie A engine for the rating → voto_base
// step (same pivot anchors, same < 15 min gate with decisive-
// event exception, same 1–10 clamp).
//
// FM-specific layers (football B/M, MVP bonus brackets, popularity
// penalty brackets, calc_order) apply on top of voto_base to
// produce raw_subtotal and final_score.
// ============================================================

import type { FMCompetitionConfig, FMBracket, FMEngineConfig } from '@/domain/fantamondiale/config/schema'
import type { FMEnginePlayerInput, FMPlayerMatchScoreResult } from './types'

function findBracket(brackets: FMBracket[], pct: number): FMBracket | null {
  return brackets.find((b) => pct >= b.min_pct && pct <= b.max_pct) ?? null
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function deriveSlope(engine: FMEngineConfig): number {
  const denom = engine.voto_max - engine.pivot_rating
  if (denom <= 0) return 1
  return (engine.voto_max - engine.pivot_vote) / denom
}

function hasDecisiveEvent(stats: FMEnginePlayerInput['stats']): boolean {
  return (
    stats.goals           > 0 ||
    stats.assists         > 0 ||
    stats.own_goals       > 0 ||
    stats.yellow_cards    > 0 ||
    stats.red_cards       > 0 ||
    stats.penalties_saved > 0 ||
    stats.penalties_missed > 0
  )
}

function computeCleanSheet(input: FMEnginePlayerInput, minMinutes: number): boolean {
  const { stats, nationalTeamId, matchContext } = input
  if (stats.minutes_played < minMinutes) return false

  const isHome = nationalTeamId === matchContext.home_team_id
  const isAway = nationalTeamId === matchContext.away_team_id
  if (!isHome && !isAway) return false

  const conceded = isHome ? matchContext.away_score : matchContext.home_score
  return conceded === 0
}

export function scorePlayer(
  input: FMEnginePlayerInput,
  config: FMCompetitionConfig,
): FMPlayerMatchScoreResult {
  const { engine, football, calc_order, mvp_bonus_brackets, popularity_brackets } = config
  const { stats, role, matchContext, ownershipPct } = input

  // ---- voto_base (pivot formula + minutes gate) --------------------------
  let voto_base: number | null = null

  const decisive = hasDecisiveEvent(stats)
  const playedEnough = stats.minutes_played >= engine.minutes_min_for_voto

  if (playedEnough) {
    if (stats.rating != null) {
      const slope = deriveSlope(engine)
      const raw = engine.pivot_vote + slope * (stats.rating - engine.pivot_rating)
      voto_base = clamp(raw, engine.voto_min, engine.voto_max)
    } else {
      // No SportMonks rating yet (e.g. mid-match): use baseline.
      voto_base = engine.base_score
    }
  } else if (decisive) {
    // <15 min but a decisive event fired: B/M-only with baseline voto.
    voto_base = engine.base_score
  }
  // else: s.v. — voto_base stays null and no B/M is added.

  // ---- football bonuses --------------------------------------------------
  let football_bonus = 0
  let football_malus = 0

  const isGk = role === 'P'
  const isDef = role === 'D'

  // B/M applies whenever voto_base was computed (either normal path or
  // exception path). For pure s.v. (voto_base === null), B/M is skipped.
  if (voto_base !== null) {
    const cleanSheet = computeCleanSheet(input, football.clean_sheet.min_minutes)

    football_bonus += stats.goals * football.goal[role]
    if (stats.goals >= 3) football_bonus += football.hat_trick_bonus
    else if (stats.goals >= 2) football_bonus += football.brace_bonus

    football_bonus += stats.assists * football.assist

    if (isGk && cleanSheet) football_bonus += football.clean_sheet.P
    else if (isDef && cleanSheet) football_bonus += football.clean_sheet.D

    if (isGk) {
      football_bonus += stats.penalties_saved * football.penalty_saved
      football_malus += Math.abs(stats.goals_conceded * football.goal_conceded_P)
    }

    football_malus += Math.abs(stats.yellow_cards * football.yellow_card)
    football_malus += Math.abs(stats.red_cards * football.red_card)
    football_malus += Math.abs(stats.own_goals * football.own_goal)
    football_malus += Math.abs(stats.penalties_missed * football.penalty_missed)
  }

  // ---- raw subtotal ------------------------------------------------------
  const raw_subtotal = (voto_base ?? 0) + football_bonus - football_malus

  // ---- MVP bonus + popularity penalty (FM-specific) ---------------------
  const mvp_bonus_pct = stats.is_mvp
    ? (findBracket(mvp_bonus_brackets, ownershipPct)?.pct ?? 0)
    : 0
  const mvp_bonus_amount = (raw_subtotal * mvp_bonus_pct) / 100

  const popularity_penalty_pct = findBracket(popularity_brackets, ownershipPct)?.pct ?? 0
  const popularity_penalty_amount = (raw_subtotal * popularity_penalty_pct) / 100

  let final_score: number
  if (calc_order === 'mvp_then_penalty') {
    final_score = raw_subtotal + mvp_bonus_amount - popularity_penalty_amount
  } else {
    const after_penalty = raw_subtotal - popularity_penalty_amount
    final_score = after_penalty + mvp_bonus_amount
  }

  return {
    scoring_round_id: matchContext.scoring_round_id,
    real_match_id: matchContext.real_match_id,
    player_id: input.playerId,
    base_rating: stats.rating,
    z_rating: null, // legacy column — engine v3.0 does not compute a z-score
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

/**
 * Public helper for the config editor's live preview.
 * Equivalent to the Serie A `ratingToVotoBase` — keeps the
 * preview math in lock-step with the engine.
 */
export function ratingToVotoBase(rating: number, engine: FMEngineConfig): number {
  const slope = deriveSlope(engine)
  const raw = engine.pivot_vote + slope * (rating - engine.pivot_rating)
  return clamp(raw, engine.voto_min, engine.voto_max)
}
