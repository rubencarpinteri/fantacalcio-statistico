// ============================================================
// Fantacalcio Statistico — Rating Engine v3.0 — Types
// ============================================================
// Single-source: SportMonks. "Pivot + Bonus" engine.
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

  /** SportMonks rating — null when the source hasn't provided data for this player yet (e.g. early-live match). */
  rating: number | null

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

export interface EngineConfig {
  engine_version: string

  /**
   * Pivot point of the rating → voto_base line.
   *   voto_base = pivot_vote + slope × (rating − pivot_rating)
   *   slope     = (voto_max − pivot_vote) / (voto_max − pivot_rating)
   *
   * Default: SportMonks 6.50 (kickoff baseline) → voto 6.00 (sufficienza)
   */
  pivot_rating: number
  pivot_vote: number

  /** Hard scale bounds for fantavoto. Default 1.0 – 10.0. */
  voto_min: number
  voto_max: number

  /** Below this minute count, the rating is discarded ("s.v." rule). */
  minutes_min_for_voto: number

  /** Baseline used when <15 min played but a decisive event fires. */
  base_score: number

  bonus_malus: BonusMalusConfig
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
   * True when player played < minutes_min_for_voto but had a decisive event.
   * voto_base = base_score (6.0); B/M applied.
   */
  decisive_event_exception: boolean

  /**
   * True when the player had enough minutes but the SportMonks rating was
   * not yet available (e.g. early in a live match).
   * voto_base = base_score (6.0); B/M applied.
   */
  no_ratings_exception: boolean

  /** Always set: base_score (6.0) for exception paths, pivot-formula output otherwise. */
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
