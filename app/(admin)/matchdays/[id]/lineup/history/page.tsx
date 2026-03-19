import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const metadata = { title: 'Storico Formazioni' }

interface SubmissionWithPlayers {
  id: string
  submission_number: number
  status: string
  created_at: string
  submitted_at: string | null
  formation: { name: string } | null
  players: Array<{
    player_id: string
    slot_id: string
    is_bench: boolean
    bench_order: number | null
    assigned_mantra_role: string | null
    player: { full_name: string; mantra_roles: string[]; club: string } | null
    slot: { slot_name: string; slot_order: number; is_bench: boolean; bench_order: number | null } | null
  }>
}

export default async function LineupHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  // Validate matchday
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, league_id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Resolve team
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .eq('manager_id', ctx.userId)
    .single()

  if (!team) {
    return (
      <div className="py-12 text-center text-sm text-[#55556a]">
        Nessuna squadra trovata per il tuo account.
      </div>
    )
  }

  // Fetch ALL submissions for this team+matchday, ordered oldest first
  const { data: submissions } = await supabase
    .from('lineup_submissions')
    .select('id, submission_number, status, created_at, submitted_at, formation_id')
    .eq('team_id', team.id)
    .eq('matchday_id', matchdayId)
    .order('submission_number')

  if (!submissions || submissions.length === 0) {
    return (
      <div className="space-y-4">
        <a href={`/matchdays/${matchdayId}/lineup`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← Torna alla formazione
        </a>
        <p className="text-sm text-[#55556a]">Nessun invio trovato per questa giornata.</p>
      </div>
    )
  }

  // Get formation names
  const formationIds = [...new Set(submissions.map((s) => s.formation_id))]
  const { data: formations } = await supabase
    .from('formations')
    .select('id, name')
    .in('id', formationIds)
  const formationMap = new Map((formations ?? []).map((f) => [f.id, f]))

  // Fetch players for all submissions in one query
  const submissionIds = submissions.map((s) => s.id)
  const { data: allSubPlayers } = await supabase
    .from('lineup_submission_players')
    .select('submission_id, player_id, slot_id, is_bench, bench_order, assigned_mantra_role')
    .in('submission_id', submissionIds)

  // Fetch player details
  const playerIds = [...new Set((allSubPlayers ?? []).map((p) => p.player_id))]
  const { data: players } = await supabase
    .from('league_players')
    .select('id, full_name, mantra_roles, club')
    .in('id', playerIds)
  const playerMap = new Map((players ?? []).map((p) => [p.id, p]))

  // Fetch slot details
  const slotIds = [...new Set((allSubPlayers ?? []).map((p) => p.slot_id))]
  const { data: slots } = await supabase
    .from('formation_slots')
    .select('id, slot_name, slot_order, is_bench, bench_order')
    .in('id', slotIds)
  const slotMap = new Map((slots ?? []).map((s) => [s.id, s]))

  // Group players by submission
  const playersBySubmission = new Map<string, typeof allSubPlayers>()
  for (const sp of allSubPlayers ?? []) {
    const existing = playersBySubmission.get(sp.submission_id) ?? []
    existing.push(sp)
    playersBySubmission.set(sp.submission_id, existing)
  }

  const enrichedSubmissions: SubmissionWithPlayers[] = submissions.map((sub) => ({
    id: sub.id,
    submission_number: sub.submission_number,
    status: sub.status,
    created_at: sub.created_at,
    submitted_at: sub.submitted_at,
    formation: formationMap.get(sub.formation_id) ?? null,
    players: (playersBySubmission.get(sub.id) ?? []).map((sp) => ({
      ...sp,
      player: playerMap.get(sp.player_id) ?? null,
      slot: slotMap.get(sp.slot_id) ?? null,
    })),
  }))

  // Current pointer
  const { data: pointer } = await supabase
    .from('lineup_current_pointers')
    .select('submission_id')
    .eq('team_id', team.id)
    .eq('matchday_id', matchdayId)
    .single()

  const currentSubmissionId = pointer?.submission_id ?? null

  // Reverse to show newest first in the list, but keep index for diff
  const reversed = [...enrichedSubmissions].reverse()

  return (
    <div className="space-y-4">
      <div>
        <a href={`/matchdays/${matchdayId}/lineup`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← Torna alla formazione
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">
          Storico invii — {matchday.name}
        </h1>
        <p className="text-sm text-[#8888aa]">
          {submissions.length} versione{submissions.length !== 1 ? 'i' : 'e'} salvat{submissions.length !== 1 ? 'e' : 'a'}
        </p>
      </div>

      <div className="space-y-4">
        {reversed.map((sub, i) => {
          const isCurrent = sub.id === currentSubmissionId
          const prevSub = reversed[i + 1] ?? null
          const prevPlayerIds = new Set((prevSub?.players ?? []).map((p) => p.player_id))
          const prevSlotAssignments = new Map(
            (prevSub?.players ?? []).map((p) => [p.slot_id, p.player_id])
          )

          const starters = sub.players
            .filter((p) => !p.is_bench)
            .sort((a, b) => (a.slot?.slot_order ?? 0) - (b.slot?.slot_order ?? 0))
          const bench = sub.players
            .filter((p) => p.is_bench)
            .sort((a, b) => (a.slot?.bench_order ?? 0) - (b.slot?.bench_order ?? 0))

          return (
            <Card key={sub.id} className={isCurrent ? 'ring-1 ring-indigo-500/50' : ''}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-mono">Versione #{sub.submission_number}</span>
                    {isCurrent && (
                      <Badge variant="success" className="text-xs">Corrente</Badge>
                    )}
                    <Badge variant={sub.status === 'submitted' ? 'success' : 'warning'} className="text-xs">
                      {sub.status === 'submitted' ? 'Inviata' : sub.status === 'locked' ? 'Bloccata' : 'Bozza'}
                    </Badge>
                  </span>
                }
                description={
                  <span className="text-xs text-[#55556a]">
                    {sub.formation?.name ?? '—'} ·{' '}
                    {new Intl.DateTimeFormat('it-IT', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(sub.created_at))}
                  </span>
                }
              />
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Starters */}
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                      Titolari ({starters.length})
                    </p>
                    <div className="space-y-1">
                      {starters.map((sp) => {
                        const slotChanged =
                          prevSub !== null &&
                          prevSlotAssignments.get(sp.slot_id) !== sp.player_id
                        const isNew = prevSub !== null && !prevPlayerIds.has(sp.player_id)
                        return (
                          <div
                            key={sp.slot_id}
                            className={[
                              'flex items-center gap-2 rounded px-2 py-1 text-sm',
                              slotChanged
                                ? 'bg-amber-500/10'
                                : isNew
                                ? 'bg-green-500/10'
                                : '',
                            ].join(' ')}
                          >
                            <span className="w-10 shrink-0 font-mono text-xs text-indigo-400">
                              {sp.slot?.slot_name ?? '?'}
                            </span>
                            <span className="text-white">
                              {sp.player?.full_name ?? sp.player_id}
                            </span>
                            {sp.assigned_mantra_role && (
                              <Badge variant="muted" className="text-xs">
                                {sp.assigned_mantra_role}
                              </Badge>
                            )}
                            {slotChanged && (
                              <span className="ml-auto text-xs text-amber-400">modificato</span>
                            )}
                            {isNew && (
                              <span className="ml-auto text-xs text-green-400">nuovo</span>
                            )}
                          </div>
                        )
                      })}
                      {starters.length === 0 && (
                        <p className="text-xs text-[#55556a]">Nessun titolare</p>
                      )}
                    </div>
                  </div>

                  {/* Bench */}
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                      Panchina ({bench.length})
                    </p>
                    <div className="space-y-1">
                      {bench.map((sp) => {
                        const slotChanged =
                          prevSub !== null &&
                          prevSlotAssignments.get(sp.slot_id) !== sp.player_id
                        const isNew = prevSub !== null && !prevPlayerIds.has(sp.player_id)
                        return (
                          <div
                            key={sp.slot_id}
                            className={[
                              'flex items-center gap-2 rounded px-2 py-1 text-sm',
                              slotChanged
                                ? 'bg-amber-500/10'
                                : isNew
                                ? 'bg-green-500/10'
                                : '',
                            ].join(' ')}
                          >
                            <span className="w-10 shrink-0 font-mono text-xs text-[#55556a]">
                              P{sp.slot?.bench_order ?? '?'}
                            </span>
                            <span className="text-white">
                              {sp.player?.full_name ?? sp.player_id}
                            </span>
                            {sp.assigned_mantra_role && (
                              <Badge variant="muted" className="text-xs">
                                {sp.assigned_mantra_role}
                              </Badge>
                            )}
                            {slotChanged && (
                              <span className="ml-auto text-xs text-amber-400">modificato</span>
                            )}
                            {isNew && (
                              <span className="ml-auto text-xs text-green-400">nuovo</span>
                            )}
                          </div>
                        )
                      })}
                      {bench.length === 0 && (
                        <p className="text-xs text-[#55556a]">Nessun panchinaro</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Diff legend for non-first versions */}
                {prevSub !== null && (
                  <p className="mt-3 text-xs text-[#55556a]">
                    <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/40 mr-1" />
                    modificato rispetto alla versione precedente
                    {' · '}
                    <span className="inline-block w-2 h-2 rounded-sm bg-green-500/40 mr-1" />
                    nuovo giocatore
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
