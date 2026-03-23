// ============================================================
// Fantacalcio Statistico — Rating Engine v1 — Approved Config
// ============================================================
// This is the authoritative source-of-truth for the v1 engine.
// Values match the approved scoring spec exactly.
// Do not change constants here without updating engine_version.
// ============================================================

import type { EngineConfig } from './types'

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engine_version: 'v1',

  /** Mantra baseline (sufficiency threshold) */
  base_score: 6.0,

  /**
   * Italian base-scale conversion factor.
   * Applied as: b0 = 6.0 + 1.15 * z_adjusted
   */
  scale_factor: 1.15,

  /**
   * Shrink factor applied to z_combined when exactly one source is available.
   * z_combined *= 0.75  →  25% shrink toward zero.
   */
  one_source_shrink: 0.75,

  /**
   * Provider-specific z-score normalisation parameters.
   * z = (rating - mean) / std
   */
  source_normalization: {
    sofascore: { mean: 6.87, std: 0.54 },
    fotmob:    { mean: 6.87, std: 0.79 },
  },

  /**
   * Source rating weights before normalisation.
   * Among available (non-null) sources, weights are re-normalised to sum to 1.0.
   */
  source_weights: {
    sofascore: 0.55,
    fotmob:    0.45,
  },

  /**
   * Role multipliers — applied as distance-from-sufficiency expansion/compression:
   *   b1 = 6.0 + multiplier * (b0 - 6.0)
   * NOT as a direct multiplier of the whole score.
   */
  role_multiplier: {
    GK:  1.15,
    DEF: 1.10,
    MID: 1.00,
    ATT: 0.97,
  },

  /**
   * Per-role defensive correction weights and caps.
   * ATT has no defensive correction (empty weights, cap [0, 0]).
   * Clean sheet and goals conceded for outfield players are in bonus_malus, not here.
   * GK goals_conceded is here (and ALSO separately in bonus_malus as approved).
   */
  defensive: {
    GK: {
      weights: {
        saves:                 0.12,
        goals_conceded:       -0.15,
        error_leading_to_goal: -0.60,
      },
      cap_min: -1.0,
      cap_max:  1.2,
    },
    DEF: {
      weights: {
        tackles_won:            0.08,
        interceptions:          0.08,
        clearances:             0.04,
        blocks:                 0.10,
        aerial_duels_won:       0.03,
        dribbled_past:         -0.10,
        error_leading_to_goal: -0.60,
      },
      cap_min: -1.0,
      cap_max:  1.5,
    },
    MID: {
      weights: {
        tackles_won:            0.08,
        interceptions:          0.08,
        clearances:             0.04,
        blocks:                 0.10,
        aerial_duels_won:       0.03,
        dribbled_past:         -0.10,
        error_leading_to_goal: -0.60,
      },
      cap_min: -0.8,
      cap_max:  0.8,
    },
    ATT: {
      weights: {},
      cap_min: 0,
      cap_max: 0,
    },
  },

  bonus_malus: {
    /**
     * Per-role goal bonus (regular goal and header).
     * Penalty goal = goal_by_role[rc] - penalty_scored_discount.
     */
    goal_by_role: {
      GK:  4.0,
      DEF: 2.8,
      MID: 2.2,
      ATT: 1.8,
    },
    /** Subtracted from the role's goal bonus for each penalty scored. */
    penalty_scored_discount: 0.3,
    // Resulting penalty goal bonuses: GK 3.7 / DEF 2.5 / MID 1.9 / ATT 1.5

    assist:         1.0,
    own_goal:      -1.5,
    yellow_card:   -0.3,
    red_card:      -1.5,
    penalty_missed: -1.5,
    /** GK only — applied only when rating_class === 'GK' */
    penalty_saved:  2.0,

    /**
     * Clean sheet bonus by role.
     * Applies only when minutes_played >= clean_sheet_min_minutes.
     */
    clean_sheet_by_role: {
      GK:  0.8,
      DEF: 0.5,
    },
    clean_sheet_min_minutes: 60,

    /**
     * Goals conceded malus by role (negative values).
     * GK: applies always (no min minutes).
     * DEF: applies only when minutes_played >= goals_conceded_def_min_minutes.
     * MID/ATT: no malus.
     */
    goals_conceded_by_role: {
      GK:  -0.4,
      DEF: -0.15,
    },
    goals_conceded_def_min_minutes: 60,

    /** Extra bonus for exactly 2 goals (brace). */
    brace_bonus: 0.5,
    /** Extra bonus for 3+ goals (hat-trick). Replaces, does not stack with brace_bonus. */
    hat_trick_bonus: 1.0,
  },

  /**
   * Advanced bonus rules (applied only when enabled).
   * Total capped at +1.0 regardless of how many rules fire.
   */
  advanced_bonus: {
    enabled: true, // overridden per-league via buildEngineConfig()
    total_cap: 1.0,

    // Rule 1 — Creative vision (either sub-condition is sufficient)
    creative_key_passes_threshold:       5,
    creative_expected_assists_threshold: 0.70,
    creative_bonus:                      0.5,

    // Rule 2 — Dribbling (both sub-conditions required)
    dribbling_successful_threshold:     6,
    dribbling_success_rate_threshold:   60,
    dribbling_bonus:                    0.5,

    // Rule 3 — Passing control (pass conditions required AND either final-third OR progressive)
    passing_completed_threshold:    50,
    passing_accuracy_threshold:     90,
    passing_final_third_threshold:   8,
    passing_progressive_threshold:   5,
    passing_bonus:                   0.5,
  },

  voto_base_cap_min: 3.0,
  voto_base_cap_max: 9.5,
}

/**
 * Build a per-league engine config, overriding the advanced bonus flag and
 * optionally the source weights (as decimal fractions, e.g. 0.40).
 * Call this at trigger time, not at config definition time.
 */
export function buildEngineConfig(
  advancedBonusesEnabled: boolean,
  sourceWeights?: { sofascore: number; fotmob: number }
): EngineConfig {
  return {
    ...DEFAULT_ENGINE_CONFIG,
    advanced_bonus: {
      ...DEFAULT_ENGINE_CONFIG.advanced_bonus,
      enabled: advancedBonusesEnabled,
    },
    ...(sourceWeights ? { source_weights: sourceWeights } : {}),
  }
}
