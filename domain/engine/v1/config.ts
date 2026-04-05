// ============================================================
// Fantacalcio Statistico — Rating Engine v1.1 — Config
// ============================================================
// This is the authoritative source-of-truth for the v1.1 engine.
// Values match the approved scoring spec exactly.
// Do not change constants here without updating engine_version.
//
// Key changes from v1:
//   - SofaScore removed (fetching not feasible)
//   - FotMob mean corrected from 6.87 → 6.6 (matches FotMob color bands)
//   - Weighted average + one_source_shrink removed (single source)
//   - Defensive correction removed (stats not available; FotMob rating bakes them in)
//   - Advanced bonus removed (stats not available)
//   - Role multipliers now configurable per league via league_engine_config
// ============================================================

import type { EngineConfig } from './types'
import type { LeagueEngineConfig } from '@/types/database.types'

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engine_version: 'v1.1',

  /** Mantra baseline (sufficiency threshold) */
  base_score: 6.0,

  /**
   * Italian base-scale conversion factor.
   * Applied as: b0 = 6.0 + 1.15 × z_adjusted
   */
  scale_factor: 1.15,

  /**
   * FotMob rating normalization.
   * mean = 6.6: FotMob's "average" player (confirmed by their green/yellow color boundary).
   * std  = 0.79: typical spread of ratings across a Serie A season.
   *
   * Example:
   *   rating 6.6 → z =  0.00 → b0 = 6.00 (neutral)
   *   rating 7.4 → z = +1.01 → b0 = 7.16 (one std above average)
   *   rating 5.8 → z = -1.01 → b0 = 4.84 (one std below average)
   */
  source_normalization: {
    mean: 6.6,
    std:  0.79,
  },

  /**
   * Configurable 2-band minutes factor.
   * Players with minutes_played < threshold → z_adjusted is reduced by partial factor.
   * Players with minutes_played >= threshold → full weight.
   * The 0-minute NV gate and decisive-event exception are separate, unaffected by this.
   */
  minutes_factor: {
    threshold: 45,
    partial:   0.50,
    full:      1.00,
  },

  /**
   * Role multipliers — applied as distance-from-sufficiency expansion/compression:
   *   b1 = 6.0 + multiplier × (b0 - 6.0)
   * NOT as a direct multiplier of the whole score.
   *
   * Rationale:
   *   GK / DEF: FotMob rating IS the primary scoring signal (goals/assists rare)
   *             → amplify to reward standout defensive performances
   *   MID:      balanced (goals/assists and defensive work both matter)
   *             → neutral multiplier
   *   ATT:      goals/assists are already captured in B/M
   *             → slightly compress rating signal to avoid double-counting
   *
   * Configurable per league via league_engine_config.
   */
  role_multiplier: {
    GK:  1.15,
    DEF: 1.10,
    MID: 1.00,
    ATT: 0.97,
  },

  bonus_malus: {
    /**
     * Per-role goal bonus (regular goal).
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
    /** GK only */
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

  voto_base_cap_min: 3.0,
  voto_base_cap_max: 9.5,
}

/**
 * Build a per-league engine config from an optional DB engine config row.
 * Falls back to DEFAULT_ENGINE_CONFIG when dbConfig is null.
 * Called at calculation trigger time — never at module load time.
 */
export function buildEngineConfig(
  dbConfig: LeagueEngineConfig | null
): EngineConfig {
  const base = DEFAULT_ENGINE_CONFIG
  if (!dbConfig) return base

  return {
    ...base,

    minutes_factor: {
      threshold: dbConfig.minutes_factor_threshold,
      partial:   dbConfig.minutes_factor_partial,
      full:      dbConfig.minutes_factor_full,
    },

    role_multiplier: {
      GK:  dbConfig.role_multiplier_gk,
      DEF: dbConfig.role_multiplier_def,
      MID: dbConfig.role_multiplier_mid,
      ATT: dbConfig.role_multiplier_att,
    },

    bonus_malus: {
      ...base.bonus_malus,
      goal_by_role: {
        GK:  dbConfig.goal_bonus_gk,
        DEF: dbConfig.goal_bonus_def,
        MID: dbConfig.goal_bonus_mid,
        ATT: dbConfig.goal_bonus_att,
      },
      penalty_scored_discount: dbConfig.penalty_scored_discount,
      brace_bonus:             dbConfig.brace_bonus,
      hat_trick_bonus:         dbConfig.hat_trick_bonus,
      assist:                  dbConfig.assist,
      own_goal:                dbConfig.own_goal,
      yellow_card:             dbConfig.yellow_card,
      red_card:                dbConfig.red_card,
      penalty_missed:          dbConfig.penalty_missed,
      penalty_saved:           dbConfig.penalty_saved,
      clean_sheet_by_role: {
        GK:  dbConfig.clean_sheet_gk,
        DEF: dbConfig.clean_sheet_def,
      },
      clean_sheet_min_minutes:        dbConfig.clean_sheet_min_minutes,
      goals_conceded_by_role: {
        GK:  dbConfig.goals_conceded_gk,
        DEF: dbConfig.goals_conceded_def,
      },
      goals_conceded_def_min_minutes: dbConfig.goals_conceded_def_min_minutes,
    },
  }
}
