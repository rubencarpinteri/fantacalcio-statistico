// ============================================================
// Fantacalcio Statistico — Rating Engine v1.2 — Types
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

  // Dual-source ratings — null when the source didn't provide data for this player
  fotmob_rating: number | null
  sofascore_rating: number | null

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
  /** Baseline score used for exception paths (decisive event, no ratings). Always 6.0. */
  base_score: number
  /**
   * FotMob rating normalization: z = (rating - mean) / std
   * mean = 6.6 (FotMob "average" as confirmed by their color bands)
   * std  = 0.79 (typical spread of ratings across a Serie A season)
   */
  source_normalization: { mean: number; std: number }
  /**
   * SofaScore rating normalization.
   * mean = 6.7, std = 0.65 (calibrated against SofaScore's rating distribution)
   */
  sofascore_normalization: { mean: number; std: number }
  /**
   * Weight of FotMob in the dual-source weighted average.
   * SofaScore weight = 1 - fotmob_weight.
   * Weights are re-normalized among available sources (if one is null, the other gets full weight).
   */
  fotmob_weight: number
  /** Configurable 2-band minutes factor */
  minutes_factor: MinutesFactorConfig
  /**
   * Role multipliers — expand/compress distance from target_mean_vote:
   *   b1 = target_mean_vote + multiplier × (b0 - target_mean_vote)
   * GK/DEF: amplified (rating is the primary scoring signal)
   * MID: neutral
   * ATT: slightly compressed (goals/assists already captured in B/M)
   */
  role_multiplier: Record<RatingClass, number>
  bonus_malus: BonusMalusConfig
  voto_base_cap_min: number
  voto_base_cap_max: number
  /**
   * Target distribution — Step 2 of the calibration pipeline.
   *
   * After source normalization produces a combined z-score, these two parameters
   * define the center and spread of the final voto_base distribution:
   *
   *   b0 = target_mean_vote + target_vote_std × z_adjusted
   *   b1 = target_mean_vote + role_multiplier × (b0 − target_mean_vote)
   *
   * target_mean_vote: A combined z-score of 0 maps exactly to this vote.
   * target_vote_std:  Each ±1σ deviation shifts the vote by this many points.
   *
   * Configurable per league via league_engine_config.
   */
  target_mean_vote: number
  target_vote_std: number
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

  // null for decisive_event_exception, or when source not available
  z_fotmob: number | null
  z_sofascore: number | null
  // null for decisive_event_exception; set for no_ratings_exception (useful for indicator)
  minutes_factor: number | null
  // null when both z-scores are null
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
