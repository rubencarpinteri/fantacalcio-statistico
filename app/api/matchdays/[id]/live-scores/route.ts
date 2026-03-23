import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'

export type LivePlayerRow = {
  player_id: string
  player_name: string
  assigned_mantra_role: string | null
  is_bench: boolean
  bench_order: number | null
  sub_status: string
  extended_penalty: number
  voto_base: number | null
  fantavoto: number | null
  sofascore_rating: number | null
  fotmob_rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  yellow_cards: number
  red_cards: number
  own_goals: number
  penalties_scored: number
  saves: number
  goals_conceded: number
}

export type LiveTeamRow = {
  team_id: string
  team_name: string
  total_fantavoto: number
  player_count: number
  nv_count: number
  players: LivePlayerRow[]
}

export type LiveScoresResponse = {
  matchday_id: string
  refreshed_at: string | null
  teams: LiveTeamRow[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireLeagueContext()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { id: matchdayId } = await params

  // Verify matchday belongs to this league
  const ctx = await requireLeagueContext()
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Load live_scores + team names
  const { data: liveScores } = await supabase
    .from('live_scores')
    .select('team_id, total_fantavoto, player_count, nv_count, refreshed_at')
    .eq('matchday_id', matchdayId)
    .order('total_fantavoto', { ascending: false })

  if (!liveScores?.length) {
    return NextResponse.json({
      matchday_id: matchdayId,
      refreshed_at: null,
      teams: [],
    } satisfies LiveScoresResponse)
  }

  // Team names
  const teamIds = liveScores.map((s) => s.team_id)
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .in('id', teamIds)

  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Load live_player_scores with player names
  const { data: playerScores } = await supabase
    .from('live_player_scores')
    .select(
      `player_id, assigned_mantra_role, is_bench, bench_order,
       sub_status, extended_penalty, voto_base, fantavoto,
       sofascore_rating, fotmob_rating, minutes_played,
       goals_scored, assists, yellow_cards, red_cards, own_goals,
       penalties_scored, saves, goals_conceded, team_id,
       league_players ( full_name )`
    )
    .eq('matchday_id', matchdayId)

  // Group by team
  const playersByTeam = new Map<string, LivePlayerRow[]>()
  for (const p of playerScores ?? []) {
    const name =
      (p.league_players as unknown as { full_name: string } | null)?.full_name ?? '—'
    const row: LivePlayerRow = {
      player_id: p.player_id,
      player_name: name,
      assigned_mantra_role: p.assigned_mantra_role,
      is_bench: p.is_bench,
      bench_order: p.bench_order,
      sub_status: p.sub_status,
      extended_penalty: Number(p.extended_penalty ?? 0),
      voto_base: p.voto_base != null ? Number(p.voto_base) : null,
      fantavoto: p.fantavoto != null ? Number(p.fantavoto) : null,
      sofascore_rating: p.sofascore_rating != null ? Number(p.sofascore_rating) : null,
      fotmob_rating: p.fotmob_rating != null ? Number(p.fotmob_rating) : null,
      minutes_played: p.minutes_played,
      goals_scored: p.goals_scored,
      assists: p.assists,
      yellow_cards: p.yellow_cards,
      red_cards: p.red_cards,
      own_goals: p.own_goals,
      penalties_scored: p.penalties_scored,
      saves: p.saves,
      goals_conceded: p.goals_conceded,
    }
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, [])
    playersByTeam.get(p.team_id)!.push(row)
  }

  // Sort players: starters first (by role order), then bench by bench_order
  const roleOrder: Record<string, number> = {
    Por: 0, Dc: 1, Dd: 2, Ds: 3, M: 4, C: 5, T: 6, W: 7, A: 8, Pc: 9,
  }
  for (const players of playersByTeam.values()) {
    players.sort((a, b) => {
      if (a.is_bench !== b.is_bench) return a.is_bench ? 1 : -1
      if (a.is_bench) return (a.bench_order ?? 99) - (b.bench_order ?? 99)
      return (roleOrder[a.assigned_mantra_role ?? ''] ?? 99) -
        (roleOrder[b.assigned_mantra_role ?? ''] ?? 99)
    })
  }

  const refreshedAt = liveScores[0]?.refreshed_at ?? null

  const teamRows: LiveTeamRow[] = liveScores.map((ls) => ({
    team_id: ls.team_id,
    team_name: teamNameMap.get(ls.team_id) ?? '—',
    total_fantavoto: Number(ls.total_fantavoto),
    player_count: ls.player_count,
    nv_count: ls.nv_count,
    players: playersByTeam.get(ls.team_id) ?? [],
  }))

  return NextResponse.json({
    matchday_id: matchdayId,
    refreshed_at: refreshedAt,
    teams: teamRows,
  } satisfies LiveScoresResponse)
}
