// ============================================================
// domain/engine/v1/recomputeMatchday.ts
// ============================================================
// Pure orchestrator: takes raw matchday data + engine config + result
// rules, produces every downstream artefact (player calcs, team
// totals, competition fixtures + standings) WITHOUT touching the DB.
//
// Used by:
//   - The playground page (live simulation, no persistence)
//   - The /api/recompute-all endpoint (after which the result is
//     persisted in a single transaction)
//
// Pure means:
//   - No Supabase calls
//   - No `revalidatePath`
//   - No `Date.now()` / random
//   - Same input → same output, every time
// ============================================================

import { computeMatchday } from './engine'
import { computeTeamScores } from '@/lib/engine/teamScores'
import { computeRound } from '@/domain/competitions/computeRound'
import type { EngineConfig, EnginePlayerInput, PlayerEngineOutput, PlayerCalculationResult } from './types'
import type { ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { ScoringConfig } from '@/domain/competitions/computeRound'
import type {
  LineupPlayer,
  SlotRoles,
  TeamScoreResult,
  PlayerScoreEntry,
} from '@/lib/engine/teamScores'
import type {
  FixtureInput,
  FixtureResult as CompetitionFixtureResult,
  TeamStandingRow,
} from '@/domain/competitions/computeRound'

// ---- Input shapes ------------------------------------------

/** A single active score override (manager-applied fudge on top of engine output). */
export interface ScoreOverrideInput {
  player_id: string
  override_fantavoto: number
}

/** One competition's slice of the work for this matchday. */
export interface CompetitionRoundInput {
  competition_id: string
  /** Round inside this competition that maps to the matchday being recomputed. */
  round_id: string
  /** All fixtures for the round (5 for Campionato, 45 for Battle Royal). */
  fixtures: FixtureInput[]
  /** Standings carried over from prior rounds (empty array for round 1). */
  priorStandings: TeamStandingRow[]
  /** Optional per-competition override of league result_rules. Falls back to default. */
  scoringOverride?: Partial<ScoringConfig>
  /** Field order for tiebreaker sorting. */
  tiebreakerOrder: string[]
}

/** Everything the orchestrator needs to do its work. */
export interface RecomputeInput {
  engineConfig: EngineConfig
  resultRules: ResultRulesConfig
  /** Raw player stats fed to the engine. */
  playerStats: EnginePlayerInput[]
  /** Active overrides keyed by player_id. */
  overrides: ScoreOverrideInput[]
  /** Lineup roster for this matchday, derived from current pointers. */
  lineupPlayers: LineupPlayer[]
  /** submission_id → team_id map (one entry per submission referenced in lineupPlayers). */
  submissionTeamMap: Map<string, string>
  /** slot_id → { native, extended } role lists. */
  slotRolesMap: Map<string, SlotRoles>
  /** Optional rounding to apply to fantavoto values (mirrors leagues.display_rounding). */
  applyDisplayRounding?: (value: number) => number
  /** Per-active-competition slice. Empty for matchdays with no active competitions. */
  competitions: CompetitionRoundInput[]
}

// ---- Output shapes -----------------------------------------

/** Player-level engine output with override flag attached. */
export interface PlayerCalcArtefact {
  output: PlayerEngineOutput
  is_override: boolean
  override_player_id_match: string | null
  /** Final fantavoto after override (null for skipped/NV). */
  effective_fantavoto: number | null
}

export interface CompetitionRoundResult {
  competition_id: string
  round_id: string
  fixtures: CompetitionFixtureResult[]
  standings: TeamStandingRow[]
}

export interface RecomputeOutput {
  /** Per-player engine results with override status. */
  playerCalculations: PlayerCalcArtefact[]
  /** Team totals after bench substitution. */
  teamScores: TeamScoreResult[]
  /** Per-player team-side breakdown (starter/bench/sub status). */
  playerScores: PlayerScoreEntry[]
  /** Per-competition fixture + standings results. */
  competitionResults: CompetitionRoundResult[]
}

// ---- Main ---------------------------------------------------

export function recomputeMatchday(input: RecomputeInput): RecomputeOutput {
  // 1. Run the engine on every player
  const engineResult = computeMatchday(input.playerStats, input.engineConfig)

  // 2. Apply active overrides to per-player fantavoto
  const overrideMap = new Map(input.overrides.map((o) => [o.player_id, o.override_fantavoto]))
  const playerCalculations: PlayerCalcArtefact[] = engineResult.player_results.map((output) => {
    const ov = overrideMap.get(output.player_id)
    if (output.kind === 'skipped') {
      // NV players ignore overrides — reflect that explicitly.
      return {
        output,
        is_override: false,
        override_player_id_match: null,
        effective_fantavoto: null,
      }
    }
    if (ov !== undefined) {
      const overridden = applyDisplay(ov, input.applyDisplayRounding)
      return {
        output: { ...output, fantavoto: overridden } as PlayerCalculationResult,
        is_override: true,
        override_player_id_match: output.player_id,
        effective_fantavoto: overridden,
      }
    }
    const final = applyDisplay(output.fantavoto, input.applyDisplayRounding)
    return {
      output: { ...output, fantavoto: final } as PlayerCalculationResult,
      is_override: false,
      override_player_id_match: null,
      effective_fantavoto: final,
    }
  })

  // 3. Build fantaVotoMap (player_id → effective fantavoto, null for NV)
  const fantaVotoMap = new Map<string, number | null>()
  for (const pc of playerCalculations) {
    fantaVotoMap.set(pc.output.player_id, pc.effective_fantavoto)
  }

  // 4. Aggregate team totals via bench substitution
  const { teamScores, playerScores } = computeTeamScores({
    lineupPlayers: input.lineupPlayers,
    submissionTeamMap: input.submissionTeamMap,
    slotRolesMap: input.slotRolesMap,
    fantaVotoMap,
  })

  // 5. Build team_id → total fantavoto map for competition computation
  const teamFantavotoMap = new Map<string, number>()
  for (const ts of teamScores) {
    teamFantavotoMap.set(ts.team_id, ts.total_fantavoto)
  }

  // 6. Compute each active competition's round
  const competitionResults: CompetitionRoundResult[] = input.competitions.map((comp) => {
    const cfg: ScoringConfig = {
      method: 'goal_thresholds',
      thresholds: input.resultRules.thresholds,
      smoothing: input.resultRules.smoothing,
      points: input.resultRules.points,
      ...(comp.scoringOverride ?? {}),
    }
    const round = computeRound(
      comp.fixtures,
      teamFantavotoMap,
      cfg,
      comp.priorStandings,
      comp.tiebreakerOrder
    )
    return {
      competition_id: comp.competition_id,
      round_id: comp.round_id,
      fixtures: round.fixtures,
      standings: round.standings,
    }
  })

  return { playerCalculations, teamScores, playerScores, competitionResults }
}

// ---- Helpers ------------------------------------------------

function applyDisplay(value: number, fn: ((v: number) => number) | undefined): number {
  return fn ? fn(value) : value
}
