import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { StatsGrid } from './StatsGrid'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Statistiche — ${data?.name ?? 'Giornata'}` }
}

// ============================================================
// Completeness helper
// A player is "done" when they have a stats row with
// is_provisional = false and minutes_played is set.
// We compute completeness against the union of all teams'
// current lineup players for this matchday.
// ============================================================

async function getCompletenessStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchdayId: string,
  leagueId: string
) {
  // Fetch all current pointers for this matchday
  const { data: pointers } = await supabase
    .from('lineup_current_pointers')
    .select('submission_id')
    .eq('matchday_id', matchdayId)

  if (!pointers || pointers.length === 0) return { lineupPlayerIds: new Set<string>(), enteredCount: 0, finalCount: 0 }

  const submissionIds = pointers.map((p) => p.submission_id)

  // All unique player_ids across all current lineups
  const { data: lineupPlayers } = await supabase
    .from('lineup_submission_players')
    .select('player_id')
    .in('submission_id', submissionIds)

  const lineupPlayerIds = new Set((lineupPlayers ?? []).map((lp) => lp.player_id))

  if (lineupPlayerIds.size === 0) return { lineupPlayerIds, enteredCount: 0, finalCount: 0 }

  // How many of those players have stats entered
  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('player_id, is_provisional')
    .eq('matchday_id', matchdayId)
    .in('player_id', Array.from(lineupPlayerIds))

  const enteredCount = (stats ?? []).length
  const finalCount = (stats ?? []).filter((s) => !s.is_provisional).length

  return { lineupPlayerIds, enteredCount, finalCount }
}

export default async function StatsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // All active league players (stats can be entered for any player, not just those in lineups)
  const { data: allPlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, mantra_roles, primary_mantra_role, rating_class, is_active')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('full_name')

  // Existing stats for this matchday
  const { data: existingStats } = await supabase
    .from('player_match_stats')
    .select('*')
    .eq('matchday_id', matchdayId)

  // Completeness indicators
  const { lineupPlayerIds, enteredCount, finalCount } = await getCompletenessStats(
    supabase,
    matchdayId,
    ctx.league.id
  )

  const lineupTotal = lineupPlayerIds.size
  const isEditable = !['archived'].includes(matchday.status)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <a href={`/matchdays/${matchdayId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
            ← {matchday.name}
          </a>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Statistiche</h1>
            <Badge variant={matchday.status === 'scoring' ? 'success' : 'muted'}>
              {matchday.status}
            </Badge>
          </div>
        </div>

        {/* Completeness panel */}
        {lineupTotal > 0 && (
          <div className="rounded-xl border border-[#2e2e42] bg-[#111118] p-4 text-sm min-w-[220px]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
              Completezza formazioni
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-6">
                <span className="text-[#8888aa]">Inseriti</span>
                <span className="font-mono text-white">
                  {enteredCount} / {lineupTotal}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#2e2e42] overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${lineupTotal > 0 ? Math.round((enteredCount / lineupTotal) * 100) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-[#8888aa]">Definitivi</span>
                <span className={`font-mono ${finalCount === lineupTotal ? 'text-green-400' : 'text-amber-400'}`}>
                  {finalCount} / {lineupTotal}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isEditable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          La giornata è archiviata. Le statistiche sono in sola lettura.
        </div>
      )}

      <StatsGrid
        matchdayId={matchdayId}
        players={allPlayers ?? []}
        existingStats={existingStats ?? []}
        lineupPlayerIds={Array.from(lineupPlayerIds)}
        isEditable={isEditable}
      />
    </div>
  )
}
