import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { normalizeName, mergeFixtureStats, findDbPlayer, parseSofaScoreFantasyJson } from '@/lib/ratings/parse'
import { fetchFotMobMatch } from '@/lib/ratings/fotmob'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchedPlayerStat = {
  /** FotMob player ID */
  fotmob_id: number | null
  /** SofaScore player ID */
  sofascore_id: number | null
  name: string
  /** Normalized name used for matching (no accents, lowercase) */
  normalized_name: string
  team_label: string
  sofascore_rating: number | null
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
  /** True when the player's team conceded 0 goals. Derived from FotMob GK data. */
  clean_sheet: boolean
}

export type MatchedPlayer = {
  league_player_id: string
  league_player_name: string
  club: string
  stat: FetchedPlayerStat
}

export type UnmatchedPlayer = {
  stat: FetchedPlayerStat
  /** closest DB name, if any */
  closest_name: string | null
}

export type FetchRatingsResponse = {
  matched: MatchedPlayer[]
  unmatched: UnmatchedPlayer[]
  errors: string[]
}


// ---------------------------------------------------------------------------
// POST /api/ratings/fetch
// ---------------------------------------------------------------------------

type RequestBody = {
  matchdayId?: string
  /**
   * Pre-fetched SofaScore fantasy data keyed by sofascore_event_id (string).
   * Format: { [eventId]: { playerStatistics: [...] } }
   *
   * SofaScore blocks server-side fetches via TLS fingerprinting.
   * The client must browser-fetch GET /api/v1/fantasy/event/{eventId} directly
   * (CORS is allowed with access-control-allow-origin: *) and pass the results here.
   *
   * When absent, SofaScore ratings are skipped (FotMob-only mode).
   */
  sofascoreByEventId?: Record<string, Record<string, unknown>>
}

export async function POST(req: NextRequest): Promise<NextResponse<FetchRatingsResponse>> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await req.json() as RequestBody
  const { matchdayId, sofascoreByEventId } = body
  if (!matchdayId) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['matchdayId required'] }, { status: 400 })
  }

  // Load fixtures + league context
  const [{ data: matchday }, { data: fixtures }] = await Promise.all([
    supabase.from('matchdays').select('id, league_id').eq('id', matchdayId).single(),
    supabase.from('matchday_fixtures').select('*').eq('matchday_id', matchdayId),
  ])

  if (!matchday) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Matchday not found'] }, { status: 404 })
  }

  const errors: string[] = []
  const allFetched: FetchedPlayerStat[] = []

  // Build a combined sofascore_player_id → rating map from ALL fixtures.
  // This is used AFTER FotMob matching to enrich matched players with their
  // SofaScore rating via the serie_a_players chain (no name matching needed).
  const allSofascoreRatings = new Map<number, number | null>()

  // Fetch fixtures sequentially to avoid rate-limiting
  for (const fx of fixtures ?? []) {
    // FotMob: always fetch server-side
    const fotmobResult = fx.fotmob_match_id
      ? await fetchFotMobMatch(fx.fotmob_match_id)
      : { data: null, status: 0 }

    // SofaScore: only use pre-fetched browser data (server-side is TLS-blocked).
    // Parse the fantasy endpoint format: { playerStatistics: [{playerId, statistics}] }
    // No name matching — IDs are resolved via serie_a_players.sofascore_id chain.
    if (fx.sofascore_event_id && sofascoreByEventId?.[String(fx.sofascore_event_id)]) {
      const fantasyStats = parseSofaScoreFantasyJson(
        sofascoreByEventId[String(fx.sofascore_event_id)]!
      )
      for (const s of fantasyStats) {
        // Last write wins if the same player appears in multiple fixtures (unlikely)
        allSofascoreRatings.set(s.sofascore_id, s.rating)
      }
    }

    const label = fx.label ? ` (${fx.label})` : ''
    if (fx.fotmob_match_id && !fotmobResult.data) {
      errors.push(`FotMob fetch failed for match ${fx.fotmob_match_id}${label} — HTTP ${fotmobResult.status || 'network error'}`)
    }
    // SofaScore absence is not an error — it enriches but is not required

    // Merge FotMob data only (no name-based SofaScore merge for fantasy format)
    const merged = mergeFixtureStats(fotmobResult.data, null)
    allFetched.push(...merged)
  }

  if (allFetched.length === 0) {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['No player data fetched', ...errors] })
  }

  // Load all active league players for matching.
  // Coalesce two sources for fotmob_player_id:
  //   1. league_players.fotmob_player_id — set by the manual /pool/link-fotmob UI
  //   2. serie_a_players.fotmob_id — auto-populated from the pool import
  // Also load serie_a_players.sofascore_id for post-match SofaScore rating enrichment.
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, fotmob_player_id, serie_a_players(fotmob_id, sofascore_id)')
    .eq('league_id', matchday.league_id)
    .eq('is_active', true)

  // Map league_player_id → sofascore_player_id (for enrichment after matching)
  const lpToSofascoreId = new Map<string, number>()

  const dbPlayers = (leaguePlayers ?? []).map((p) => {
    // serie_a_players is returned as an array by PostgREST (isOneToOne: false)
    const sapArr = p.serie_a_players as Array<{ fotmob_id: number | null; sofascore_id: number | null }> | null
    const sap = Array.isArray(sapArr) ? sapArr[0] : null
    const poolFotmobId = sap?.fotmob_id ?? null
    const sofascoreId = sap?.sofascore_id ?? null

    if (sofascoreId != null) {
      lpToSofascoreId.set(p.id, Number(sofascoreId))
    }

    return {
      id: p.id,
      full_name: p.full_name,
      club: p.club,
      normalized: normalizeName(p.full_name),
      // Manual link takes precedence; pool ID is fallback.
      // Supabase returns bigint as string — coerce to number so === comparison works.
      fotmob_player_id: p.fotmob_player_id != null
        ? Number(p.fotmob_player_id)
        : poolFotmobId != null ? Number(poolFotmobId) : null,
    }
  })

  const matched: MatchedPlayer[] = []
  const unmatched: UnmatchedPlayer[] = []

  for (const stat of allFetched) {
    const found = findDbPlayer(stat.normalized_name, dbPlayers, stat.fotmob_id)
    if (found) {
      matched.push({
        league_player_id: found.id,
        league_player_name: found.full_name,
        club: found.club,
        stat,
      })
    } else {
      unmatched.push({ stat, closest_name: null })
    }
  }

  // ── Enrich matched players with SofaScore ratings (ID-based, no name matching) ──
  // For each matched player: league_player_id → serie_a_players.sofascore_id
  //   → allSofascoreRatings map (populated from browser-fetched fantasy data).
  if (allSofascoreRatings.size > 0) {
    for (const m of matched) {
      const sofascorePlayerId = lpToSofascoreId.get(m.league_player_id)
      if (sofascorePlayerId != null && allSofascoreRatings.has(sofascorePlayerId)) {
        m.stat.sofascore_rating = allSofascoreRatings.get(sofascorePlayerId) ?? null
        m.stat.sofascore_id = sofascorePlayerId
      }
    }
  }

  // Persist unmatched FotMob players so the admin can link them via
  // /pool/link-fotmob. Deduplicate by fotmob_id first — the same player can
  // appear multiple times in allFetched (different fixture sources); sending
  // duplicate PKs to upsert causes "cannot affect row a second time".
  // Skip players the admin has permanently ignored for this league.
  const unmatchedByFotmobId = new Map<number, UnmatchedPlayer>()
  for (const u of unmatched) {
    if (u.stat.fotmob_id != null) {
      unmatchedByFotmobId.set(u.stat.fotmob_id, u)
    }
  }

  if (unmatchedByFotmobId.size > 0) {
    const { data: ignoredRows } = await supabase
      .from('fotmob_ignored_players')
      .select('fotmob_player_id')
      .eq('league_id', matchday.league_id)

    const ignoredIds = new Set((ignoredRows ?? []).map(r => Number(r.fotmob_player_id)))

    const toUpsert = [...unmatchedByFotmobId.values()]
      .filter(u => !ignoredIds.has(u.stat.fotmob_id!))

    if (toUpsert.length > 0) {
      const rows = toUpsert.map(u => ({
        matchday_id: matchdayId,
        fotmob_player_id: u.stat.fotmob_id!,
        fotmob_name: u.stat.name,
        fotmob_team: u.stat.team_label || null,
      }))
      // DELETE + INSERT avoids ON CONFLICT entirely
      await supabase
        .from('fotmob_unmatched_players')
        .delete()
        .eq('matchday_id', matchdayId)
        .in('fotmob_player_id', rows.map(r => r.fotmob_player_id))
      await supabase
        .from('fotmob_unmatched_players')
        .insert(rows)
    }
  }

  return NextResponse.json({ matched, unmatched, errors })
}
