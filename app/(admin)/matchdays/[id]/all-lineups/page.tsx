import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { AllLineupsClient } from './AllLineupsClient'
import type { TeamLineupData, MatchupPair } from './AllLineupsClient'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Formazioni — ${data?.name ?? 'Giornata'}` }
}

export default async function AllLineupsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, round_number')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // All fantasy teams for this league
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  if (!teams || teams.length === 0) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">← {matchday.name}</a>
        <p className="text-sm text-[#55556a]">Nessuna squadra trovata.</p>
      </div>
    )
  }

  const teamIds = teams.map((t) => t.id)

  // Current submission pointers for all teams
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('team_id, submission_id')
    .eq('matchday_id', matchdayId)
    .in('team_id', teamIds)

  const submissionIds = (pointers ?? []).map((p) => p.submission_id)
  const pointerMap = new Map((pointers ?? []).map((p) => [p.team_id, p.submission_id]))

  // Fetch submissions
  const { data: submissions } = submissionIds.length > 0
    ? await supabase
        .from('lineup_submissions')
        .select('id, team_id, formation_id, submission_number, status')
        .in('id', submissionIds)
    : { data: [] }

  const submissionMap = new Map((submissions ?? []).map((s) => [s.id, s]))

  // Fetch all player assignments for these submissions
  const { data: allPlayers } = submissionIds.length > 0
    ? await supabase
        .from('lineup_submission_players')
        .select('submission_id, player_id, slot_id, is_bench, bench_order, assigned_mantra_role')
        .in('submission_id', submissionIds)
    : { data: [] }

  // Collect all formation IDs
  const formationIds = [...new Set((submissions ?? []).map((s) => s.formation_id))]

  // Fetch formations + their slots
  const { data: formations } = formationIds.length > 0
    ? await supabase
        .from('formations')
        .select('id, name')
        .in('id', formationIds)
    : { data: [] }

  const formationNameMap = new Map((formations ?? []).map((f) => [f.id, f.name]))

  const { data: allSlots } = formationIds.length > 0
    ? await supabase
        .from('formation_slots')
        .select('id, formation_id, slot_name, slot_order, is_bench, bench_order, allowed_mantra_roles')
        .in('formation_id', formationIds)
        .order('slot_order', { ascending: true })
    : { data: [] }

  const slotsByFormation = new Map<string, typeof allSlots>()
  for (const slot of allSlots ?? []) {
    const list = slotsByFormation.get(slot.formation_id) ?? []
    list.push(slot)
    slotsByFormation.set(slot.formation_id, list)
  }

  // Collect all player IDs
  const allPlayerIds = [...new Set((allPlayers ?? []).map((p) => p.player_id))]

  const { data: leaguePlayers } = allPlayerIds.length > 0
    ? await supabase
        .from('league_players')
        .select('id, full_name, club, mantra_roles, rating_class')
        .in('id', allPlayerIds)
    : { data: [] }

  const playerInfoMap = new Map((leaguePlayers ?? []).map((p) => [p.id, p]))

  // Fetch latest calculation run for player ratings
  const { data: currentPtr } = await supabase
    .from('matchday_current_calculation')
    .select('run_id')
    .eq('matchday_id', matchdayId)
    .maybeSingle()

  // If no published run, use the latest run
  let runId = currentPtr?.run_id ?? null
  if (!runId) {
    const { data: latestRun } = await supabase
      .from('calculation_runs')
      .select('id')
      .eq('matchday_id', matchdayId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    runId = latestRun?.id ?? null
  }

  const calcMap = new Map<string, { fantavoto: number | null; voto_base: number | null }>()
  if (runId) {
    const { data: calcs } = await supabase
      .from('player_calculations')
      .select('player_id, fantavoto, voto_base')
      .eq('run_id', runId)

    for (const c of calcs ?? []) {
      calcMap.set(c.player_id, { fantavoto: c.fantavoto, voto_base: c.voto_base })
    }
  }

  // ── Fetch competition matchups for this round ──────────────────────────────
  // Used to pair teams in head-to-head layout instead of a plain grid.
  let matchupPairs: Array<{ homeTeamId: string; awayTeamId: string }> = []
  if (matchday.round_number !== null) {
    const { data: comps } = await supabase
      .from('competitions')
      .select('id')
      .eq('league_id', ctx.league.id)

    const compIds = (comps ?? []).map((c) => c.id)

    if (compIds.length > 0) {
      const { data: rawMatchups } = await supabase
        .from('competition_matchups')
        .select('home_team_id, away_team_id')
        .in('competition_id', compIds)
        .eq('round_number', matchday.round_number)

      // Deduplicate: same pair may appear in multiple competitions
      const seen = new Set<string>()
      for (const m of rawMatchups ?? []) {
        const key = [m.home_team_id, m.away_team_id].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          matchupPairs.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id })
        }
      }
    }
  }

  // Build TeamLineupData for each team
  const teamLineups: TeamLineupData[] = teams.map((team) => {
    const submissionId = pointerMap.get(team.id) ?? null
    const submission = submissionId ? submissionMap.get(submissionId) ?? null : null
    const formationId = submission?.formation_id ?? null
    const formationName = formationId ? formationNameMap.get(formationId) ?? '—' : '—'
    const slots = formationId ? (slotsByFormation.get(formationId) ?? []) : []

    const teamPlayerAssignments = (allPlayers ?? []).filter(
      (p) => p.submission_id === submissionId
    )
    const assignmentBySlot = new Map(teamPlayerAssignments.map((a) => [a.slot_id, a]))

    const slotData = slots.map((slot) => {
      const assignment = assignmentBySlot.get(slot.id) ?? null
      const player = assignment ? (playerInfoMap.get(assignment.player_id) ?? null) : null
      const calc = assignment ? (calcMap.get(assignment.player_id) ?? null) : null
      return {
        slotId: slot.id,
        positionName: slot.slot_name,
        slotOrder: slot.slot_order,
        isBench: slot.is_bench,
        benchOrder: slot.bench_order,
        allowedRoles: slot.allowed_mantra_roles ?? [],
        playerId: assignment?.player_id ?? null,
        playerName: player?.full_name ?? null,
        playerClub: player?.club ?? null,
        playerRoles: player?.mantra_roles ?? [],
        playerRatingClass: player?.rating_class ?? null,
        fantavoto: calc?.fantavoto ?? null,
        votoBase: calc?.voto_base ?? null,
        assignedMantraRole: assignment?.assigned_mantra_role ?? null,
        isBenchAssignment: assignment?.is_bench ?? false,
        benchOrderAssignment: assignment?.bench_order ?? null,
      }
    })

    return {
      teamId: team.id,
      teamName: team.name,
      formationId: formationId ?? '',
      formationName,
      submissionId,
      submissionNumber: submission?.submission_number ?? null,
      slots: slotData,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
            ← {matchday.name}
          </a>
          <h1 className="mt-1 text-xl font-bold text-white">Tutte le formazioni</h1>
          <p className="text-sm text-[#55556a]">
            Trascina i giocatori per correggere titolari/panchina · salva per ogni squadra
          </p>
        </div>
      </div>

      <AllLineupsClient
        matchdayId={matchdayId}
        matchdayStatus={matchday.status}
        teamLineups={teamLineups}
        matchups={matchupPairs}
      />
    </div>
  )
}
