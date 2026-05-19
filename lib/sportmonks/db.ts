/**
 * SportMonks ↔ Supabase glue.
 *
 * All writes go through the service-role client (RLS bypassed).
 * The cron routes are the only callers; UI code should never
 * touch these helpers directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import type { ParsedFixture, ParsedPlayerStat, SMFixture } from './types'

type DB = SupabaseClient<Database>

// ============================================================
// Active leagues
// ============================================================

export type ActiveLeagueRef = {
  /** Which product owns this row: 'serie_a' (leagues table) or 'fm' (fm_competition table). */
  product: 'serie_a' | 'fm'
  /** PK in the owning table. */
  owner_id: string
  /** SportMonks league ID to fetch. */
  sportmonks_league_id: number
}

export async function listActiveLeagueRefs(db: DB): Promise<ActiveLeagueRef[]> {
  const refs: ActiveLeagueRef[] = []

  const { data: leagues } = await db
    .from('leagues')
    .select('id, active_sportmonks_league_id')
    .not('active_sportmonks_league_id', 'is', null)
  for (const l of leagues ?? []) {
    if (l.active_sportmonks_league_id != null) {
      refs.push({ product: 'serie_a', owner_id: l.id, sportmonks_league_id: l.active_sportmonks_league_id })
    }
  }

  const { data: comps } = await db
    .from('fm_competition')
    .select('id, active_sportmonks_league_id')
    .not('active_sportmonks_league_id', 'is', null)
  for (const c of comps ?? []) {
    if (c.active_sportmonks_league_id != null) {
      refs.push({ product: 'fm', owner_id: c.id, sportmonks_league_id: c.active_sportmonks_league_id })
    }
  }

  return refs
}

// ============================================================
// Fixture cache upsert
// ============================================================

function smFixtureToCacheRow(fx: SMFixture) {
  const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
  const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
  const kickoff = fx.starting_at_timestamp
    ? new Date(fx.starting_at_timestamp * 1000).toISOString()
    : new Date(fx.starting_at + 'Z').toISOString()
  return {
    sportmonks_fixture_id: fx.id,
    league_id: fx.league_id,
    season_id: fx.season_id,
    stage_id: fx.stage_id ?? null,
    round_id: fx.round_id ?? null,
    home_team_id: home?.id ?? null,
    away_team_id: away?.id ?? null,
    home_team_name: home?.name ?? null,
    away_team_name: away?.name ?? null,
    kickoff_at: kickoff,
    state_id: fx.state_id,
    state_name: fx.state?.name ?? null,
    length_minutes: fx.length,
    raw_payload: fx as unknown as Json,
    fetched_at: new Date().toISOString(),
  }
}

export async function upsertFixtureCache(db: DB, fixtures: SMFixture[]): Promise<number> {
  if (!fixtures.length) return 0
  const rows = fixtures.map(smFixtureToCacheRow)
  const { error } = await db.from('sportmonks_fixtures').upsert(rows, { onConflict: 'sportmonks_fixture_id' })
  if (error) throw new Error(`upsertFixtureCache: ${error.message}`)
  return rows.length
}

// ============================================================
// FantaMondiale auto-create: rounds + matches from fixtures
// ============================================================

/**
 * For a single FM competition, ensure each unique SportMonks round_id
 * has a corresponding fm_scoring_round, and each fixture has a
 * corresponding fm_real_match. Idempotent.
 *
 * Phase selection: uses the highest display_order non-archived phase
 * of the competition. The admin can re-parent rounds via the UI.
 */
export async function autoCreateFMRoundsAndMatches(
  db: DB,
  competition_id: string,
  fixtures: SMFixture[],
): Promise<{ rounds_created: number; matches_created: number }> {
  if (!fixtures.length) return { rounds_created: 0, matches_created: 0 }

  // Pick a target phase: highest display_order, status != 'archived'.
  const { data: phases } = await db
    .from('fm_phase')
    .select('id, display_order, status')
    .eq('competition_id', competition_id)
    .neq('status', 'completed')
    .order('display_order', { ascending: false })
    .limit(1)
  const phase = phases?.[0]
  if (!phase) {
    return { rounds_created: 0, matches_created: 0 }
  }

  // Resolve team UUIDs by sportmonks_team_id
  const teamSmIds = new Set<number>()
  for (const fx of fixtures) {
    const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
    const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
    if (home?.id) teamSmIds.add(home.id)
    if (away?.id) teamSmIds.add(away.id)
  }
  const { data: teamRows } = await db
    .from('fm_national_team')
    .select('id, sportmonks_team_id')
    .eq('competition_id', competition_id)
    .in('sportmonks_team_id', Array.from(teamSmIds))
  const teamSmToUuid = new Map<number, string>()
  for (const t of teamRows ?? []) {
    if (t.sportmonks_team_id != null) teamSmToUuid.set(t.sportmonks_team_id, t.id)
  }

  // Group fixtures by SportMonks round_id
  const byRound = new Map<number, SMFixture[]>()
  const orphans: SMFixture[] = []
  for (const fx of fixtures) {
    if (fx.round_id == null) {
      orphans.push(fx)
      continue
    }
    const arr = byRound.get(fx.round_id) ?? []
    arr.push(fx)
    byRound.set(fx.round_id, arr)
  }

  let rounds_created = 0
  let matches_created = 0

  for (const [roundId, roundFixtures] of byRound) {
    const earliestKickoff = roundFixtures
      .map((f) => f.starting_at_timestamp ? new Date(f.starting_at_timestamp * 1000) : new Date(f.starting_at + 'Z'))
      .sort((a, b) => a.getTime() - b.getTime())[0]
    if (!earliestKickoff) continue
    const lockAt = new Date(earliestKickoff.getTime() - 5 * 60 * 1000).toISOString()
    const roundName = `Round ${roundId}`

    // Upsert by (competition_id, name) — there is no SM round_id column on
    // fm_scoring_round; we encode it in the name. Idempotent because name
    // is stable per SportMonks round.
    const { data: existing } = await db
      .from('fm_scoring_round')
      .select('id')
      .eq('competition_id', competition_id)
      .eq('name', roundName)
      .maybeSingle()

    let scoringRoundId = existing?.id
    if (!scoringRoundId) {
      const { data: inserted, error } = await db
        .from('fm_scoring_round')
        .insert({
          competition_id,
          phase_id: phase.id,
          name: roundName,
          display_order: roundId,
          lock_at: lockAt,
          status: 'draft',
        })
        .select('id')
        .single()
      if (error) throw new Error(`autoCreateFMRounds: insert round ${roundName}: ${error.message}`)
      scoringRoundId = inserted.id
      rounds_created += 1
    }

    // Upsert fm_real_match rows
    for (const fx of roundFixtures) {
      const home = fx.participants?.find((p) => p.meta?.location === 'home') ?? fx.participants?.[0]
      const away = fx.participants?.find((p) => p.meta?.location === 'away') ?? fx.participants?.[1]
      if (!home?.id || !away?.id) continue
      const homeUuid = teamSmToUuid.get(home.id)
      const awayUuid = teamSmToUuid.get(away.id)
      if (!homeUuid || !awayUuid) continue

      const { data: existingMatch } = await db
        .from('fm_real_match')
        .select('id')
        .eq('sportmonks_fixture_id', fx.id)
        .maybeSingle()
      if (existingMatch) continue

      const kickoff = fx.starting_at_timestamp
        ? new Date(fx.starting_at_timestamp * 1000).toISOString()
        : new Date(fx.starting_at + 'Z').toISOString()
      const { error } = await db.from('fm_real_match').insert({
        scoring_round_id: scoringRoundId,
        home_team_id: homeUuid,
        away_team_id: awayUuid,
        kickoff_at: kickoff,
        status: 'scheduled',
        sportmonks_fixture_id: fx.id,
      })
      if (error) throw new Error(`autoCreateFMMatches: insert match ${fx.id}: ${error.message}`)
      matches_created += 1
    }
  }

  if (orphans.length) {
    console.warn(`[autoCreateFMRoundsAndMatches] ${orphans.length} fixtures with no round_id, skipping`)
  }

  return { rounds_created, matches_created }
}

// ============================================================
// FantaMondiale: upsert parsed player stats for one fixture
// ============================================================

export async function upsertFMPlayerStats(
  db: DB,
  competition_id: string,
  parsed: ParsedFixture,
): Promise<{ stats_upserted: number; match_updated: boolean }> {
  // 1. Resolve fm_real_match by sportmonks_fixture_id
  const { data: match } = await db
    .from('fm_real_match')
    .select('id, status')
    .eq('sportmonks_fixture_id', parsed.sportmonks_fixture_id)
    .maybeSingle()
  if (!match) return { stats_upserted: 0, match_updated: false }

  // 2. Update score + status on the match
  const matchStatus: 'scheduled' | 'in_progress' | 'finished' = parsed.state_id === 5
    ? 'finished'
    : parsed.state_id === 1
      ? 'scheduled'
      : 'in_progress'
  await db.from('fm_real_match').update({
    home_score: parsed.home_score,
    away_score: parsed.away_score,
    status: matchStatus,
  }).eq('id', match.id)

  // 3. Resolve fm_player UUIDs by sportmonks_player_id (one query)
  const smPlayerIds = parsed.players.map((p) => p.sportmonks_player_id)
  if (!smPlayerIds.length) return { stats_upserted: 0, match_updated: true }

  const { data: playerRows } = await db
    .from('fm_player')
    .select('id, sportmonks_player_id')
    .eq('competition_id', competition_id)
    .in('sportmonks_player_id', smPlayerIds)
  const smToUuid = new Map<number, string>()
  for (const r of playerRows ?? []) {
    if (r.sportmonks_player_id != null) smToUuid.set(r.sportmonks_player_id, r.id)
  }

  // 4. Upsert fm_player_match_stats
  const rows: Array<Database['public']['Tables']['fm_player_match_stats']['Insert']> = []
  for (const p of parsed.players) {
    const uuid = smToUuid.get(p.sportmonks_player_id)
    if (!uuid) continue  // unknown player (squad not synced) — skip
    rows.push({
      real_match_id: match.id,
      player_id: uuid,
      minutes_played: p.minutes_played,
      fotmob_rating: p.rating,  // legacy column repurposed — column rename will happen in cleanup migration
      goals: p.goals_scored,
      assists: p.assists,
      yellow_cards: p.yellow_cards,
      red_cards: p.red_cards,
      penalties_saved: p.penalties_saved,
      penalties_missed: p.penalties_missed,
      own_goals: p.own_goals,
      clean_sheet: p.clean_sheet,
      goals_conceded: p.goals_conceded,
      is_mvp: p.is_mvp,
      raw_payload: { source: 'sportmonks', stats: p.raw_stats } as unknown as Json,
    })
  }

  if (!rows.length) return { stats_upserted: 0, match_updated: true }

  const { error } = await db
    .from('fm_player_match_stats')
    .upsert(rows, { onConflict: 'real_match_id,player_id' })
  if (error) throw new Error(`upsertFMPlayerStats: ${error.message}`)

  return { stats_upserted: rows.length, match_updated: true }
}

// ============================================================
// Pre-flight check: is anything live-window right now?
// ============================================================

export async function hasFixturesInLiveWindow(db: DB): Promise<boolean> {
  const now = new Date()
  const from = new Date(now.getTime() - 130 * 60 * 1000).toISOString()
  const to = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
  const { count } = await db
    .from('sportmonks_fixtures')
    .select('sportmonks_fixture_id', { count: 'exact', head: true })
    .gte('kickoff_at', from)
    .lte('kickoff_at', to)
  return (count ?? 0) > 0
}

// Suppress unused warning — kept for future Serie A integration
export type _ParsedPlayerStatUnused = ParsedPlayerStat
