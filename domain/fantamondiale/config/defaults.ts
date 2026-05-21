// ============================================================
// FantaMondiale Statistico — Default Competition Config
// ============================================================
// Defaults for the 2026 WC competition.
//
// Player rating engine is the v3.0 "Pivot + Bonus" engine,
// aligned 1:1 with the Serie A engine: SportMonks 6.50 (kickoff
// baseline) → voto 6.00 (Italian sufficienza); (10, 10) anchor
// implicit. The < 15 min rule with decisive-event exception is
// identical.
//
// FM-specific game mechanics (MVP brackets, popularity penalties,
// coach tier matrix, Battle Royale thresholds) stay separate and
// apply after the rating → voto_base step.
// ============================================================

import type {
  FMCompetitionConfig,
  FMBracket,
  FMEngineConfig,
} from './schema'

const DEFAULT_ENGINE: FMEngineConfig = {
  pivot_rating: 6.50,
  pivot_vote:   6.00,
  voto_min:     1.0,
  voto_max:     10.0,
  minutes_min_for_voto: 15,
  base_score:   6.0,
}

// 5 brackets, ascending. Larger penalty = more popular pick.
const DEFAULT_POPULARITY_BRACKETS: FMBracket[] = [
  { min_pct:  0, max_pct: 10, pct:  0 },
  { min_pct: 11, max_pct: 30, pct: 15 },
  { min_pct: 31, max_pct: 60, pct: 30 },
  { min_pct: 61, max_pct: 80, pct: 60 },
  { min_pct: 81, max_pct: 100, pct: 80 },
]

// Inverse: rarer MVP picks get bigger bonuses.
const DEFAULT_MVP_BRACKETS: FMBracket[] = [
  { min_pct:  0, max_pct: 10, pct: 80 },
  { min_pct: 11, max_pct: 30, pct: 60 },
  { min_pct: 31, max_pct: 60, pct: 40 },
  { min_pct: 61, max_pct: 80, pct: 30 },
  { min_pct: 81, max_pct: 100, pct: 10 },
]

export const DEFAULT_FM_CONFIG: FMCompetitionConfig = {
  schema_version: 1,

  squad: {
    pool_size: 25,
    starters: 11,
    bench: 14,
    budget_default: 500,
  },

  formations: [
    '3-4-3',
    '3-5-2',
    '4-3-3',
    '4-4-2',
    '4-5-1',
    '5-3-2',
    '5-4-1',
  ],

  football: {
    goal: { P: 6, D: 3.5, C: 3, A: 3 },
    assist: 1,
    clean_sheet: { P: 1, D: 0, min_minutes: 60 },
    penalty_saved: 3,
    penalty_missed: -3,
    yellow_card: -0.5,
    red_card: -1,
    own_goal: -1,
    goal_conceded_P: -1,
    brace_bonus: 0.5,
    hat_trick_bonus: 1,
  },

  popularity_brackets: DEFAULT_POPULARITY_BRACKETS,
  mvp_bonus_brackets: DEFAULT_MVP_BRACKETS,

  coach_tier_matrix: {
    tier_1: { win:  1, draw: -1, loss: -3 },
    tier_2: { win:  2, draw:  0, loss: -2 },
    tier_3: { win:  4, draw:  2, loss: -1 },
    tier_4: { win:  6, draw:  3, loss:  0 },
  },

  tie_breakers: [
    'br_points',
    'raw_score',
    'round_wins',
    'fewest_penalties',
    'mvp_bonuses',
    'best_single_round',
  ],

  calc_order: 'mvp_then_penalty',

  engine: DEFAULT_ENGINE,

  battle_royale: {
    // Same threshold structure as Serie A engine: 66 = 1 goal,
    // +6 per additional goal. Tuned for ~25-player squad totals
    // landing in the 50–100 range.
    goal_thresholds: [66, 72, 78, 84, 90, 96, 102, 108],
    win_points: 3,
    draw_points: 1,
    loss_points: 0,
  },
}
