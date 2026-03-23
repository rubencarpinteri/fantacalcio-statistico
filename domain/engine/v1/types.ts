// ============================================================
// Fantacalcio Statistico — Rating Engine v1 — Types
// ============================================================

import type { RatingClass } from '@/types/database.types'

// ---- Input -------------------------------------------------

/**
 * Keys of EnginePlayerInput that map directly to DB stat columns
 * used in defensive correction weight formulas.
 */
export type DefensiveStatKey =
  | 'tackles_won'
  | 'interceptions'
  | 'clearances'
  | 'blocks'
  | 'aerial_duels_won'
  | 'dribbled_past'
  | 'error_leading_to_goal'
  | 'saves'
  | 'goals_conceded'

/** All data the engine needs for a single player. */
export interface EnginePlayerInput {
  player_id: string
  stats_id: string
  /** Effective rating class: override takes precedence over stored class. E is resolved before this point. */
  rating_class: RatingClass
  minutes_played: number
  is_provisional: boolean

  // Source ratings — null if not provided for this matchday
  sofascore_rating: number | null
  fotmob_rating: number | null

  // Event counts
  goals_scored: number        // includes penalties_scored
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number    // subset of goals_scored; used for BM discount + decisive event
  penalties_missed: number
  penalties_saved: number     // GK only in practice
  clean_sheet: boolean
  goals_conceded: number

  // Defensive stats — used in defensive correction formula
  tackles_won: number
  interceptions: number
  clearances: number
  blocks: number
  aerial_duels_won: number
  dribbled_past: number
  saves: number
  error_leading_to_goal: number

  // Advanced stats — nullable; null means not entered, not zero
  key_passes: number | null
  expected_assists: number | null
  successful_dribbles: number | null
  dribble_success_rate: number | null
  completed_passes: number | null
  pass_accuracy: number | null
  final_third_passes: number | null
  progressive_passes: number | null
}

// ---- Config types ------------------------------------------

export interface SourceNormalization {
  mean: number
  std: number
}

/**
 * Defensive correction weights for a single role.
 * weights keys must be a subset of DefensiveStatKey.
 * ATT uses empty weights (no defensive correction).
 */
export interface DefensiveRoleConfig {
  weights: Partial<Record<DefensiveStatKey, number>>
  cap_min: number
  cap_max: number
}

export interface BonusMalusConfig {
  /** Per-role goal bonus (regular goal). GK > DEF > MID > ATT. */
  goal_by_role: Record<RatingClass, number>
  /** Penalty goal = goal_by_role[rc] - penalty_scored_discount */
  penalty_scored_discount: number
  assist: number
  own_goal: number
  yellow_card: number
  red_card: number
  penalty_missed: number
  /** Applies only to GK */
  penalty_saved: number
  /** Per-role clean sheet bonus (only if minutes_played >= clean_sheet_min_minutes) */
  clean_sheet_by_role: Partial<Record<RatingClass, number>>
  clean_sheet_min_minutes: number
  /** Per-role goals conceded malus — negative values */
  goals_conceded_by_role: Partial<Record<RatingClass, number>>
  /** DEF goals conceded only applies if minutes_played >= this threshold */
  goals_conceded_def_min_minutes: number
  /** Extra bonus for exactly 2 goals in the match */
  brace_bonus: number
  /** Extra bonus for 3+ goals in the match (replaces, does not stack with brace_bonus) */
  hat_trick_bonus: number
}

export interface AdvancedBonusConfig {
  /** Set to false when league.advanced_bonuses_enabled = false */
  enabled: boolean
  /** Maximum combined advanced bonus that can be earned */
  total_cap: number
  // Rule 1 — Creative vision (either condition triggers)
  creative_key_passes_threshold: number
  creative_expected_assists_threshold: number
  creative_bonus: number
  // Rule 2 — Dribbling (both conditions required)
  dribbling_successful_threshold: number
  dribbling_success_rate_threshold: number
  dribbling_bonus: number
  // Rule 3 — Passing control (all pass conditions required, plus either final_third OR progressive)
  passing_completed_threshold: number
  passing_accuracy_threshold: number
  passing_final_third_threshold: number
  passing_progressive_threshold: number
  passing_bonus: number
}

export interface MinutesFactorConfig {
  /** Players with minutes < threshold get factor_partial; >= threshold get factor_full */
  threshold: number
  partial: number
  full: number
}

export interface EngineConfig {
  engine_version: string
  /** Baseline score that z-deviations are applied around (6.0) */
  base_score: number
  /** Italian base-scale factor applied before role multiplier (1.15) */
  scale_factor: number
  /** Shrink factor for z_combined when only one source is available (0.75 = 25% shrink toward 0) */
  one_source_shrink: number
  source_normalization: Record<'sofascore' | 'fotmob', SourceNormalization>
  source_weights: Record<'sofascore' | 'fotmob', number>
  /** Configurable 2-band minutes factor */
  minutes_factor: MinutesFactorConfig
  /** Role multiplier used in b1 = base_score + multiplier * (b0 - base_score) */
  role_multiplier: Record<RatingClass, number>
  defensive: Record<RatingClass, DefensiveRoleConfig>
  bonus_malus: BonusMalusConfig
  advanced_bonus: AdvancedBonusConfig
  voto_base_cap_min: number
  voto_base_cap_max: number
}

// ---- BM item -----------------------------------------------

export interface BonusMalusItem {
  label: string
  quantity: number
  points_each: number
  total: number
}

// ---- Output ------------------------------------------------

export interface PlayerCalculationResult {
  kind: 'scored'
  player_id: string
  stats_id: string
  is_provisional: boolean
  /**
   * True when player played 0–9 minutes but had a decisive event.
   * In this case z-scores, b0, b1, defensive_correction are null
   * and voto_base is set directly to base_score (6.0).
   */
  decisive_event_exception: boolean

  // Per-source z-scores (null if source missing OR decisive_event_exception)
  z_sofascore: number | null
  z_fotmob: number | null
  z_combined: number | null
  weights_used: Record<string, number>

  // null for decisive_event_exception, computed otherwise
  minutes_factor: number | null
  z_adjusted: number | null
  b0: number | null
  role_multiplier: number | null
  b1: number | null
  defensive_correction: number | null

  // Always set: 6.0 for decisive_event_exception, clamped value otherwise
  voto_base: number

  bonus_malus_breakdown: BonusMalusItem[]
  total_bonus_malus: number
  fantavoto: number
}

export interface PlayerSkipped {
  kind: 'skipped'
  player_id: string
  stats_id: string
  is_provisional: boolean
  reason: 'NV' | 'NO_RATINGS'
}

export type PlayerEngineOutput = PlayerCalculationResult | PlayerSkipped

export interface MatchdayEngineResult {
  engine_version: string
  player_results: PlayerEngineOutput[]
  scored_count: number
  skipped_count: number
}
