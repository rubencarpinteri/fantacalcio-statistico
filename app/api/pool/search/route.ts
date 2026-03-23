import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/pool/search?q=&league_id=&season=
 *
 * Searches the serie_a_players pool for autocomplete in the RosaBuilder.
 * Excludes players already on a team in the given league.
 * Returns max 8 results.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Require authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const q = (searchParams.get('q') ?? '').trim()
    const leagueId = (searchParams.get('league_id') ?? '').trim()
    const season = (searchParams.get('season') ?? '2024-25').trim()

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] })
    }

    if (!leagueId) {
      return NextResponse.json({ error: 'league_id è richiesto.' }, { status: 400 })
    }

    // Verify the user is a member of this league
    const { data: membership } = await supabase
      .from('league_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Non sei membro di questa lega.' }, { status: 403 })
    }

    // Fetch matching players from pool, excluding already-assigned ones.
    // We do this in two queries since Supabase JS doesn't support complex
    // subquery exclusions directly.

    // Step 1: get IDs of pool players already assigned in this league
    const { data: assignedEntries } = await supabase
      .from('team_roster_entries')
      .select('player_id, fantasy_teams!inner(league_id), league_players!inner(serie_a_player_id)')
      .eq('fantasy_teams.league_id' as never, leagueId)
      .is('released_at', null)

    // Build set of serie_a_player_ids already in use
    const assignedPoolIds = new Set<string>()
    if (assignedEntries) {
      for (const entry of assignedEntries) {
        const lp = (entry as unknown as { league_players: { serie_a_player_id: string | null } | null }).league_players
        if (lp?.serie_a_player_id) {
          assignedPoolIds.add(lp.serie_a_player_id)
        }
      }
    }

    // Step 2: search pool
    let query = supabase
      .from('serie_a_players')
      .select('id, full_name, club, mantra_roles, rating_class')
      .eq('season', season)
      .eq('is_active', true)
      .ilike('full_name', `%${q}%`)
      .order('full_name', { ascending: true })
      .limit(20) // fetch more to allow exclusion

    const { data: poolPlayers, error: searchError } = await query

    if (searchError) {
      // Table might not exist yet — return empty gracefully
      if (
        searchError.message.includes('does not exist') ||
        searchError.code === '42P01'
      ) {
        return NextResponse.json({ results: [] })
      }
      return NextResponse.json({ error: searchError.message }, { status: 500 })
    }

    // Filter out already-assigned players and limit to 8
    const results = (poolPlayers ?? [])
      .filter((p) => !assignedPoolIds.has(p.id))
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        club: p.club,
        mantra_roles: p.mantra_roles as string[],
        rating_class: p.rating_class,
      }))

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[pool/search] Unexpected error:', err)
    return NextResponse.json({ error: 'Errore interno del server.' }, { status: 500 })
  }
}
