// ============================================================
// Fantacalcio Statistico — Rating Engine v1.2 — Core Logic
// ============================================================
// Pure TypeScript — no Supabase, no Next.js, no side effects.
// All functions are deterministic given the same inputs.
//
// Per-player pipeline (normal 10+ minute flow):
//   1.  NV / decisive-event gate       (minutes < 10)
//   2a. z_fotmob    = (fotmob_rating    − 6.6)  / 0.79   (null if missing)
//   2b. z_sofascore = (sofascore_rating − 6.7)  / 0.65   (null if missing)
//   3.  NO_RATINGS guard               (both null → base 6.0 + B/M)
//   4.  z_combined  = weighted avg of available z-scores (weights re-normalised)
//                     FotMob 55% / SofaScore 45%; single source → no shrink
//   5.  Minutes factor                 configurable 2-band (default: <45 → ×0.50, ≥45 → ×1.00)
//   6.  z_adjusted  = z_combined × minutes_factor
//   7.  b0          = 6.0 + 1.15 × z_adjusted
//   8.  b1          = 6.0 + role_multiplier × (b0 − 6.0)
//   9.  voto_base   = clamp(b1, 3.0, 9.5)
//  10.  bonus/malus                    goals, assists, events, CS, GC, multi-goal
//  11.  fantavoto   = voto_base + total_bonus_malus
// ============================================================

import { DEFAULT_ENGINE_CONFIG } from './config'
import type {
  EngineConfig,
  MinutesFactorConfig,
  EnginePlayerInput,
  PlayerEngineOutput,
  PlayerCalculationResult,
  PlayerSkipped,
  BonusMalusItem,
  MatchdayEngineResult,
} from './types'

// ---- Numeric helpers ----------------------------------------

/** Round to `dp` decimal places (default 3) to avoid float drift */
function round(value: number, dp = 3): number {
  const factor = Math.pow(10, dp)
  return Math.round(value * factor) / factor
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ---- Decisive-event check -----------------------------------

/**
 * Returns true if the player had any decisive event.
 * Used to decide whether a 0–9 minute player is scored via the
 * decisive-event exception rather than skipped as NV.
 */
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

// ---- Minutes factor -----------------------------------------

function getMinutesFactor(minutes: number, cfg: MinutesFactorConfig): number {
  return minutes >= cfg.threshold ? cfg.full : cfg.partial
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

  // Multi-goal extras — hat-trick supersedes brace, not stacked
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

  // Penalty saved — GK only
  if (rc === 'GK') {
    add('Rigore parato', input.penalties_saved, bm.penalty_saved)
  }

  // ---- Clean sheet (role + min >= threshold) ----
  const csBonus = bm.clean_sheet_by_role[rc]
  if (
    csBonus !== undefined &&
    input.clean_sheet &&
    input.minutes_played >= bm.clean_sheet_min_minutes
  ) {
    add('Porta inviolata', 1, csBonus)
  }

  // ---- Goals conceded ----
  // GK: always (no min restriction)
  // DEF: only if minutes_played >= goals_conceded_def_min_minutes
  // MID/ATT: no malus
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

// ---- Per-player entry point ---------------------------------

export function calculatePlayerScore(
  input: EnginePlayerInput,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): PlayerEngineOutput {
  const { player_id, stats_id, is_provisional } = input

  // ----------------------------------------------------------------
  // Gate 1 — 0–9 minutes
  // ----------------------------------------------------------------
  if (input.minutes_played < 10) {
    if (!hasDecisiveEvent(input)) {
      const skipped: PlayerSkipped = {
        kind: 'skipped', player_id, stats_id, is_provisional, reason: 'NV',
      }
      return skipped
    }

    // Decisive-event exception: voto_base = 6.0, B/M only
    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const fantavoto = round(config.base_score + bmTotal)

    const result: PlayerCalculationResult = {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: true,
      no_ratings_exception: false,
      z_fotmob: null,
      z_sofascore: null,
      minutes_factor: null,
      z_adjusted: null,
      b0: null,
      role_multiplier: null,
      b1: null,
      voto_base: config.base_score,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      fantavoto,
    }
    return result
  }

  // ----------------------------------------------------------------
  // Step 2a — FotMob z-score
  // ----------------------------------------------------------------
  const fmNorm = config.source_normalization
  const z_fotmob = input.fotmob_rating !== null
    ? round((input.fotmob_rating - fmNorm.mean) / fmNorm.std)
    : null

  // ----------------------------------------------------------------
  // Step 2b — SofaScore z-score
  // ----------------------------------------------------------------
  const ssNorm = config.sofascore_normalization
  const z_sofascore = input.sofascore_rating !== null
    ? round((input.sofascore_rating - ssNorm.mean) / ssNorm.std)
    : null

  // ----------------------------------------------------------------
  // Gate 2 — No ratings from either source
  // voto_base = 6.0; minutes_factor is still computed so the UI
  // can distinguish this case from decisive_event_exception.
  // ----------------------------------------------------------------
  if (z_fotmob === null && z_sofascore === null) {
    const minutes_factor = getMinutesFactor(input.minutes_played, config.minutes_factor)
    const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
    const voto_base = config.base_score
    const fantavoto = round(voto_base + bmTotal)

    return {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: false,
      no_ratings_exception: true,
      z_fotmob: null,
      z_sofascore: null,
      minutes_factor,
      z_adjusted: null,
      b0: null,
      role_multiplier: null,
      b1: null,
      voto_base,
      bonus_malus_breakdown: breakdown,
      total_bonus_malus: bmTotal,
      fantavoto,
    }
  }

  // ----------------------------------------------------------------
  // Step 3 — Minutes factor
  // ----------------------------------------------------------------
  const minutes_factor = getMinutesFactor(input.minutes_played, config.minutes_factor)

  // ----------------------------------------------------------------
  // Step 4 — z_combined: weighted average of available sources
  // Weights are re-normalised among non-null sources.
  // Single source → use directly with full weight (no shrink factor).
  // ----------------------------------------------------------------
  let z_combined: number
  if (z_fotmob !== null && z_sofascore !== null) {
    // Both available — weighted average
    const w_fm = config.fotmob_weight
    const w_ss = 1 - w_fm
    z_combined = round(w_fm * z_fotmob + w_ss * z_sofascore)
  } else if (z_fotmob !== null) {
    z_combined = z_fotmob
  } else {
    z_combined = z_sofascore!
  }

  // ----------------------------------------------------------------
  // Step 5 — z_adjusted
  // ----------------------------------------------------------------
  const z_adjusted = round(z_combined * minutes_factor)

  // ----------------------------------------------------------------
  // Step 6 — b0: Italian base-scale conversion
  //   b0 = 6.0 + 1.15 × z_adjusted
  // ----------------------------------------------------------------
  const b0 = round(config.base_score + config.scale_factor * z_adjusted)

  // ----------------------------------------------------------------
  // Step 7 — b1: role-distance multiplier
  //   b1 = 6.0 + multiplier[rc] × (b0 - 6.0)
  //   (not b0 × multiplier — expands/compresses distance from sufficiency)
  // ----------------------------------------------------------------
  const roleMultiplier = config.role_multiplier[input.rating_class]
  const b1 = round(config.base_score + roleMultiplier * (b0 - config.base_score))

  // ----------------------------------------------------------------
  // Step 8 — voto_base = clamp(b1, 3.0, 9.5)
  // ----------------------------------------------------------------
  const voto_base = round(clamp(b1, config.voto_base_cap_min, config.voto_base_cap_max))

  // ----------------------------------------------------------------
  // Step 9 — Bonus / malus
  // ----------------------------------------------------------------
  const { breakdown, total: bmTotal } = computeBonusMalus(input, config)
  const total_bonus_malus = bmTotal

  // ----------------------------------------------------------------
  // Step 10 — fantavoto
  // ----------------------------------------------------------------
  const fantavoto = round(voto_base + total_bonus_malus)

  const result: PlayerCalculationResult = {
    kind: 'scored',
    player_id, stats_id, is_provisional,
    decisive_event_exception: false,
    no_ratings_exception: false,
    z_fotmob,
    z_sofascore,
    minutes_factor,
    z_adjusted,
    b0,
    role_multiplier: roleMultiplier,
    b1,
    voto_base,
    bonus_malus_breakdown: breakdown,
    total_bonus_malus,
    fantavoto,
  }
  return result
}

// ---- Full matchday ------------------------------------------

/**
 * Runs the engine for every player in a matchday.
 * Pure — no DB access, no side effects.
 */
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
