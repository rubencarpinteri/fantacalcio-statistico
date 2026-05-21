// ============================================================
// lib/playground/loadSnapshot.ts
// ============================================================
// Loads everything needed to recompute a matchday into memory.
// Returns the inputs in the shape recomputeMatchday() expects,
// plus the live DB engine_config and result_rules so the API
// layer can apply user overrides on top.
//
// Pure read-only: never writes.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, RatingClass } from '@/types/database.types'
import type { EnginePlayerInput } from '@/domain/engine/v1/types'
import type { LineupPlayer, SlotRoles } from '@/lib/engine/teamScores'
import type { ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { ScoreOverrideInput } from '@/domain/engine/v1/recomputeMatchday'
import { DEFAULT_RESULT_RULES } from '@/domain/competitions/resultRules'

type Supabase = SupabaseClient<Database>

export interface MatchdaySnapshot {
  /** League's stored result_rules (or default if missing). */
  baseResultRules: ResultRulesConfig
  /** Raw DB league_engine_config row — pass to buildEngineConfig() after merging overrides. */
  baseEngineConfigRow: Database['public']['Tables']['league_engine_config']['Row'] | null
  playerStats: EnginePlayerInput[]
  overrides: ScoreOverrideInput[]
  lineupPlayers: LineupPlayer[]
  submissionTeamMap: Map<string, string>
  slotRolesMap: Map<string, SlotRoles>
  /** Team-id list for the league (used for Battle Royale pairing generation). */
  teamIds: string[]
  /** team_id → display name. */
  teamNames: Map<string, string>
  /** Existing campionato fixtures for the round mapped to this matchday, if any. */
  campionatoFixtures: Array<{
    competition_id: string
    round_id: string
    home_team_id: string
    away_team_id: string
    fixture_id: string
  }>
}

export async function loadMatchdaySnapshot(
  supabase: Supabase,
  matchdayId: string,
  leagueId: string
): Promise<{ snapshot: MatchdaySnapshot | null; error: string | null }> {
  // 1. League — for result_rules.
  // result_rules is added in migration 034 — not yet in generated DB types.
  // Cast through unknown to access it; regenerate types post-deploy to remove cast.
  const { data: leagueRaw } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .maybeSingle()

  const league = leagueRaw as unknown as { result_rules?: unknown } | null
  const baseResultRules = parseResultRules(league?.result_rules)

  // 2. Engine config row
  const { data: engineConfigRow } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle()

  // 3. Active league players (for rating_class lookup)
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, rating_class')
    .eq('league_id', leagueId)
    .eq('is_active', true)

  if (!leaguePlayers?.length) {
    return { snapshot: null, error: 'Nessun giocatore attivo nella lega.' }
  }

  const ratingClassMap = new Map(
    leaguePlayers.map((p) => [p.id, p.rating_class as RatingClass])
  )

  // 4. Stored player_match_stats for the matchday
  const { data: dbStats } = await supabase
    .from('player_match_stats')
    .select(
      `id, player_id, rating_class_override,
       rating, minutes_played,
       goals_scored, assists, own_goals, yellow_cards, red_cards,
       penalties_scored, penalties_missed, penalties_saved,
       clean_sheet, goals_conceded, is_provisional, is_mvp`
    )
    .eq('matchday_id', matchdayId)

  // 4b. Ownership snapshot (empty if not yet frozen).
  const { data: dbOwnership } = await supabase
    .from('matchday_player_ownership')
    .select('player_id, ownership_pct')
    .eq('matchday_id', matchdayId)
  const ownershipByPlayerId = new Map<string, number>(
    (dbOwnership ?? []).map((r) => [r.player_id, Number(r.ownership_pct)])
  )

  const playerStats: EnginePlayerInput[] = (dbStats ?? []).map((s) => {
    const rc =
      (s.rating_class_override as RatingClass | null) ??
      ratingClassMap.get(s.player_id) ??
      'MID'
    return {
      player_id:        s.player_id,
      stats_id:         s.id,
      rating_class:     rc,
      minutes_played:   s.minutes_played,
      is_provisional:   s.is_provisional,
      rating:    s.rating,
      goals_scored:     s.goals_scored,
      assists:          s.assists,
      own_goals:        s.own_goals,
      yellow_cards:     s.yellow_cards,
      red_cards:        s.red_cards,
      penalties_scored: s.penalties_scored,
      penalties_missed: s.penalties_missed,
      penalties_saved:  s.penalties_saved,
      clean_sheet:      s.clean_sheet,
      goals_conceded:   s.goals_conceded,
      is_mvp:           s.is_mvp,
      ownership_pct:    ownershipByPlayerId.get(s.player_id) ?? 0,
    }
  })

  // 5. Active overrides
  const { data: dbOverrides } = await supabase
    .from('score_overrides')
    .select('player_id, override_fantavoto')
    .eq('matchday_id', matchdayId)
    .is('removed_at', null)

  const overrides: ScoreOverrideInput[] = (dbOverrides ?? []).map((o) => ({
    player_id: o.player_id,
    override_fantavoto: o.override_fantavoto,
  }))

  // 6. Lineup pointers + submission players + slot roles
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('team_id, submission_id')
    .eq('matchday_id', matchdayId)

  const submissionIds = (pointers ?? []).map((p) => p.submission_id)

  const { data: lineupPlayersRaw } =
    submissionIds.length > 0
      ? await supabase
          .from('lineup_submission_players')
          .select(
            'submission_id, player_id, slot_id, is_bench, bench_order, assigned_mantra_role'
          )
          .in('submission_id', submissionIds)
      : { data: [] }

  const lineupPlayers: LineupPlayer[] = (lineupPlayersRaw ?? []).map((lp) => ({
    submission_id: lp.submission_id,
    player_id: lp.player_id,
    slot_id: lp.slot_id,
    is_bench: lp.is_bench,
    bench_order: lp.bench_order,
    assigned_mantra_role: lp.assigned_mantra_role,
  }))

  const submissionTeamMap = new Map(
    (pointers ?? []).map((p) => [p.submission_id, p.team_id])
  )

  const starterSlotIds = [
    ...new Set(
      lineupPlayers
        .filter((lp) => !lp.is_bench && lp.slot_id)
        .map((lp) => lp.slot_id as string)
    ),
  ]

  const { data: formationSlots } =
    starterSlotIds.length > 0
      ? await supabase
          .from('formation_slots')
          .select('id, allowed_mantra_roles, extended_mantra_roles')
          .in('id', starterSlotIds)
      : { data: [] }

  const slotRolesMap = new Map<string, SlotRoles>(
    (formationSlots ?? []).map((s) => [
      s.id,
      {
        native: s.allowed_mantra_roles ?? [],
        extended: s.extended_mantra_roles ?? [],
      },
    ])
  )

  // 7. League teams (for BR pairing)
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .order('name', { ascending: true })

  const teamIds = (teams ?? []).map((t) => t.id)
  const teamNames = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // 8. Campionato fixtures for the round mapped to this matchday
  const { data: campionatoFixtures } = await supabase
    .from('competition_fixtures')
    .select(
      `id, competition_id, round_id, home_team_id, away_team_id,
       competition_rounds!inner(matchday_id),
       competitions!inner(type, status)`
    )
    .eq('competition_rounds.matchday_id', matchdayId)
    .eq('competitions.type', 'campionato')
    .eq('competitions.status', 'active')

  const campionatoSlim = (campionatoFixtures ?? []).map((f) => ({
    competition_id: f.competition_id,
    round_id: f.round_id,
    home_team_id: f.home_team_id,
    away_team_id: f.away_team_id,
    fixture_id: f.id,
  }))

  return {
    snapshot: {
      baseResultRules,
      baseEngineConfigRow: engineConfigRow ?? null,
      playerStats,
      overrides,
      lineupPlayers,
      submissionTeamMap,
      slotRolesMap,
      teamIds,
      teamNames,
      campionatoFixtures: campionatoSlim,
    },
    error: null,
  }
}

// ---- Helpers ------------------------------------------------

function parseResultRules(raw: unknown): ResultRulesConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_RESULT_RULES
  const r = raw as Partial<ResultRulesConfig>
  return {
    thresholds: Array.isArray(r.thresholds) ? r.thresholds : DEFAULT_RESULT_RULES.thresholds,
    smoothing: r.smoothing ?? DEFAULT_RESULT_RULES.smoothing,
    points: r.points ?? DEFAULT_RESULT_RULES.points,
  }
}
