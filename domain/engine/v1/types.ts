// ============================================================
// Fantacalcio Statistico — Rating Engine v1.1 — Types
// ============================================================

import type { RatingClass } from '@/types/database.types'

// ---- Input -------------------------------------------------

/** All data the engine needs for a single player. */
export interface EnginePlayerInput {
  player_id: string
  stats_id: string
  /** Effective rating class: override takes precedence over stored class. E is resolved before this point. */
  rating_class: RatingClass
  minutes_played: number
  is_provisional: boolean

  // Single source rating — null if FotMob has not yet published (e.g. live match)
  fotmob_rating: number | null

  // Event counts
  goals_scored: number        // includes penalties_scored
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number    // subset of goals_scored
  penalties_missed: number
  penalties_saved: number     // GK only in practice
  clean_sheet: boolean
  goals_conceded: number
}

// ---- Config types ------------------------------------------

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
  /** Italian base-scale factor: b0 = base_score + scale_factor × z_adjusted (1.15) */
  scale_factor: number
  /**
   * FotMob rating normalization: z = (rating - mean) / std
   * mean = 6.6 (FotMob "average" as confirmed by their color bands)
   * std  = 0.79 (typical spread of ratings across a Serie A season)
   */
  source_normalization: { mean: number; std: number }
  /** Configurable 2-band minutes factor */
  minutes_factor: MinutesFactorConfig
  /**
   * Role multipliers — expand/compress distance from the 6.0 sufficiency threshold:
   *   b1 = base_score + multiplier × (b0 - base_score)
   * GK/DEF: amplified (rating is the primary scoring signal)
   * MID: neutral
   * ATT: slightly compressed (goals/assists already captured in B/M)
   */
  role_multiplier: Record<RatingClass, number>
  bonus_malus: BonusMalusConfig
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
   * z_fotmob, b0, b1, minutes_factor are null; voto_base = base_score (6.0).
   */
  decisive_event_exception: boolean
  /**
   * True when the player had ≥10 minutes but FotMob rating was not yet available
   * (e.g. fetched during a live match before ratings are published).
   * z_fotmob, z_adjusted, b0, b1 are null; voto_base = base_score (6.0);
   * minutes_factor is set; full B/M is applied.
   */
  no_ratings_exception: boolean

  // null for decisive_event_exception, or when FotMob rating missing
  z_fotmob: number | null
  // null for decisive_event_exception; set for no_ratings_exception (useful for indicator)
  minutes_factor: number | null
  // null when z_fotmob is null
  z_adjusted: number | null
  b0: number | null
  role_multiplier: number | null
  b1: number | null

  // Always set: base_score (6.0) for exceptions, clamped b1 otherwise
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
  reason: 'NV'
}

export type PlayerEngineOutput = PlayerCalculationResult | PlayerSkipped

export interface MatchdayEngineResult {
  engine_version: string
  player_results: PlayerEngineOutput[]
  scored_count: number
  skipped_count: number
}
