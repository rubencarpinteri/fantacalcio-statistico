// ============================================================
// Fantacalcio Statistico — Rating Engine v3.0 — Config
// ============================================================
// "Pivot + Bonus" engine. Two-step calculation:
//
//   1. voto_base = pivot_vote + slope × (rating − pivot_rating)
//      with slope chosen so SportMonks 10 maps to voto 10.
//   2. fantavoto = clamp(voto_base + bonus_malus, 1, 10)
//
// Anchors (SportMonks → fantavoto):
//   6.50 (kickoff baseline)  → 6.00 (Italian "sufficienza")
//   10.00 (max SportMonks)   → 10.00 (max voto)
//   slope = (10 − 6) / (10 − 6.50) = 1.1429
//
// Source: https://www.sportmonks.com/blogs/player-ratings
//   - Baseline rating: 6.5
//   - Mode (typical 90-min player): 6.45
//   - Mean (all ratings): 6.72
//   - Range: 3.0 – 10.0
// ============================================================

import type { EngineConfig } from './types'
import type { LeagueEngineConfig } from '@/types/database.types'

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  engine_version: 'v3.0',

  /**
   * Pivot anchor: SportMonks 6.50 (kickoff baseline) → voto 6.00.
   * Slope is derived from this pivot and the (10, 10) anchor.
   */
  pivot_rating: 6.50,
  pivot_vote:   6.00,

  /** Hard scale bounds for the fantavoto. */
  voto_min: 1.0,
  voto_max: 10.0,

  /**
   * Minutes gate. Below this, the rating is discarded and the player
   * is treated as "s.v." (no voto) — only bonus/malus contributes if
   * a decisive event happened. ≥ this, the rating is used as-is.
   */
  minutes_min_for_voto: 15,

  /** Baseline used when a decisive event fires for a <15-min player. */
  base_score: 6.0,

  bonus_malus: {
    goal_by_role: {
      GK:  4.0,
      DEF: 2.8,
      MID: 2.2,
      ATT: 1.8,
    },
    penalty_scored_discount: 0.3,

    assist:         1.0,
    own_goal:      -1.5,
    yellow_card:   -0.3,
    red_card:      -1.5,
    penalty_missed: -1.5,
    penalty_saved:  2.0,

    clean_sheet_by_role: {
      GK:  0.8,
      DEF: 0.5,
    },
    clean_sheet_min_minutes: 60,

    goals_conceded_by_role: {
      GK:  -0.4,
      DEF: -0.15,
    },
    goals_conceded_def_min_minutes: 60,

    brace_bonus:    0.5,
    hat_trick_bonus: 1.0,
  },
}

/**
 * Slope of the rating → voto_base line, derived from the pivot and
 * the (voto_max, voto_max) upper anchor.
 *
 * With defaults: (10 − 6) / (10 − 6.5) = 1.1429
 */
export function deriveSlope(cfg: EngineConfig): number {
  const denom = cfg.voto_max - cfg.pivot_rating
  if (denom <= 0) return 1 // defensive — should never happen with valid config
  return (cfg.voto_max - cfg.pivot_vote) / denom
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

    pivot_rating: dbConfig.pivot_rating ?? base.pivot_rating,
    pivot_vote:   dbConfig.pivot_vote   ?? base.pivot_vote,

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
