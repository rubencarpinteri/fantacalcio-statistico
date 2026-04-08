// ============================================================
// Fantacalcio Statistico — Rating Engine v1.2 — Config
// ============================================================
// This is the authoritative source-of-truth for the v1.2 engine.
// Values match the approved scoring spec exactly.
// Do not change constants here without updating engine_version.
//
// Key changes from v1.1:
//   - SofaScore re-integrated via browser-fetch of /api/v1/fantasy/event/{id}
//     (CORS: *, ID-based matching via serie_a_players.sofascore_id chain)
//   - Dual-source weighted average: FotMob 55%, SofaScore 45%
//   - No shrink factor when only one source available (use directly)
//   - SofaScore normalization: mean=6.7, std=0.65
//   - Engine version bumped from v1.1 → v1.2
// ============================================================

import type { EngineConfig } from './types'
import type { LeagueEngineConfig } from '@/types/database.types'

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engine_version: 'v1.2',

  /** Baseline used only for exception paths (decisive event, no ratings). */
  base_score: 6.0,

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
   * SofaScore rating normalization.
   * mean = 6.7: SofaScore's "average" player rating.
   * std  = 0.65: typical spread of SofaScore ratings across Serie A.
   */
  /**
   * SofaScore rating normalization.
   * mean = 6.6: same baseline as FotMob (both platforms use 6.0–10.0 scale with ~6.6 average).
   * std  = 0.65: SofaScore's spread is slightly narrower than FotMob.
   * Both values are configurable per league via league_engine_config.
   */
  sofascore_normalization: {
    mean: 6.6,
    std:  0.65,
  },

  /**
   * Weight of FotMob in the dual-source weighted average (0–1).
   * SofaScore weight = 1 - fotmob_weight = 0.45.
   * When only one source is available, it receives full weight (no shrink).
   * Configurable per league via league_engine_config.
   */
  fotmob_weight: 0.55,

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
  voto_base_cap_max: 10.0,

  /**
   * Target distribution parameters (Step 2 of calibration pipeline).
   *
   * target_mean_vote = 6.00: a z-score of 0 → vote 6.00 (sufficiency threshold)
   * target_vote_std  = 0.75: each ±1σ shifts the vote by 0.75 points
   *
   * Example (MID, full minutes, no B/M):
   *   z = +1.00 → b0 = 6.00 + 0.75 = 6.75 → b1 = 6.00 + 1.00 × 0.75 = 6.75
   *   z = -1.00 → b0 = 6.00 − 0.75 = 5.25 → b1 = 5.25
   */
  target_mean_vote: 6.00,
  target_vote_std:  0.75,
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
      threshold: dbConfig.minutes_factor_threshold ?? base.minutes_factor.threshold,
      partial:   dbConfig.minutes_factor_partial   ?? base.minutes_factor.partial,
      full:      dbConfig.minutes_factor_full       ?? base.minutes_factor.full,
    },

    role_multiplier: {
      GK:  dbConfig.role_multiplier_gk  ?? base.role_multiplier.GK,
      DEF: dbConfig.role_multiplier_def ?? base.role_multiplier.DEF,
      MID: dbConfig.role_multiplier_mid ?? base.role_multiplier.MID,
      ATT: dbConfig.role_multiplier_att ?? base.role_multiplier.ATT,
    },

    source_normalization: {
      mean: dbConfig.fotmob_mean    ?? base.source_normalization.mean,
      std:  dbConfig.fotmob_std     ?? base.source_normalization.std,
    },

    sofascore_normalization: {
      mean: dbConfig.sofascore_mean ?? base.sofascore_normalization.mean,
      std:  dbConfig.sofascore_std  ?? base.sofascore_normalization.std,
    },

    fotmob_weight: dbConfig.fotmob_weight ?? base.fotmob_weight,

    target_mean_vote: dbConfig.target_mean_vote ?? base.target_mean_vote,
    target_vote_std:  dbConfig.target_vote_std  ?? base.target_vote_std,

    voto_base_cap_min: dbConfig.voto_base_cap_min ?? base.voto_base_cap_min,
    voto_base_cap_max: dbConfig.voto_base_cap_max ?? base.voto_base_cap_max,

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
