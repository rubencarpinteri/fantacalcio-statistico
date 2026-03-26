import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MatchdayStatusControls } from './MatchdayStatusControls'
import { FreezeButton } from './FreezeButton'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Giornata' }
}

export default async function MatchdayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id } = await params
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('*')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  const { data: statusLog } = await supabase
    .from('matchday_status_log')
    .select('*, profiles(username)')
    .eq('matchday_id', id)
    .order('changed_at', { ascending: false })
    .limit(10)

  // Published results — only fetch when needed
  type PublishedScore = {
    team_id: string; total_fantavoto: number; player_count: number; nv_count: number; published_at: string
  }
  let publishedScores: PublishedScore[] = []
  let teamNameMap = new Map<string, string>()
  let publishedRunNumber: number | null = null
  let publishedAt: string | null = null
  type LinkedRound = { id: string; name: string; round_number: number; status: string; competition_id: string; competition_name: string }
  let linkedRounds: LinkedRound[] = []

  if (isAdmin && ['published', 'archived'].includes(matchday.status)) {
    const { data: scores } = await supabase
      .from('published_team_scores')
      .select('team_id, total_fantavoto, player_count, nv_count, published_at')
      .eq('matchday_id', id)
      .order('total_fantavoto', { ascending: false })

    publishedScores = (scores ?? []) as PublishedScore[]

    if (publishedScores.length > 0) {
      const teamIds = publishedScores.map((s) => s.team_id)
      const { data: teams } = await supabase
        .from('fantasy_teams')
        .select('id, name')
        .in('id', teamIds)
      teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))
      // Use published_at from first row (all rows same publish event via upsert)
      publishedAt = publishedScores[0]?.published_at ?? null
    }

    // Current run number
    const { data: ptr } = await supabase
      .from('matchday_current_calculation')
      .select('run_id')
      .eq('matchday_id', id)
      .maybeSingle()

    if (ptr?.run_id) {
      const { data: run } = await supabase
        .from('calculation_runs')
        .select('run_number')
        .eq('id', ptr.run_id)
        .single()
      publishedRunNumber = run?.run_number ?? null
    }

    // Linked competition rounds
    const { data: rounds } = await supabase
      .from('competition_rounds')
      .select('id, name, round_number, status, competition_id, competitions(id, name)')
      .eq('matchday_id', id)

    linkedRounds = (rounds ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      round_number: r.round_number,
      status: r.status,
      competition_id: r.competition_id,
      competition_name: (r.competitions as unknown as { name: string } | null)?.name ?? '—',
    }))
  }

  // If manager: fetch their team's current submission status
  let mySubmission: { status: string; submission_number: number } | null = null
  if (!isAdmin) {
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('league_id', ctx.league.id)
      .eq('manager_id', ctx.userId)
      .single()

    if (team) {
      const { data: pointer } = await supabase
        .from('lineup_current_pointers')
        .select('submission_id, lineup_submissions(status, submission_number)')
        .eq('team_id', team.id)
        .eq('matchday_id', id)
        .single()

      if (pointer?.lineup_submissions) {
        const sub = pointer.lineup_submissions as unknown as {
          status: string
          submission_number: number
        }
        mySubmission = sub
      }
    }
  }

  const fmt = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <a href="/matchdays" className="text-sm text-[#55556a] hover:text-indigo-400">
            ← Giornate
          </a>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">{matchday.name}</h1>
            <MatchdayStatusBadge status={matchday.status} />
            {matchday.is_frozen && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                🧊 Congelata
              </span>
            )}
          </div>
          {matchday.matchday_number && (
            <p className="text-sm text-[#8888aa]">Giornata n. {matchday.matchday_number}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Info card */}
        <Card>
          <CardHeader title="Dettagli" />
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Row label="Apertura" value={fmt(matchday.opens_at)} />
              <Row label="Scadenza" value={fmt(matchday.locks_at)} />
              <Row label="Stato" value={<MatchdayStatusBadge status={matchday.status} />} />
            </dl>
          </CardContent>
        </Card>

        {/* Admin: stats entry link when matchday is in scoring or later */}
        {isAdmin && ['scoring', 'published', 'archived'].includes(matchday.status) && (
          <Card>
            <CardHeader title="Statistiche" />
            <CardContent>
              <p className="mb-3 text-sm text-[#8888aa]">
                Inserisci voti, eventi e dati difensivi per questa giornata.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/matchdays/${id}/stats`}
                  className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  Apri tabella statistiche →
                </a>
                <a
                  href={`/matchdays/${id}/fixtures`}
                  className="inline-block rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/10"
                >
                  Fetch automatico voti
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live scores — visible to everyone when scoring */}
        {matchday.status === 'scoring' && (
          <Card>
            <CardHeader
              title="Punteggi Live"
              description="Aggiornamento automatico ogni 60s"
            />
            <CardContent>
              <p className="mb-3 text-sm text-[#8888aa]">
                Fantavoti in tempo reale con sostituzioni dalla panchina.
              </p>
              <a
                href={`/matchdays/${id}/live`}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Apri Live →
              </a>
            </CardContent>
          </Card>
        )}

        {/* Admin: calculation / publication link when matchday is in scoring or published */}
        {isAdmin && ['scoring', 'published'].includes(matchday.status) && (
          <Card>
            <CardHeader title="Calcolo punteggi" />
            <CardContent>
              <p className="mb-3 text-sm text-[#8888aa]">
                Esegui il motore di calcolo, anteprima dei fantavoti e pubblica i risultati.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`/matchdays/${id}/calculate`}
                  className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                >
                  Apri calcolo →
                </a>
                <a
                  href={`/matchdays/${id}/overrides`}
                  className="inline-block rounded-lg border border-orange-500/30 bg-orange-500/5 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/10"
                >
                  Override ★
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin controls or manager submission CTA */}
        {isAdmin ? (
          <div className="space-y-3">
            <MatchdayStatusControls matchday={matchday} />
            {['locked', 'scoring'].includes(matchday.status) && (
              <div className="flex items-center gap-3">
                <FreezeButton matchdayId={matchday.id} isFrozen={matchday.is_frozen} />
                {matchday.is_frozen && (
                  <span className="text-xs text-[#55556a]">
                    Giornata congelata — le formazioni sono bloccate.
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardHeader title="La tua formazione" />
            <CardContent>
              <div className="space-y-3">
                {mySubmission ? (
                  <div className="space-y-3">
                    <p className="text-sm text-[#8888aa]">
                      Ultima versione: <span className="text-white">#{mySubmission.submission_number}</span>
                      {' '}— Stato:{' '}
                      <span
                        className={
                          mySubmission.status === 'submitted'
                            ? 'text-green-400'
                            : 'text-amber-400'
                        }
                      >
                        {mySubmission.status === 'submitted' ? 'Inviata' : 'Bozza'}
                      </span>
                    </p>
                    {matchday.status === 'open' && (
                      <a
                        href={`/matchdays/${id}/lineup`}
                        className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                      >
                        Modifica formazione
                      </a>
                    )}
                    <a
                      href={`/matchdays/${id}/lineup/history`}
                      className="block text-sm text-indigo-400 hover:underline"
                    >
                      Storico invii →
                    </a>
                  </div>
                ) : matchday.status === 'open' ? (
                  <a
                    href={`/matchdays/${id}/lineup`}
                    className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
                  >
                    Inserisci formazione
                  </a>
                ) : (
                  <p className="text-sm text-[#55556a]">
                    La giornata non è aperta per le formazioni.
                  </p>
                )}

                {['published', 'archived'].includes(matchday.status) && (
                  <div className="flex flex-col gap-1">
                    <a
                      href={`/matchdays/${id}/my-results`}
                      className="text-sm text-indigo-400 hover:underline"
                    >
                      I tuoi risultati →
                    </a>
                    <a
                      href={`/matchdays/${id}/results`}
                      className="text-sm text-[#8888aa] hover:text-indigo-400"
                    >
                      Tutti i risultati →
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Published results — shown for admin when matchday is published or archived */}
      {isAdmin && publishedScores.length > 0 && (
        <Card>
          <CardHeader
            title="Risultati pubblicati"
            description={[
              publishedRunNumber !== null ? `Run #${publishedRunNumber}` : null,
              publishedAt
                ? `Pubblicato il ${new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(publishedAt))}`
                : null,
            ].filter(Boolean).join(' · ')}
            action={
              <div className="flex items-center gap-3">
                <a href={`/matchdays/${id}/results`} className="text-xs text-indigo-400 hover:text-indigo-300">
                  Dettaglio →
                </a>
                <a href={`/matchdays/${id}/calculate`} className="text-xs text-[#55556a] hover:text-indigo-300">
                  Calcolo →
                </a>
              </div>
            }
          />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Pos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Squadra</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">Titolari</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a]">NV</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#55556a]">Fantavoto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {publishedScores.map((s, idx) => (
                  <tr key={s.team_id} className="hover:bg-[#0f0f1a]">
                    <td className="px-4 py-2.5">
                      <span className={`text-sm font-semibold ${
                        idx === 0 ? 'text-amber-400' : idx <= 2 ? 'text-indigo-300' : 'text-[#55556a]'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-white">
                      {teamNameMap.get(s.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{s.player_count}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={s.nv_count > 0 ? 'text-amber-400' : 'text-[#55556a]'}>
                        {s.nv_count}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-white">
                      {Number(s.total_fantavoto).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Linked competition round outcomes */}
            {linkedRounds.length > 0 && (
              <div className="border-t border-[#1e1e2e] px-4 py-3 space-y-1">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#55556a]">Competizioni collegate</p>
                {linkedRounds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-[#8888aa]">
                      {r.competition_name} — {r.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={`rounded px-2 py-0.5 font-medium ${
                        r.status === 'computed' ? 'text-emerald-400 bg-emerald-500/10' :
                        r.status === 'locked'   ? 'text-indigo-300 bg-indigo-500/10' :
                                                  'text-[#8888aa] bg-[#1a1a24]'
                      }`}>
                        {r.status === 'computed' ? 'calcolato' : r.status === 'locked' ? 'bloccato' : 'in attesa'}
                      </span>
                      <a
                        href={`/competitions/${r.competition_id}/rounds/${r.round_number}`}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Dettaglio →
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status log */}
      {isAdmin && statusLog && statusLog.length > 0 && (
        <Card>
          <CardHeader title="Storico stati" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#1e1e2e]">
                {statusLog.map((entry) => {
                  const actor = entry.profiles as unknown as { username: string } | null
                  return (
                    <tr key={entry.id} className="px-6 py-3">
                      <td className="px-6 py-2.5 text-[#55556a] w-44">
                        {new Intl.DateTimeFormat('it-IT', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(entry.changed_at))}
                      </td>
                      <td className="px-6 py-2.5 text-[#8888aa]">
                        {entry.old_status ?? '—'} → <span className="text-white">{entry.new_status}</span>
                      </td>
                      <td className="px-6 py-2.5 text-[#55556a]">{actor?.username ?? '—'}</td>
                      <td className="px-6 py-2.5 text-[#55556a] italic">{entry.note ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[#8888aa]">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
