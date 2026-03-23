// ============================================================
// Fantacalcio Statistico — Rating Engine v1 — Core Logic
// ============================================================
// Pure TypeScript — no Supabase, no Next.js, no side effects.
// All functions are deterministic given the same inputs.
//
// Per-player pipeline (normal 10+ minute flow):
//   1.  NV / decisive-event gate  (minutes < 10)
//   2.  Per-source z-scores       z = (rating - mean) / std
//   3.  NO_RATINGS guard          (all z null)
//   4.  Weighted average          z_combined
//   5.  One-source shrink         ×0.75 when only 1 source available
//   6.  Minutes factor            0.70 / 0.85 / 1.00 by band
//   7.  z_adjusted                z_combined × minutes_factor
//   8.  b0 (Italian scale)        6.0 + 1.15 × z_adjusted
//   9.  b1 (role distance)        6.0 + multiplier × (b0 - 6.0)
//  10.  defensive_correction      role-specific weights + cap
//  11.  voto_base                 clamp(b1 + def_corr, 3.0, 9.5)
//  12.  bonus/malus               goals, assists, events, CS, GC, multi-goal
//  13.  advanced bonus            creative / dribbling / passing rules, +1.0 cap
//  14.  fantavoto                 voto_base + total_bonus_malus
// ============================================================

import { DEFAULT_ENGINE_CONFIG } from './config'
import type {
  EngineConfig,
  EnginePlayerInput,
  PlayerEngineOutput,
  PlayerCalculationResult,
  PlayerSkipped,
  BonusMalusItem,
  DefensiveStatKey,
  MatchdayEngineResult,
  DefensiveRoleConfig,
  AdvancedBonusConfig,
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
    input.goals_scored    > 0 ||
    input.assists         > 0 ||
    input.own_goals       > 0 ||
    input.yellow_cards    > 0 ||
    input.red_cards       > 0 ||
    input.penalties_scored > 0 ||
    input.penalties_missed > 0 ||
    input.penalties_saved  > 0
  )
}

// ---- Minutes factor -----------------------------------------

/**
 * Returns the minutes factor for 10+ minute players.
 * Callers must handle the 0–9 minute case separately.
 *
 *   30+  min  → 1.00
 *   15–29 min → 0.85
 *   10–14 min → 0.70
 */
function getMinutesFactor(minutes: number): number {
  if (minutes >= 30) return 1.00
  if (minutes >= 15) return 0.85
  return 0.70 // 10–14
}

// ---- Defensive correction -----------------------------------

function computeDefensiveCorrection(
  input: EnginePlayerInput,
  cfg: DefensiveRoleConfig
): number {
  let corr = 0
  for (const [stat, coeff] of Object.entries(cfg.weights) as [DefensiveStatKey, number][]) {
    const val = input[stat] as number
    corr += coeff * val
  }
  return round(clamp(round(corr), cfg.cap_min, cfg.cap_max))
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

  // ---- Clean sheet (role + min >= 60) ----
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
  // MID/ATT: nothing
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

// ---- Advanced bonus -----------------------------------------

function computeAdvancedBonus(
  input: EnginePlayerInput,
  cfg: AdvancedBonusConfig
): { breakdown: BonusMalusItem[]; total: number } {
  if (!cfg.enabled) return { breakdown: [], total: 0 }

  const items: BonusMalusItem[] = []
  let raw = 0

  // Rule 1 — Creative vision (either sub-condition)
  const meetsCreative =
    (input.key_passes !== null && input.key_passes >= cfg.creative_key_passes_threshold) ||
    (input.expected_assists !== null && input.expected_assists >= cfg.creative_expected_assists_threshold)

  if (meetsCreative) {
    items.push({ label: 'Visione (passaggi chiave / xA)', quantity: 1, points_each: cfg.creative_bonus, total: cfg.creative_bonus })
    raw += cfg.creative_bonus
  }

  // Rule 2 — Dribbling (both sub-conditions required)
  const meetsDribbling =
    input.successful_dribbles !== null &&
    input.successful_dribbles >= cfg.dribbling_successful_threshold &&
    input.dribble_success_rate !== null &&
    input.dribble_success_rate >= cfg.dribbling_success_rate_threshold

  if (meetsDribbling) {
    items.push({ label: 'Dribbling', quantity: 1, points_each: cfg.dribbling_bonus, total: cfg.dribbling_bonus })
    raw += cfg.dribbling_bonus
  }

  // Rule 3 — Passing control (pass conditions + either final-third OR progressive)
  const meetsPassing =
    input.completed_passes !== null &&
    input.completed_passes >= cfg.passing_completed_threshold &&
    input.pass_accuracy !== null &&
    input.pass_accuracy >= cfg.passing_accuracy_threshold &&
    (
      (input.final_third_passes !== null && input.final_third_passes >= cfg.passing_final_third_threshold) ||
      (input.progressive_passes !== null && input.progressive_passes >= cfg.passing_progressive_threshold)
    )

  if (meetsPassing) {
    items.push({ label: 'Controllo del palleggio', quantity: 1, points_each: cfg.passing_bonus, total: cfg.passing_bonus })
    raw += cfg.passing_bonus
  }

  if (raw === 0) return { breakdown: [], total: 0 }

  // Apply total cap
  const cappedTotal = Math.min(raw, cfg.total_cap)
  if (raw > cfg.total_cap) {
    const excess = round(raw - cfg.total_cap)
    items.push({ label: 'Cap bonus avanzati', quantity: 1, points_each: -excess, total: -excess })
  }

  return { breakdown: items, total: round(cappedTotal) }
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
      const skipped: PlayerSkipped = { kind: 'skipped', player_id, stats_id, is_provisional, reason: 'NV' }
      return skipped
    }

    // Decisive-event exception: voto_base = 6.0, apply BM + advanced only
    const { breakdown: bmBreakdown, total: bmTotal } = computeBonusMalus(input, config)
    const { breakdown: advBreakdown, total: advTotal } = computeAdvancedBonus(input, config.advanced_bonus)
    const allBreakdown = [...bmBreakdown, ...advBreakdown]
    const total_bonus_malus = round(bmTotal + advTotal)
    const fantavoto = round(config.base_score + total_bonus_malus)

    const result: PlayerCalculationResult = {
      kind: 'scored',
      player_id, stats_id, is_provisional,
      decisive_event_exception: true,
      z_sofascore: null, z_fotmob: null,
      z_combined: null,
      weights_used: {},
      minutes_factor: null,
      z_adjusted: null,
      b0: null,
      role_multiplier: null,
      b1: null,
      defensive_correction: null,
      voto_base: config.base_score,
      bonus_malus_breakdown: allBreakdown,
      total_bonus_malus,
      fantavoto,
    }
    return result
  }

  // ----------------------------------------------------------------
  // Step 2 — Per-source z-scores: z = (rating - mean) / std
  // ----------------------------------------------------------------
  const norm = config.source_normalization

  const z_sofascore = input.sofascore_rating !== null
    ? round((input.sofascore_rating - norm.sofascore.mean) / norm.sofascore.std)
    : null
  const z_fotmob = input.fotmob_rating !== null
    ? round((input.fotmob_rating - norm.fotmob.mean) / norm.fotmob.std)
    : null

  // ----------------------------------------------------------------
  // Gate 2 — No source ratings at all
  // ----------------------------------------------------------------
  const rawWeights = config.source_weights
  const sourceMap = [
    { z: z_sofascore, weight: rawWeights.sofascore, key: 'sofascore' },
    { z: z_fotmob,    weight: rawWeights.fotmob,    key: 'fotmob'    },
  ]
  const available = sourceMap.filter((s) => s.z !== null)

  if (available.length === 0) {
    const skipped: PlayerSkipped = { kind: 'skipped', player_id, stats_id, is_provisional, reason: 'NO_RATINGS' }
    return skipped
  }

  // ----------------------------------------------------------------
  // Step 3 — Normalised weighted average
  // ----------------------------------------------------------------
  const totalWeight = available.reduce((acc, s) => acc + s.weight, 0)
  const weights_used: Record<string, number> = {}
  let z_combined = 0

  for (const s of available) {
    const normWeight = round(s.weight / totalWeight, 6)
    weights_used[s.key] = normWeight
    z_combined += (s.z as number) * normWeight
  }
  for (const s of sourceMap) {
    if (s.z === null) weights_used[s.key] = 0
  }

  // ----------------------------------------------------------------
  // Step 4 — One-source shrink (25% toward zero when only 1 available)
  // ----------------------------------------------------------------
  if (available.length === 1) {
    z_combined = z_combined * config.one_source_shrink
  }
  z_combined = round(z_combined)

  // ----------------------------------------------------------------
  // Step 5 — Minutes factor (10+ min only; 0–9 handled above)
  // ----------------------------------------------------------------
  const minutes_factor = getMinutesFactor(input.minutes_played)

  // ----------------------------------------------------------------
  // Step 6 — z_adjusted
  // ----------------------------------------------------------------
  const z_adjusted = round(z_combined * minutes_factor)

  // ----------------------------------------------------------------
  // Step 7 — b0: Italian base-scale conversion
  //   b0 = 6.0 + 1.15 × z_adjusted
  // ----------------------------------------------------------------
  const b0 = round(config.base_score + config.scale_factor * z_adjusted)

  // ----------------------------------------------------------------
  // Step 8 — b1: role-distance multiplier
  //   b1 = 6.0 + multiplier[rc] × (b0 - 6.0)
  //   (not b0 × multiplier — expands/compresses distance from sufficiency)
  // ----------------------------------------------------------------
  const roleMultiplier = config.role_multiplier[input.rating_class]
  const b1 = round(config.base_score + roleMultiplier * (b0 - config.base_score))

  // ----------------------------------------------------------------
  // Step 9 — Defensive correction (role-specific weights + per-role cap)
  // ----------------------------------------------------------------
  const defCfg = config.defensive[input.rating_class]
  const defensive_correction = computeDefensiveCorrection(input, defCfg)

  // ----------------------------------------------------------------
  // Step 10 — voto_base = clamp(b1 + def_correction, 3.0, 9.5)
  // ----------------------------------------------------------------
  const voto_base = round(clamp(b1 + defensive_correction, config.voto_base_cap_min, config.voto_base_cap_max))

  // ----------------------------------------------------------------
  // Steps 11–12 — Bonus / malus and advanced bonus
  // ----------------------------------------------------------------
  const { breakdown: bmBreakdown, total: bmTotal } = computeBonusMalus(input, config)
  const { breakdown: advBreakdown, total: advTotal } = computeAdvancedBonus(input, config.advanced_bonus)
  const bonus_malus_breakdown = [...bmBreakdown, ...advBreakdown]
  const total_bonus_malus = round(bmTotal + advTotal)

  // ----------------------------------------------------------------
  // Step 13 — fantavoto
  // ----------------------------------------------------------------
  const fantavoto = round(voto_base + total_bonus_malus)

  const result: PlayerCalculationResult = {
    kind: 'scored',
    player_id, stats_id, is_provisional,
    decisive_event_exception: false,
    z_sofascore, z_fotmob,
    z_combined,
    weights_used,
    minutes_factor,
    z_adjusted,
    b0,
    role_multiplier: roleMultiplier,
    b1,
    defensive_correction,
    voto_base,
    bonus_malus_breakdown,
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
