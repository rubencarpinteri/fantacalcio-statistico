// ============================================================
// stats/schema.ts — Zod schema for player_match_stats rows.
//
// Extracted from actions.ts so it can be imported by both the
// server actions file ('use server') and client components
// without triggering Next.js's "Server Actions must be async
// functions" lint on non-async exports in 'use server' modules.
// ============================================================

import { z } from 'zod'

const coerceInt = (min = 0) =>
  z.union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? 0 : Number(v)))
    .pipe(z.number().int().min(min))

// Provider-specific float coercers with correct bounds:
//   SofaScore  1.0 – 10.0
//   WhoScored  1.0 – 10.0
//   FotMob     0.0 – 10.0
const coerceFloat = (min: number, max = 10) =>
  z.union([z.string(), z.number(), z.null()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
    .pipe(z.number().min(min).max(max).nullable())

export const statRowSchema = z.object({
  player_id: z.string().uuid(),

  minutes_played:        coerceInt(0),
  rating_class_override: z.enum(['GK', 'DEF', 'MID', 'ATT']).nullable().default(null),

  // Source ratings — null means not yet entered
  sofascore_rating:  coerceFloat(1.0),   // SofaScore: 1.0 – 10.0
  whoscored_rating:  coerceFloat(1.0),   // WhoScored: 1.0 – 10.0
  fotmob_rating:     coerceFloat(0.0),   // FotMob:    0.0 – 10.0

  // Defensive / GK
  tackles_won:           coerceInt(),
  interceptions:         coerceInt(),
  clearances:            coerceInt(),
  blocks:                coerceInt(),
  aerial_duels_won:      coerceInt(),
  dribbled_past:         coerceInt(),
  saves:                 coerceInt(),
  goals_conceded:        coerceInt(),
  error_leading_to_goal: coerceInt(),
  penalties_saved:       coerceInt(),

  // Events
  goals_scored:     coerceInt(),
  assists:          coerceInt(),
  own_goals:        coerceInt(),
  yellow_cards:     z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().min(0).max(1)),
  red_cards:        z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().min(0).max(1)),
  penalties_scored: coerceInt(),
  penalties_missed: coerceInt(),
  clean_sheet:      z.boolean().default(false),

  // Advanced (optional, nullable)
  key_passes:           z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().int().min(0).nullable()),
  expected_assists:     z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().min(0).nullable()),
  successful_dribbles:  z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().int().min(0).nullable()),
  dribble_success_rate: z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().min(0).max(100).nullable()),
  completed_passes:     z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().int().min(0).nullable()),
  pass_accuracy:        z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().min(0).max(100).nullable()),
  final_third_passes:   z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().int().min(0).nullable()),
  progressive_passes:   z.union([z.string(), z.number(), z.null()]).transform((v) => v === '' || v == null ? null : Number(v)).pipe(z.number().int().min(0).nullable()),

  is_provisional:     z.boolean().default(false),
  has_decisive_event: z.boolean().default(false),
})

export type StatRowInput = z.input<typeof statRowSchema>
export type StatRow = z.output<typeof statRowSchema>
