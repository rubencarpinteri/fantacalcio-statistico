// ============================================================
// Fantacalcio Statistico — Rating Engine v3.0 — Core Logic
// ============================================================
// Pure TypeScript — no Supabase, no Next.js, no side effects.
// All functions are deterministic given the same inputs.
//
// "Pivot + Bonus" pipeline (per player):
//
//   1. Minutes gate — < minutes_min_for_voto (default 15):
//        a) No decisive event → "s.v." (NV, skipped entirely)
//        b) Decisive event   → voto_base = base_score (6.0), B/M only
//
//   2. No rating yet (live-match exception):
//        voto_base = base_score (6.0), B/M only
//
//   3. Normal path:
//        voto_base = pivot_vote + slope × (rating − pivot_rating)
//        clamped to [voto_min, voto_max].
//
//   4. fantavoto = clamp(voto_base + Σ bonus/malus, voto_min, voto_max)
//
// With default anchors (6.50 → 6.00, slope ≈ 1.1429):
//   rating 6.45 (mode) → voto_base ≈ 5.94
//   rating 6.50 (base) → voto_base   = 6.00
//   rating 6.72 (mean) → voto_base ≈ 6.25
//   rating 7.50        → voto_base ≈ 7.14
//   rating 9.00        → voto_base ≈ 8.86
// ============================================================

import { DEFAULT_ENGINE_CONFIG, deriveSlope } from './config'
import type {
  EngineConfig,
  EnginePlayerInput,
  PlayerEngineOutput,
  PlayerCalculationResult,
  PlayerSkipped,
  BonusMalusItem,
  MatchdayEngineResult,
} from './types'

// ---- Numeric helpers ----------------------------------------

function round(value: number, dp = 3): number {
  const factor = Math.pow(10, dp)
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ---- Decisive-event check -----------------------------------

function hasDecisiveEvent(input: EnginePlayerInput): boolean {
  return (
    input.goals_scored     > 0 ||
    input.assists          > 0 ||
    input.own_goals        > 0 ||
    input.yellow_cards     > 0 ||
    input.red_cards        > 0 ||
    input.penalties_scored > 0 ||
    input.penalties_missed > 0 ||
    input.penalties_saved  > 0
  )
}

// ---- Bonus / malus ------------------------------------------

function computeBonusMalus(
  input: EnginePlayerInput,
  config: EngineConfig
): { breakdown: BonusMalusItem[]; total: number } {
  const bm = config.bonus_malus
  const rc = input.rating_class
  const breakdown: BonusMalusItem[] = []

  const add = (label: string, quantity: number, points_each: number) => {
    if (quantity === 0) return
    breakdown.push({ label, quantity, points_each, total: round(quantity * points_each) })
  }

  // ---- Goals ----
  const goalBonus = bm.goal_by_role[rc]
  const penGoalBonus = round(goalBonus - bm.penalty_scored_discount)
  const regularGoals = Math.max(0, input.goals_scored - input.penalties_scored)

  add('Gol', regularGoals, goalBonus)
  add('Gol (rigore)', input.penalties_scored, penGoalBonus)

  if (input.goals_scored >= 3) {
    add('Hat-trick', 1, bm.hat_trick_bonus)
  } else if (input.goals_scored === 2) {
    add('Doppietta', 1, bm.brace_bonus)
  }

  // ---- Other events ----
  add('Assist', input.assists, bm.assist)
  add('Autogol', input.own_goals, bm.own_goal)
  add('Giallo', input.yellow_cards, bm.yellow_card)
  add('Rosso', input.red_cards, bm.red_card)
  add('Rigore sbagliato', input.penalties_missed, bm.penalty_missed)

  if (rc === 'GK') {
    add('Rigore parato', input.penalties_saved, bm.penalty_saved)
  }

  // ---- Clean sheet ----
  const csBonus = bm.clean_sheet_by_role[rc]
  if (
    csBonus !== undefined &&
    input.clean_sheet &&
    input.minutes_played >= bm.clean_sheet_min_minutes
  ) {
    add('Porta inviolata', 1, csBonus)
  }

  // ---- Goals conceded ----
  if (input.goals_conceded > 0) {
    const gcMalus = bm.goals_conceded_by_role[rc]
    if (gcMalus !== undefined) {
      const gcApplies =
        rc === 'GK' ||
        (rc === 'DEF' && input.minutes_played >= bm.goals_conceded_def_min_minutes)
      if (gcApplies) {
        add('Gol subiti', input.goals_conceded, gcMalus)
      }
    }
  }

  const total = round(breakdown.reduce((acc, b) => acc + b.total, 0))
  return { breakdown, total }
}

// ---- Pivot formula ------------------------------------------

/**
 * voto_base = pivot_vote + slope × (rating − pivot_rating), clamped to [voto_min, voto_max].
 *
 * Exported so the methodology page and the engine-config preview can
 * compute the conversion table without re-running the full pipeline.
 */
export function ratingToVotoBase(rating: number, config: EngineConfig = DEFAULT_ENGINE_CONFIG): number {
  const slope = deriveSlope(config)
  const raw = config.pivot_vote + slope * (rating - config.pivot_rating)
  return round(clamp(raw, config.voto_min, config.voto_max))
}

// ---- Per-player entry point ---------------------------------

export function calculatePlayerScore(
  input: EnginePlayerInput,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): PlayerEngineOutput {
  const { player_id, stats_id, is_provisional } = input

  // ----------------------------------------------------------------
  // Gate 1 — below minutes_min_for_voto (default 15).
  // ----------------------------------------------------------------
  if (input.minutes_played < config.minutes_min_for_voto) {
    if (!hasDecisiveEvent(input)) {
      const skipped: PlayerSkipped = {
        kind: 'skipped', player_id, stats_id, is_provisional, reason: 'NV',
      }
      return skipped
    }

    // Decisive-event exception: voto_base = 6.0, B/M only
    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const fantavoto = round(clamp(config.base_score + bmTotal, config.voto_min, config.voto_max))

    const result: PlayerCalculationResult = {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: true,
      no_ratings_exception: false,
      voto_base: config.base_score,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      fantavoto,
    }
    return result
  }

  // ----------------------------------------------------------------
  // Gate 2 — enough minutes, but no SportMonks rating yet.
  // ----------------------------------------------------------------
  if (input.rating === null) {
    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const voto_base = config.base_score
    const fantavoto = round(clamp(voto_base + bmTotal, config.voto_min, config.voto_max))

    return {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: false,
      no_ratings_exception: true,
      voto_base,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      fantavoto,
    }
  }

  // ----------------------------------------------------------------
  // Normal path — pivot formula.
  // ----------------------------------------------------------------
  const voto_base = ratingToVotoBase(input.rating, config)
  const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
  const fantavoto = round(clamp(voto_base + bmTotal, config.voto_min, config.voto_max))

  return {
    kind: 'scored',
    player_id, stats_id, is_provisional,
    decisive_event_exception: false,
    no_ratings_exception: false,
    voto_base,
    bonus_malus_breakdown: breakdown,
    total_bonus_malus: bmTotal,
    fantavoto,
  }
}

// ---- Full matchday ------------------------------------------

export function computeMatchday(
  players: EnginePlayerInput[],
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): MatchdayEngineResult {
  const player_results = players.map((p) => calculatePlayerScore(p, config))
  return {
    engine_version: config.engine_version,
    player_results,
    scored_count:  player_results.filter((r) => r.kind === 'scored').length,
    skipped_count: player_results.filter((r) => r.kind === 'skipped').length,
  }
}
