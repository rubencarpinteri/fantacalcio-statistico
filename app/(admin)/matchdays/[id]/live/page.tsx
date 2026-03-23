import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { LiveBoard } from './LiveBoard'
import type { LiveScoresResponse } from '@/app/api/matchdays/[id]/live-scores/route'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Live — ${data?.name ?? 'Giornata'}` }
}

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Load initial data server-side (same query as the GET route)
  const [{ data: liveScores }, { data: teams }] = await Promise.all([
    supabase
      .from('live_scores')
      .select('team_id, total_fantavoto, player_count, nv_count, refreshed_at')
      .eq('matchday_id', matchdayId)
      .order('total_fantavoto', { ascending: false }),
    supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', ctx.league.id),
  ])

  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Load player scores for initial render
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

  const roleOrder: Record<string, number> = {
    Por: 0, Dc: 1, Dd: 2, Ds: 3, M: 4, C: 5, T: 6, W: 7, A: 8, Pc: 9,
  }

  const playersByTeam = new Map<string, LiveScoresResponse['teams'][number]['players']>()
  for (const p of playerScores ?? []) {
    const name =
      (p.league_players as unknown as { full_name: string } | null)?.full_name ?? '—'
    const row = {
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

  for (const players of playersByTeam.values()) {
    players.sort((a, b) => {
      if (a.is_bench !== b.is_bench) return a.is_bench ? 1 : -1
      if (a.is_bench) return (a.bench_order ?? 99) - (b.bench_order ?? 99)
      return (
        (roleOrder[a.assigned_mantra_role ?? ''] ?? 99) -
        (roleOrder[b.assigned_mantra_role ?? ''] ?? 99)
      )
    })
  }

  const initialData: LiveScoresResponse = {
    matchday_id: matchdayId,
    refreshed_at: liveScores?.[0]?.refreshed_at ?? null,
    teams: (liveScores ?? []).map((ls) => ({
      team_id: ls.team_id,
      team_name: teamNameMap.get(ls.team_id) ?? '—',
      total_fantavoto: Number(ls.total_fantavoto),
      player_count: ls.player_count,
      nv_count: ls.nv_count,
      players: playersByTeam.get(ls.team_id) ?? [],
    })),
  }

  return (
    <div className="space-y-6">
      <div>
        <a
          href={`/matchdays/${matchdayId}`}
          className="text-sm text-[#55556a] hover:text-indigo-400"
        >
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Live</h1>
      </div>

      <LiveBoard
        matchdayId={matchdayId}
        matchdayName={matchday.name}
        isAdmin={isAdmin}
        initialData={initialData}
      />
    </div>
  )
}
