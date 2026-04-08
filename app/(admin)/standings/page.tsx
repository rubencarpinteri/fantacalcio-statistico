import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Competition } from '@/types/database.types'

export const metadata = { title: 'Classifica' }

const TYPE_LABEL: Record<string, string> = {
  campionato:    'Campionato',
  battle_royale: 'Battle Royale',
  coppa:         'Coppa',
}
const TYPE_ICON: Record<string, string> = {
  campionato:    '🏟',
  battle_royale: '⚔',
  coppa:         '🏆',
}
const STATUS_BADGE: Record<string, string> = {
  setup:     'text-[#8888aa] bg-[#1a1a24]',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  setup: 'Setup', active: 'Attiva', completed: 'Conclusa', cancelled: 'Annullata',
}

interface TeamStandingRow {
  team_id: string
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  total_fantavoto: number
}

export default async function StandingsPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .eq('league_id', ctx.league.id)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: true })

  const list = (competitions ?? []) as Competition[]

  // Fetch latest standings snapshot for each active/completed competition
  const snapshots: Record<string, { rows: TeamStandingRow[]; round_name: string | null }> = {}

  for (const comp of list) {
    // Step 1: find the highest computed round for this competition
    const { data: latestRound } = await supabase
      .from('competition_rounds')
      .select('id, name')
      .eq('competition_id', comp.id)
      .eq('status', 'computed')
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestRound) {
      snapshots[comp.id] = { rows: [], round_name: null }
      continue
    }

    // Step 2: fetch the latest snapshot version for that specific round
    const { data: snap } = await supabase
      .from('competition_standings_snapshots')
      .select('snapshot_json')
      .eq('competition_id', comp.id)
      .eq('after_round_id', latestRound.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!snap?.snapshot_json) {
      snapshots[comp.id] = { rows: [], round_name: null }
      continue
    }

    const json = snap.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
    const rows = json.type === 'table' && Array.isArray(json.rows) ? json.rows : []

    snapshots[comp.id] = { rows: rows.slice(0, 5), round_name: latestRound.name }
  }

  // Collect all team IDs across all snapshots and resolve names once
  const allTeamIds = [
    ...new Set(
      Object.values(snapshots).flatMap((s) => s.rows.map((r) => r.team_id))
    ),
  ]
  const { data: teams } = allTeamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', allTeamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Setup competitions (no rounds computed yet)
  const { data: setupComps } = await supabase
    .from('competitions')
    .select('id, name, type, status, season')
    .eq('league_id', ctx.league.id)
    .eq('status', 'setup')
    .order('created_at', { ascending: true })
  const setupList = (setupComps ?? []) as Competition[]

  // Raw published fantavoto aggregate — all published team scores for this league,
  // grouped by team in JS. One query; no GROUP BY needed at DB level.
  const { data: rawScores } = await supabase
    .from('published_team_scores')
    .select('team_id, total_fantavoto')
    .eq('league_id', ctx.league.id)

  type RawTeamRow = { team_id: string; total: number; count: number; avg: number }
  const rawByTeam = new Map<string, { total: number; count: number }>()
  for (const row of rawScores ?? []) {
    const existing = rawByTeam.get(row.team_id) ?? { total: 0, count: 0 }
    existing.total += Number(row.total_fantavoto)
    existing.count += 1
    rawByTeam.set(row.team_id, existing)
  }

  const rawTeamIds = [...rawByTeam.keys()]
  const { data: rawTeams } = rawTeamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', rawTeamIds)
    : { data: [] }
  const rawTeamNameMap = new Map((rawTeams ?? []).map((t) => [t.id, t.name]))

  const rawRows: RawTeamRow[] = [...rawByTeam.entries()]
    .map(([team_id, { total, count }]) => ({
      team_id,
      total,
      count,
      avg: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Classifiche</h1>
        <p className="text-xs text-[#8888aa]">{ctx.league.name} · {ctx.league.season_name}</p>
      </div>

      {/* ── WIP notice ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2e2e42]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#55556a]">Classifica</p>
          <p className="text-sm font-semibold text-white leading-tight mt-0.5">{ctx.league.name}</p>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-xs font-medium text-[#55556a]">Work in progress</p>
          <p className="mt-1 text-[11px] text-[#3a3a52]">La classifica sarà disponibile prossimamente.</p>
        </div>
      </div>

    </div>
  )
}
