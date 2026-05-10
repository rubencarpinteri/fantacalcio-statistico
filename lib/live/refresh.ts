// ============================================================
// Live refresh core
// ============================================================
// Called by:
//   - the cron endpoint (service-role client, no user session)
//   - the manual "Aggiorna ora" server action (user session)
//
// Strategy:
//   1. Fetch ratings from FotMob for every fixture
//   2. Read existing player_match_stats (manual edits)
//   3. Merge: API values override ratings/events; manual edits preserved
//   4. Run the engine in-memory (no DB writes for stats)
//   5. Apply MASTER bench substitution
//   6. Upsert live_scores + live_player_scores
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { RatingClass } from '@/types/database.types'
import { computeMatchday } from '@/domain/engine/v1/engine'
import { buildEngineConfig } from '@/domain/engine/v1/config'
import { computeTeamScores } from '@/lib/engine/teamScores'
import type { EnginePlayerInput } from '@/domain/engine/v1/types'
import { fetchFotMobMatch } from '@/lib/ratings/fotmob'

type Supabase = SupabaseClient<Database>

// ── External API types ───────────────────────────────────────

type FetchedStat = {
  fotmob_id: number | null
  name: string
  normalized_name: string
  team_label: string
  fotmob_rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  goals_conceded: number
  saves: number
}

function normalizeName(name: string): string {
  return name
    .replace(/[Øø]/g, 'o')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Łł]/g, 'l')
    .replace(/[Ðð]/g, 'd')
    .replace(/ß/g, 'ss')
    .replace(/[ıİ]/g, 'i')
    .replace(/[іІ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── FotMob fetch ─────────────────────────────────────────────
// Delegates to the shared HTML-scraping fetcher in lib/ratings/fotmob.ts.
// FotMob's authenticated /api/data/matchDetails JSON endpoint is no longer
// reachable without a signed x-mas header, so the page-HTML __NEXT_DATA__
// payload is the working source. It is server-rendered per request and
// reflects live in-progress match state, enabling true live polling.

type FotMobStat = {
  fotmob_id: number
  name: string
  team_name: string
  rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  goals_conceded: number
  saves: number
}

type FotMobEvent = {
  type: string
  player_id: number | null
  card: string | null
  own_goal: boolean
  goal_description: string | null
}

async function fetchFotMob(
  matchId: number
): Promise<{ stats: FotMobStat[]; events: FotMobEvent[]; started: boolean; finished: boolean; kickoffAt: string | null } | null> {
  const { data } = await fetchFotMobMatch(matchId)
  if (!data) return null
  const stats: FotMobStat[] = data.stats.map((s) => ({
    fotmob_id: s.fotmob_id,
    name: s.name,
    team_name: s.team_name,
    rating: s.rating,
    minutes_played: s.minutes_played,
    goals_scored: s.goals_scored,
    assists: s.assists,
    goals_conceded: s.goals_conceded,
    saves: s.saves,
  }))
  return { stats, events: data.events, started: data.started, finished: data.finished, kickoffAt: data.kickoffAt }
}

// ── Fetch all fixtures into a FetchedStat map ────────────────

type FixtureFetchResult = {
  match_id: number | null
  status: 'ok' | 'null' | 'skipped'
  stats_count?: number
  events_count?: number
}

async function fetchAllFixtures(
  fixtures: Array<{ fotmob_match_id: number | null }>
): Promise<{
  map: Map<string, FetchedStat>
  fixtureResults: FixtureFetchResult[]
  liveFotmobIds: Set<number>
  fixtureStatuses: Map<number, { started: boolean; finished: boolean; kickoffAt: string | null }>
}> {
  const map = new Map<string, FetchedStat>()
  const fixtureResults: FixtureFetchResult[] = []
  const liveFotmobIds = new Set<number>()
  const fixtureStatuses = new Map<number, { started: boolean; finished: boolean; kickoffAt: string | null }>()

  await Promise.all(
    fixtures.map(async (fx) => {
      if (!fx.fotmob_match_id) {
        fixtureResults.push({ match_id: null, status: 'skipped' })
        return
      }
      const fotmob = await fetchFotMob(fx.fotmob_match_id)
      if (!fotmob) {
        fixtureResults.push({ match_id: fx.fotmob_match_id, status: 'null' })
        return
      }
      fixtureResults.push({
        match_id: fx.fotmob_match_id,
        status: 'ok',
        stats_count: fotmob.stats.length,
        events_count: fotmob.events.length,
      })

      fixtureStatuses.set(fx.fotmob_match_id, {
        started: fotmob.started,
        finished: fotmob.finished,
        kickoffAt: fotmob.kickoffAt,
      })

      const isLive = fotmob.started && !fotmob.finished
      if (isLive) {
        for (const s of fotmob.stats) liveFotmobIds.add(s.fotmob_id)
      }

      // Build event counters from FotMob
      const yellows    = new Map<number, number>()
      const reds       = new Map<number, number>()
      const ownGoals   = new Map<number, number>()
      const penScored  = new Map<number, number>()
      const penMissed  = new Map<number, number>()

      for (const e of fotmob.events) {
        if (!e.player_id) continue
        const pid = e.player_id
        if (e.type === 'Card') {
          if (e.card === 'Yellow') yellows.set(pid, (yellows.get(pid) ?? 0) + 1)
          else if (e.card === 'Red') reds.set(pid, (reds.get(pid) ?? 0) + 1)
          else if (e.card === 'YellowRed') {
            // Second yellow → sent off: count as red and subsume the prior yellow.
            reds.set(pid, (reds.get(pid) ?? 0) + 1)
            yellows.set(pid, Math.max(0, (yellows.get(pid) ?? 0) - 1))
          }
        } else if (e.type === 'Goal') {
          if (e.own_goal) ownGoals.set(pid, (ownGoals.get(pid) ?? 0) + 1)
          else if (e.goal_description?.toLowerCase() === 'penalty')
            penScored.set(pid, (penScored.get(pid) ?? 0) + 1)
        } else if (e.type === 'MissedPenalty') {
          penMissed.set(pid, (penMissed.get(pid) ?? 0) + 1)
        }
      }

      for (const s of fotmob.stats) {
        const key = normalizeName(s.name)
        map.set(key, {
          fotmob_id: s.fotmob_id,
          name: s.name,
          normalized_name: key,
          team_label: s.team_name,
          fotmob_rating: s.rating,
          minutes_played: s.minutes_played,
          goals_scored: s.goals_scored,
          assists: s.assists,
          own_goals: ownGoals.get(s.fotmob_id) ?? 0,
          yellow_cards: yellows.get(s.fotmob_id) ?? 0,
          red_cards: reds.get(s.fotmob_id) ?? 0,
          penalties_scored: penScored.get(s.fotmob_id) ?? 0,
          penalties_missed: penMissed.get(s.fotmob_id) ?? 0,
          penalties_saved: 0,
          goals_conceded: s.goals_conceded,
          saves: s.saves,
        })
      }
    })
  )

  return { map, fixtureResults, liveFotmobIds, fixtureStatuses }
}

// ── Public entry point ───────────────────────────────────────

export type LiveRefreshResult = {
  ok: boolean
  error?: string
  teams_updated?: number
  fixtures?: FixtureFetchResult[]
  api_players_total?: number
  matched_players_total?: number
}

export async function refreshMatchdayLive(
  supabase: Supabase,
  matchdayId: string,
  leagueId: string
): Promise<LiveRefreshResult> {
  // 1. Fixtures (incl. cached FotMob status — long-finished fixtures are skipped)
  const { data: fixtures } = await supabase
    .from('matchday_fixtures')
    .select('id, fotmob_match_id, sofascore_event_id, fotmob_finished, fotmob_status_seen_at, kickoff_at')
    .eq('matchday_id', matchdayId)

  if (!fixtures?.length) {
    return { ok: false, error: 'Nessuna fixture configurata per questa giornata.' }
  }

  // 2. Decide which fixtures to actually fetch from FotMob.
  //
  //  - skip if `fotmob_finished` was first seen more than 30 min ago — by
  //    then FotMob has settled and there's nothing new to capture. The
  //    30-minute grace window matters because `general.finished` flips a
  //    beat before per-player ratings populate, and we want to refetch
  //    once the canonical values land.
  //  - skip if kickoff is more than 5 min in the future — pre-match
  //    payloads have no useful data and we don't want to hammer FotMob.
  //  - otherwise fetch.
  const POST_FINISH_FETCH_MS = 30 * 60_000
  const PRE_KICKOFF_LEAD_MS = 5 * 60_000
  const nowMs = Date.now()
  const fixturesToFetch = fixtures.filter((f) => {
    if (f.fotmob_finished) {
      const seenMs = f.fotmob_status_seen_at ? new Date(f.fotmob_status_seen_at).getTime() : 0
      return nowMs - seenMs < POST_FINISH_FETCH_MS
    }
    if (f.kickoff_at) {
      const koMs = new Date(f.kickoff_at).getTime()
      if (nowMs < koMs - PRE_KICKOFF_LEAD_MS) return false
    }
    return true
  })
  const { map: apiStatsMap, fixtureResults, liveFotmobIds, fixtureStatuses } =
    await fetchAllFixtures(fixturesToFetch)

  // Persist new status. The seen_at timestamp anchors when finished was
  // FIRST observed — it's what the 30-minute post-finish grace window
  // measures against. Don't overwrite it on subsequent ticks once a fixture
  // is finished; otherwise the grace window slides and we never stop
  // re-fetching.
  if (fixtureStatuses.size > 0) {
    const nowIso = new Date().toISOString()
    const updates = fixtures
      .filter((f) => f.fotmob_match_id != null && fixtureStatuses.has(f.fotmob_match_id))
      .map((f) => {
        const s = fixtureStatuses.get(f.fotmob_match_id!)!
        const alreadyFinished = f.fotmob_finished
        return {
          id: f.id,
          matchday_id: matchdayId,
          fotmob_match_id: f.fotmob_match_id,
          fotmob_started: s.started,
          fotmob_finished: s.finished,
          fotmob_status_seen_at: alreadyFinished ? f.fotmob_status_seen_at : nowIso,
          // Backfill kickoff from FotMob if the calendar didn't seed it.
          kickoff_at: f.kickoff_at ?? s.kickoffAt,
        }
      })
    if (updates.length > 0) {
      await supabase.from('matchday_fixtures').upsert(updates, { onConflict: 'id' })
    }
  }

  // 3. League engine config
  const { data: engineConfigRow } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle()

  const engineConfig = buildEngineConfig(engineConfigRow ?? null)

  // 4. Active league players (for rating_class + ID/name matching).
  // Coalesce two FotMob ID sources, same as /api/ratings/fetch:
  //   1. league_players.fotmob_player_id — manual link via /pool/link-fotmob
  //   2. serie_a_players.fotmob_id — auto-populated from pool import
  // Without this fallback, players whose league row has no manual link
  // (e.g. most of the Juventus / Lecce squads) silently miss the live ID
  // match and fall through to name matching, which fails on diacritics.
  const { data: leaguePlayersRaw } = await supabase
    .from('league_players')
    .select('id, full_name, rating_class, fotmob_player_id, serie_a_players(fotmob_id)')
    .eq('league_id', leagueId)
    .eq('is_active', true)

  if (!leaguePlayersRaw?.length) {
    return { ok: false, error: 'Nessun giocatore attivo in rosa.' }
  }

  type LP = {
    id: string
    full_name: string
    rating_class: string
    fotmob_player_id: number | null
  }
  // PostgREST may return the forward FK as either an object or an array
  // depending on schema introspection — same handling as /api/ratings/fetch.
  type SapShape = { fotmob_id: number | null }
  const leaguePlayers: LP[] = leaguePlayersRaw.map((p) => {
    const sapRaw = p.serie_a_players as unknown as SapShape | SapShape[] | null
    const sap = Array.isArray(sapRaw) ? (sapRaw[0] ?? null) : sapRaw
    const coalescedFmId =
      p.fotmob_player_id != null ? Number(p.fotmob_player_id)
      : sap?.fotmob_id != null ? Number(sap.fotmob_id)
      : null
    return {
      id: p.id,
      full_name: p.full_name,
      rating_class: p.rating_class,
      fotmob_player_id: coalescedFmId,
    }
  })

  const playerNormMap = new Map(
    leaguePlayers.map((p) => [normalizeName(p.full_name), p])
  )
  const fotmobIdToPlayer = new Map(
    leaguePlayers
      .filter(p => p.fotmob_player_id != null)
      .map(p => [p.fotmob_player_id!, p])
  )
  const fotmobIdToStat = new Map<number, FetchedStat>()
  for (const stat of apiStatsMap.values()) {
    if (stat.fotmob_id != null) fotmobIdToStat.set(stat.fotmob_id, stat)
  }

  // 5. Existing player_match_stats (manual edits)
  const { data: dbStats } = await supabase
    .from('player_match_stats')
    .select(
      `player_id, rating_class_override,
       fotmob_rating, minutes_played,
       goals_scored, assists, own_goals, yellow_cards, red_cards,
       penalties_scored, penalties_missed, penalties_saved,
       clean_sheet, goals_conceded, saves, is_provisional`
    )
    .eq('matchday_id', matchdayId)

  const dbStatsMap = new Map((dbStats ?? []).map((s) => [s.player_id, s]))

  // FotMob omits `Minutes played` from its HTML payload during live matches
  // (the field only appears once the game ends). A player on the pitch with
  // a fresh rating but no minutes would be NV'd by the engine's <10min gate,
  // so the live overlay would show nothing. Treat a rated-but-no-minutes
  // entry as a full appearance for live scoring; the post-match refresh
  // overwrites with real minutes.
  const inferLiveMinutes = (apiMinutes: number, apiRating: number | null): number =>
    apiMinutes === 0 && apiRating != null ? 90 : apiMinutes

  // 6. Build engine inputs — merge DB stats + fresh API data
  const engineInputs: EnginePlayerInput[] = []
  type MergedStat = {
    fotmob_rating: number | null
    minutes_played: number
    goals_scored: number
    assists: number
    own_goals: number
    yellow_cards: number
    red_cards: number
    penalties_scored: number
    penalties_saved: number
    penalties_missed: number
    saves: number
    goals_conceded: number
  }
  const mergedStatsMap = new Map<string, MergedStat>()

  // Process players that have DB stats entries
  for (const db of dbStats ?? []) {
    const player = leaguePlayers.find((p) => p.id === db.player_id)
    if (!player) continue

    const apiData =
      (player.fotmob_player_id != null ? fotmobIdToStat.get(player.fotmob_player_id) : null)
      ?? apiStatsMap.get(normalizeName(player.full_name))
    const rc = (db.rating_class_override as RatingClass | null) ??
      (player.rating_class as RatingClass)

    const apiRating = apiData?.fotmob_rating ?? null
    const apiMinutes = apiData ? inferLiveMinutes(apiData.minutes_played, apiRating) : null
    const merged: MergedStat = {
      fotmob_rating:    apiRating                ?? db.fotmob_rating,
      minutes_played:   apiMinutes               ?? db.minutes_played,
      goals_scored:     apiData?.goals_scored    ?? db.goals_scored,
      assists:          apiData?.assists         ?? db.assists,
      own_goals:        apiData?.own_goals       ?? db.own_goals,
      yellow_cards:     apiData?.yellow_cards    ?? db.yellow_cards,
      red_cards:        apiData?.red_cards       ?? db.red_cards,
      penalties_scored: apiData?.penalties_scored ?? db.penalties_scored,
      penalties_saved:  apiData?.penalties_saved ?? db.penalties_saved,
      penalties_missed: apiData?.penalties_missed ?? db.penalties_missed,
      saves:            apiData?.saves           ?? db.saves,
      goals_conceded:   apiData?.goals_conceded  ?? db.goals_conceded,
    }
    mergedStatsMap.set(db.player_id, merged)

    engineInputs.push({
      player_id:        db.player_id,
      stats_id:         db.player_id, // dummy — not stored
      rating_class:     rc,
      minutes_played:   merged.minutes_played,
      is_provisional:   db.is_provisional,
      fotmob_rating:    merged.fotmob_rating,
      sofascore_rating: null, // live refresh has no SofaScore data
      goals_scored:     merged.goals_scored,
      assists:          merged.assists,
      own_goals:        merged.own_goals,
      yellow_cards:     merged.yellow_cards,
      red_cards:        merged.red_cards,
      penalties_scored: merged.penalties_scored,
      penalties_missed: merged.penalties_missed,
      penalties_saved:  merged.penalties_saved,
      clean_sheet:      db.clean_sheet,
      goals_conceded:   merged.goals_conceded,
    })
  }

  const matchedFotmobIds = new Set<number>()
  const matchedNormNames = new Set(
    (dbStats ?? [])
      .map(db => {
        const p = leaguePlayers.find(lp => lp.id === db.player_id)
        if (!p) return null
        if (p.fotmob_player_id != null) matchedFotmobIds.add(p.fotmob_player_id)
        return normalizeName(p.full_name)
      })
      .filter(Boolean) as string[]
  )

  // Players only in API (no manual stats yet) — synthesize engine input
  for (const [normalizedName, apiData] of apiStatsMap) {
    const playerById = apiData.fotmob_id != null ? fotmobIdToPlayer.get(apiData.fotmob_id) : null
    const player = playerById ?? playerNormMap.get(normalizedName)
    if (!player) continue
    if (dbStatsMap.has(player.id)) continue
    if (apiData.fotmob_id != null) matchedFotmobIds.add(apiData.fotmob_id)

    const liveMinutes = inferLiveMinutes(apiData.minutes_played, apiData.fotmob_rating)
    const merged: MergedStat = {
      fotmob_rating:    apiData.fotmob_rating,
      minutes_played:   liveMinutes,
      goals_scored:     apiData.goals_scored,
      assists:          apiData.assists,
      own_goals:        apiData.own_goals,
      yellow_cards:     apiData.yellow_cards,
      red_cards:        apiData.red_cards,
      penalties_scored: apiData.penalties_scored,
      penalties_saved:  apiData.penalties_saved,
      penalties_missed: apiData.penalties_missed,
      saves:            apiData.saves,
      goals_conceded:   apiData.goals_conceded,
    }
    mergedStatsMap.set(player.id, merged)

    engineInputs.push({
      player_id:        player.id,
      stats_id:         player.id,
      rating_class:     player.rating_class as RatingClass,
      minutes_played:   liveMinutes,
      is_provisional:   true,
      fotmob_rating:    apiData.fotmob_rating,
      sofascore_rating: null, // live refresh has no SofaScore data
      goals_scored:     apiData.goals_scored,
      assists:          apiData.assists,
      own_goals:        apiData.own_goals,
      yellow_cards:     apiData.yellow_cards,
      red_cards:        apiData.red_cards,
      penalties_scored: apiData.penalties_scored,
      penalties_missed: apiData.penalties_missed,
      penalties_saved:  apiData.penalties_saved,
      clean_sheet:      false,
      goals_conceded:   apiData.goals_conceded,
    })
  }

  // Persist unmatched FotMob players so admin can link them once
  const unmatchedRows = [...apiStatsMap.values()]
    .filter(s => s.fotmob_id != null && !matchedFotmobIds.has(s.fotmob_id!))
    .map(s => ({
      matchday_id: matchdayId,
      fotmob_player_id: s.fotmob_id!,
      fotmob_name: s.name,
      fotmob_team: s.team_label || null,
    }))

  if (unmatchedRows.length > 0) {
    await supabase
      .from('fotmob_unmatched_players')
      .upsert(unmatchedRows, { onConflict: 'matchday_id,fotmob_player_id', ignoreDuplicates: true })
  }

  // Suppress unused variable warning — matchedNormNames is used implicitly
  void matchedNormNames

  if (engineInputs.length === 0) {
    return { ok: false, error: 'Nessun dato disponibile per il calcolo live.' }
  }

  // 7. Run engine
  const engineResult = computeMatchday(engineInputs, engineConfig)

  const fantaVotoMap = new Map<string, number | null>(
    engineResult.player_results.map((r) => [
      r.player_id,
      r.kind === 'skipped' ? null : r.fantavoto,
    ])
  )
  const votoBaseMap = new Map<string, number | null>(
    engineResult.player_results.map((r) => [
      r.player_id,
      r.kind === 'skipped' ? null : r.voto_base,
    ])
  )

  type EngineBreakdown = {
    bonus_malus_breakdown: Array<{
      label: string
      total: number
      quantity: number
      points_each: number
    }>
    z_fotmob: number | null
    z_sofascore: number | null
    minutes_factor: number | null
    role_multiplier: number | null
  }
  const breakdownMap = new Map<string, EngineBreakdown>()
  for (const r of engineResult.player_results) {
    if (r.kind === 'skipped') continue
    breakdownMap.set(r.player_id, {
      bonus_malus_breakdown: r.bonus_malus_breakdown,
      z_fotmob: r.z_fotmob,
      z_sofascore: r.z_sofascore,
      minutes_factor: r.minutes_factor,
      role_multiplier: r.role_multiplier,
    })
  }

  // 8. Load lineup data (same as publishCalculationAction)
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('team_id, submission_id')
    .eq('matchday_id', matchdayId)

  const submissionIds = (pointers ?? []).map((p) => p.submission_id)

  const { data: lineupPlayers } =
    submissionIds.length > 0
      ? await supabase
          .from('lineup_submission_players')
          .select(
            'submission_id, player_id, slot_id, is_bench, bench_order, assigned_mantra_role'
          )
          .in('submission_id', submissionIds)
      : { data: [] }

  const starterSlotIds = [
    ...new Set(
      (lineupPlayers ?? [])
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

  const slotRolesMap = new Map(
    (formationSlots ?? []).map((s) => [
      s.id,
      {
        native: s.allowed_mantra_roles ?? [],
        extended: s.extended_mantra_roles ?? [],
      },
    ])
  )

  const submissionTeamMap = new Map(
    (pointers ?? []).map((p) => [p.submission_id, p.team_id])
  )

  // 9. Compute team scores + player breakdowns
  const { teamScores, playerScores } = computeTeamScores({
    lineupPlayers: (lineupPlayers ?? []).map((lp) => ({
      submission_id: lp.submission_id,
      player_id: lp.player_id,
      slot_id: lp.slot_id,
      is_bench: lp.is_bench,
      bench_order: lp.bench_order,
      assigned_mantra_role: lp.assigned_mantra_role,
    })),
    submissionTeamMap,
    slotRolesMap,
    fantaVotoMap,
  })

  if (teamScores.length === 0) {
    return { ok: false, error: 'Nessuna formazione trovata. I manager devono inviare la formazione prima del calcolo live.' }
  }

  // 10. Upsert live_scores
  const now = new Date().toISOString()
  const liveScoreRows = teamScores.map((ts) => ({
    matchday_id: matchdayId,
    team_id: ts.team_id,
    league_id: leagueId,
    total_fantavoto: ts.total_fantavoto,
    player_count: ts.player_count,
    nv_count: ts.nv_count,
    refreshed_at: now,
  }))

  const { error: lsErr } = await supabase
    .from('live_scores')
    .upsert(liveScoreRows, { onConflict: 'matchday_id,team_id' })

  if (lsErr) return { ok: false, error: `Errore live_scores: ${lsErr.message}` }

  // 11. Upsert live_player_scores
  const playerIdToFotmobId = new Map(
    leaguePlayers
      .filter((p) => p.fotmob_player_id != null)
      .map((p) => [p.id, p.fotmob_player_id!])
  )

  const livePlayerRows = playerScores.map((ps) => {
    const stats = mergedStatsMap.get(ps.player_id)
    const bd = breakdownMap.get(ps.player_id)
    const fmId = playerIdToFotmobId.get(ps.player_id)
    const isMatchLive = fmId != null && liveFotmobIds.has(fmId)
    return {
      matchday_id: matchdayId,
      team_id: ps.team_id,
      player_id: ps.player_id,
      assigned_mantra_role: ps.assigned_mantra_role,
      is_bench: ps.is_bench,
      bench_order: ps.bench_order,
      sub_status: ps.sub_status,
      extended_penalty: ps.extended_penalty,
      voto_base: votoBaseMap.get(ps.player_id) ?? null,
      fantavoto: ps.fantavoto,
      sofascore_rating: null, // SofaScore removed in v1.1
      fotmob_rating: stats?.fotmob_rating ?? null,
      minutes_played: stats?.minutes_played ?? 0,
      goals_scored: stats?.goals_scored ?? 0,
      assists: stats?.assists ?? 0,
      yellow_cards: stats?.yellow_cards ?? 0,
      red_cards: stats?.red_cards ?? 0,
      own_goals: stats?.own_goals ?? 0,
      penalties_scored: stats?.penalties_scored ?? 0,
      penalties_saved: stats?.penalties_saved ?? 0,
      penalties_missed: stats?.penalties_missed ?? 0,
      saves: stats?.saves ?? 0,
      goals_conceded: stats?.goals_conceded ?? 0,
      bonus_malus_breakdown: bd?.bonus_malus_breakdown ?? null,
      z_fotmob: bd?.z_fotmob ?? null,
      z_sofascore: bd?.z_sofascore ?? null,
      minutes_factor: bd?.minutes_factor ?? null,
      role_multiplier: bd?.role_multiplier ?? null,
      is_match_live: isMatchLive,
      refreshed_at: now,
    }
  })

  if (livePlayerRows.length > 0) {
    const { error: lpErr } = await supabase
      .from('live_player_scores')
      .upsert(livePlayerRows, { onConflict: 'matchday_id,team_id,player_id' })

    if (lpErr) return { ok: false, error: `Errore live_player_scores: ${lpErr.message}` }
  }

  return {
    ok: true,
    teams_updated: teamScores.length,
    fixtures: fixtureResults,
    api_players_total: apiStatsMap.size,
    matched_players_total: mergedStatsMap.size,
  }
}
