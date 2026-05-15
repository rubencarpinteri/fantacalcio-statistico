// ============================================================
// FantaMondiale Statistico — Competition Config (Zod schema)
// ============================================================
// The entire rule engine is driven by a single JSONB document
// stored in fm_competition_config.config. This file defines the
// authoritative shape via Zod.
//
// Every value an admin can tune lives here:
//   * squad & budget defaults
//   * allowed formations
//   * football bonuses/maluses (P/D/C/A)
//   * popularity penalty brackets
//   * MVP bonus brackets
//   * coach tier matrix
//   * tie-breaker order
//   * calculation order (MVP vs penalty)
//   * Engine v2.0 normalization (mean/std/etc.)
//   * BR raw-score → goal thresholds
// ============================================================

import { z } from 'zod'

// ---- shared sub-schemas ------------------------------------

export const fmPlayerRoleSchema = z.enum(['P', 'D', 'C', 'A'])
export type FMPlayerRole = z.infer<typeof fmPlayerRoleSchema>

export const fmTeamTierSchema = z.enum(['tier_1', 'tier_2', 'tier_3', 'tier_4'])
export type FMTeamTier = z.infer<typeof fmTeamTierSchema>

export const fmBudgetModeSchema = z.enum(['fixed', 'reward_leaders', 'comeback'])
export type FMBudgetMode = z.infer<typeof fmBudgetModeSchema>

export const fmCalcOrderSchema = z.enum(['mvp_then_penalty', 'penalty_then_mvp'])
export type FMCalcOrder = z.infer<typeof fmCalcOrderSchema>

export const fmTieBreakerSchema = z.enum([
  'br_points',
  'raw_score',
  'round_wins',
  'fewest_penalties',
  'mvp_bonuses',
  'best_single_round',
])
export type FMTieBreaker = z.infer<typeof fmTieBreakerSchema>

// ---- squad & budget ----------------------------------------

export const fmSquadConfigSchema = z.object({
  pool_size: z.number().int().min(11).max(40),
  starters: z.number().int().min(7).max(11),
  bench: z.number().int().min(0).max(30),
  budget_default: z.number().int().min(50).max(10_000),
})
export type FMSquadConfig = z.infer<typeof fmSquadConfigSchema>

// ---- formations --------------------------------------------

export const fmFormationListSchema = z.array(
  z.string().regex(/^\d-\d-\d$/, 'expected "X-Y-Z" format'),
).min(1)

// ---- football bonuses / maluses ----------------------------

export const fmFootballScoringSchema = z.object({
  // goals split by role of the scorer
  goal: z.object({
    P: z.number(),
    D: z.number(),
    C: z.number(),
    A: z.number(),
  }),
  assist: z.number(),
  // clean sheet for goalkeepers (and optionally defenders)
  clean_sheet: z.object({
    P: z.number(),
    D: z.number(),
    min_minutes: z.number().int().min(0).max(120),
  }),
  // goalkeeper-specific
  penalty_saved: z.number(),
  penalty_missed: z.number(),
  // discipline
  yellow_card: z.number(),
  red_card: z.number(),
  // own goal + conceded
  own_goal: z.number(),
  goal_conceded_P: z.number(),
  // bracket bonuses
  brace_bonus: z.number(),
  hat_trick_bonus: z.number(),
})
export type FMFootballScoring = z.infer<typeof fmFootballScoringSchema>

// ---- popularity penalty + MVP bonus brackets ---------------

export const fmBracketSchema = z.object({
  min_pct: z.number().min(0).max(100),
  max_pct: z.number().min(0).max(100),
  /** Penalty/bonus expressed as a percentage of the player's raw subtotal. */
  pct: z.number(),
})
export type FMBracket = z.infer<typeof fmBracketSchema>

export const fmBracketsSchema = z.array(fmBracketSchema).min(1)

// ---- coach tier matrix -------------------------------------

export const fmCoachTierMatrixSchema = z.object({
  tier_1: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_2: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_3: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
  tier_4: z.object({ win: z.number(), draw: z.number(), loss: z.number() }),
})
export type FMCoachTierMatrix = z.infer<typeof fmCoachTierMatrixSchema>

// ---- Engine v2.0 normalization (WC-tuned) ------------------

export const fmEngineConfigSchema = z.object({
  fotmob_mean: z.number().min(5).max(8),
  fotmob_std: z.number().min(0.2).max(2),
  /** Minutes threshold for partial vs full z weight. */
  minutes_threshold: z.number().int().min(0).max(120),
  minutes_partial: z.number().min(0).max(1),
  minutes_full: z.number().min(0).max(2),
  /** Role multipliers expand/compress the rating signal around target_mean_vote. */
  role_multiplier: z.object({
    P: z.number().min(0).max(3),
    D: z.number().min(0).max(3),
    C: z.number().min(0).max(3),
    A: z.number().min(0).max(3),
  }),
  target_mean_vote: z.number().min(0).max(10),
  target_vote_std: z.number().min(0).max(3),
  voto_base_min: z.number().min(0).max(10),
  voto_base_max: z.number().min(0).max(10),
})
export type FMEngineConfig = z.infer<typeof fmEngineConfigSchema>

// ---- Battle Royale goal thresholds -------------------------

/**
 * Ordered ascending list of raw-score thresholds. A team's
 * goal count is the number of thresholds it meets or exceeds.
 *   thresholds [66, 72, 78, 84, 90, 96, 102] →
 *     score 71.5  → 1 goal
 *     score 78.0  → 3 goals
 *     score 91.2  → 5 goals
 */
export const fmBattleRoyaleSchema = z.object({
  goal_thresholds: z.array(z.number()).min(1),
  /** Win/draw/loss points per BR matchup. */
  win_points: z.number().int().min(0).max(10).default(3),
  draw_points: z.number().int().min(0).max(10).default(1),
  loss_points: z.number().int().min(0).max(10).default(0),
})
export type FMBattleRoyaleConfig = z.infer<typeof fmBattleRoyaleSchema>

// ---- top-level competition config --------------------------

export const fmCompetitionConfigSchema = z.object({
  schema_version: z.literal(1),
  squad: fmSquadConfigSchema,
  formations: fmFormationListSchema,
  football: fmFootballScoringSchema,
  popularity_brackets: fmBracketsSchema,
  mvp_bonus_brackets: fmBracketsSchema,
  coach_tier_matrix: fmCoachTierMatrixSchema,
  tie_breakers: z.array(fmTieBreakerSchema).min(1),
  calc_order: fmCalcOrderSchema,
  engine: fmEngineConfigSchema,
  battle_royale: fmBattleRoyaleSchema,
})
export type FMCompetitionConfig = z.infer<typeof fmCompetitionConfigSchema>

// ---- per-phase overrides -----------------------------------

export const fmPhaseBudgetConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('fixed'),
    budget: z.number().int().min(50).max(10_000),
  }),
  z.object({
    mode: z.literal('reward_leaders'),
    /** Index 0 = 1st place, index N-1 = last place. */
    budget_by_rank: z.array(z.number().int().min(50).max(10_000)).min(1),
  }),
  z.object({
    mode: z.literal('comeback'),
    budget_by_rank: z.array(z.number().int().min(50).max(10_000)).min(1),
  }),
])
export type FMPhaseBudgetConfig = z.infer<typeof fmPhaseBudgetConfigSchema>
