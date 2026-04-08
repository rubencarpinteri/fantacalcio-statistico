import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { normalizeName, mergeFixtureStats, findDbPlayer, type SofaScoreFantasyStat } from '@/lib/ratings/parse'
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
  // SofaScore extra stats (null when SS data not available)
  ss_shots: number | null
  ss_shots_on_target: number | null
  ss_big_chance_created: number | null
  ss_big_chance_missed: number | null
  ss_key_passes: number | null
  ss_successful_dribbles: number | null
  ss_dribble_attempts: number | null
  ss_tackles: number | null
  ss_interceptions: number | null
  ss_clearances: number | null
  ss_blocked_shots: number | null
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
   * Flat map of SofaScore player ID → full stat object, collected from all fixtures.
   * SofaScore blocks all automated fetches (403). This data must be pasted
   * manually by the admin from their browser session and passed from the client.
   */
  sofascoreByPlayerId?: Record<string, SofaScoreFantasyStat>
}

export async function POST(req: NextRequest): Promise<NextResponse<FetchRatingsResponse>> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ matched: [], unmatched: [], errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = await req.json() as RequestBody
  const { matchdayId, sofascoreByPlayerId } = body
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

  // Build sofascore_player_id → full stat map from manually-pasted client data.
  // SofaScore blocks all automated fetches (cloud IPs + CORS). The admin must
  // paste each event's JSON manually; the client parses and sends this flat map.
  const allSofascoreStats = new Map<number, SofaScoreFantasyStat>()
  if (sofascoreByPlayerId) {
    for (const [idStr, stat] of Object.entries(sofascoreByPlayerId)) {
      allSofascoreStats.set(Number(idStr), stat)
    }
  }

  // Fetch FotMob fixtures sequentially to avoid rate-limiting
  for (const fx of fixtures ?? []) {
    const label = fx.label ? ` (${fx.label})` : ''
    const fotmobResult = fx.fotmob_match_id
      ? await fetchFotMobMatch(fx.fotmob_match_id)
      : { data: null, status: 0 }
    if (fx.fotmob_match_id && !fotmobResult.data) {
      errors.push(`FotMob fetch failed for match ${fx.fotmob_match_id}${label} — HTTP ${fotmobResult.status || 'network error'}`)
    }
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
    // PostgREST may return the forward FK (many-to-one) as either an object or
    // an array depending on schema introspection. Handle both.
    type SapShape = { fotmob_id: number | null; sofascore_id: number | null }
    const sapRaw = p.serie_a_players as SapShape | SapShape[] | null
    const sap = Array.isArray(sapRaw) ? (sapRaw[0] ?? null) : sapRaw
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

  // ── Enrich matched players with SofaScore data (ID-based, no name matching) ──
  // For each matched player: league_player_id → serie_a_players.sofascore_id
  //   → allSofascoreStats map (populated from browser-fetched fantasy data).
  if (allSofascoreStats.size > 0) {
    for (const m of matched) {
      const sofascorePlayerId = lpToSofascoreId.get(m.league_player_id)
      if (sofascorePlayerId != null && allSofascoreStats.has(sofascorePlayerId)) {
        const ss = allSofascoreStats.get(sofascorePlayerId)!
        m.stat.sofascore_rating = ss.rating
        m.stat.sofascore_id = sofascorePlayerId
        // Extra SS stats — stored in dedicated columns; FotMob event stats remain authoritative
        m.stat.ss_shots              = ss.shots
        m.stat.ss_shots_on_target    = ss.shots_on_target
        m.stat.ss_big_chance_created = ss.big_chance_created
        m.stat.ss_big_chance_missed  = ss.big_chance_missed
        m.stat.ss_key_passes         = ss.key_passes
        m.stat.ss_successful_dribbles = ss.successful_dribbles
        m.stat.ss_dribble_attempts   = ss.dribble_attempts
        m.stat.ss_tackles            = ss.tackles
        m.stat.ss_interceptions      = ss.interceptions
        m.stat.ss_clearances         = ss.clearances
        m.stat.ss_blocked_shots      = ss.blocked_shots
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
