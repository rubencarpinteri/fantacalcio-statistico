import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import type { MatchdayFixture } from '@/types/database.types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MatchdayStatusControls } from './MatchdayStatusControls'
import { FreezeButton } from './FreezeButton'
import { FixturesInlineCard } from './FixturesInlineCard'

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

  // Fixtures — always fetch for admin
  let fixtures: MatchdayFixture[] = []
  if (isAdmin) {
    const { data: fx } = await supabase
      .from('matchday_fixtures')
      .select('*')
      .eq('matchday_id', id)
      .order('created_at', { ascending: true })
    fixtures = (fx ?? []) as MatchdayFixture[]
  }

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

  // ── Admin workflow step status ────────────────────────────────────────────
  let playerStatsCount = 0
  let v1RunId: string | null = null
  let v1RunNumber: number | null = null
  let publishedRunEngine: string | null = null

  if (isAdmin) {
    const [statsRes, v1Res] = await Promise.all([
      supabase.from('player_match_stats').select('id', { count: 'exact', head: true }).eq('matchday_id', id),
      supabase.from('calculation_runs').select('id, run_number').eq('matchday_id', id).eq('engine_version', 'v1').order('run_number', { ascending: false }).limit(1).maybeSingle(),
    ])
    playerStatsCount = statsRes.count ?? 0
    v1RunId = v1Res.data?.id ?? null
    v1RunNumber = v1Res.data?.run_number ?? null

    // Check if published_team_scores points to a v1 run
    if (matchday.status === 'published' || matchday.status === 'archived') {
      const { data: pts } = await supabase
        .from('published_team_scores')
        .select('run_id')
        .eq('matchday_id', id)
        .limit(1)
        .maybeSingle()
      if (pts?.run_id) {
        const { data: run } = await supabase
          .from('calculation_runs')
          .select('engine_version')
          .eq('id', pts.run_id)
          .single()
        publishedRunEngine = run?.engine_version ?? null
      }
    }
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

      <div className="space-y-4">

        {/* ── ADMIN WORKFLOW ── */}
        {isAdmin && (() => {
          const step1Done = fixtures.length >= 10
          const step2Done = playerStatsCount > 0
          const step3Done = v1RunId !== null
          const step4Done = (matchday.status === 'published' || matchday.status === 'archived') && publishedRunEngine === 'v1'

          const StepIcon = ({ done, active }: { done: boolean; active: boolean }) => (
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              done   ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              active ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' :
                       'bg-[#1a1a24] text-[#55556a] border border-[#2e2e42]'
            }`}>
              {done ? '✓' : active ? '→' : '○'}
            </div>
          )

          return (
            <div className="space-y-3">

              {/* Step 1 — ID Partite */}
              <div className="rounded-xl border border-[#2e2e42] bg-[#0f0f1a] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <StepIcon done={step1Done} active={!step1Done} />
                  <div>
                    <p className={`text-sm font-semibold ${step1Done ? 'text-white' : 'text-indigo-300'}`}>
                      1 — ID Partite
                    </p>
                    <p className="text-xs text-[#55556a]">
                      {step1Done ? `${fixtures.length} partite configurate` : 'Inserisci gli ID FotMob delle 10 partite'}
                    </p>
                  </div>
                </div>
                <FixturesInlineCard matchdayId={id} fixtures={fixtures} />
              </div>

              {/* Step 2 — Voti FotMob */}
              <div className={`rounded-xl border p-4 ${step2Done ? 'border-[#2e2e42] bg-[#0a0a0f]' : step1Done ? 'border-indigo-500/30 bg-[#0f0f1a]' : 'border-[#1e1e2e] bg-[#0a0a0f] opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <StepIcon done={step2Done} active={step1Done && !step2Done} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step2Done ? 'text-white' : step1Done ? 'text-indigo-300' : 'text-[#55556a]'}`}>
                      2 — Voti FotMob
                    </p>
                    <p className="text-xs text-[#55556a]">
                      {step2Done ? `${playerStatsCount} giocatori importati` : 'I voti vengono scaricati automaticamente al salvataggio degli ID'}
                    </p>
                  </div>
                  {step2Done && (
                    <a
                      href={`/matchdays/${id}/stats`}
                      className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm font-medium text-[#55556a] transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
                    >
                      Statistiche →
                    </a>
                  )}
                </div>
              </div>

              {/* Step 3 — Calcolo statistico */}
              <div className={`rounded-xl border p-4 ${step3Done ? 'border-[#2e2e42] bg-[#0a0a0f]' : step2Done ? 'border-indigo-500/30 bg-[#0f0f1a]' : 'border-[#1e1e2e] bg-[#0a0a0f] opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <StepIcon done={step3Done} active={step2Done && !step3Done} />
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${step3Done ? 'text-white' : step2Done ? 'text-indigo-300' : 'text-[#55556a]'}`}>
                      3 — Calcolo statistico
                    </p>
                    <p className="text-xs text-[#55556a]">
                      {step3Done ? `Run #${v1RunNumber} completato` : 'Esegui il calcolo con il motore FotMob'}
                    </p>
                  </div>
                  <a
                    href={`/matchdays/${id}/calculate`}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      step3Done
                        ? 'border border-[#2e2e42] text-[#55556a] hover:text-indigo-300 hover:border-indigo-500/40'
                        : step2Done
                        ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                        : 'pointer-events-none bg-[#1a1a24] text-[#3a3a4a]'
                    }`}
                  >
                    {step3Done ? 'Ricalcola →' : 'Calcola →'}
                  </a>
                </div>
              </div>

              {/* Step 4 — Lineups + Publish */}
              <div className={`rounded-xl border p-4 ${step4Done ? 'border-[#2e2e42] bg-[#0a0a0f]' : step3Done ? 'border-indigo-500/30 bg-[#0f0f1a]' : 'border-[#1e1e2e] bg-[#0a0a0f] opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <StepIcon done={step4Done} active={step3Done && !step4Done} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${step4Done ? 'text-white' : step3Done ? 'text-indigo-300' : 'text-[#55556a]'}`}>
                      4 — Formazioni + Pubblica
                    </p>
                    <p className="text-xs text-[#55556a]">
                      {step4Done
                        ? 'Pubblicata con punteggi FotMob'
                        : 'Importa da Leghe (xlsx) oppure inserisci le formazioni manualmente'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`/matchdays/${id}/import-leghe`}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          step4Done
                            ? 'border border-[#2e2e42] text-[#55556a] hover:text-indigo-300 hover:border-indigo-500/40'
                            : step3Done
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'pointer-events-none bg-[#1a1a24] text-[#3a3a4a]'
                        }`}
                      >
                        {step4Done ? 'Ripubblica (Leghe) →' : 'Importa Leghe →'}
                      </a>
                      <a
                        href={`/matchdays/${id}/all-lineups`}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          step3Done
                            ? 'border border-[#2e2e42] text-[#8888aa] hover:border-indigo-500/40 hover:text-indigo-300'
                            : 'pointer-events-none border border-[#1e1e2e] text-[#3a3a4a]'
                        }`}
                      >
                        Formazioni manuali →
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Extra links */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-[#55556a]">
                <MatchdayStatusControls matchday={matchday} />
                {['locked', 'scoring'].includes(matchday.status) && (
                  <FreezeButton matchdayId={matchday.id} isFrozen={matchday.is_frozen} />
                )}
                <a href={`/matchdays/${id}/all-lineups`} className="hover:text-indigo-400">Tutte le formazioni →</a>
                {['scoring', 'published', 'archived'].includes(matchday.status) && (
                  <a href={`/matchdays/${id}/stats`} className="hover:text-indigo-400">Statistiche →</a>
                )}
                {['scoring', 'published'].includes(matchday.status) && (
                  <a href={`/matchdays/${id}/overrides`} className="hover:text-orange-400">Override →</a>
                )}
                {matchday.opens_at && <span>Apertura: {fmt(matchday.opens_at)}</span>}
                {matchday.locks_at && <span>Scadenza: {fmt(matchday.locks_at)}</span>}
              </div>
            </div>
          )
        })()}

        {/* ── MANAGER VIEW ── */}
        {!isAdmin && (
          <Card>
            <CardHeader title="La tua formazione" />
            <CardContent>
              <div className="space-y-3">
                {mySubmission ? (
                  <div className="space-y-3">
                    <p className="text-sm text-[#8888aa]">
                      Ultima versione: <span className="text-white">#{mySubmission.submission_number}</span>
                      {' '}— Stato:{' '}
                      <span className={mySubmission.status === 'submitted' ? 'text-green-400' : 'text-amber-400'}>
                        {mySubmission.status === 'submitted' ? 'Inviata' : 'Bozza'}
                      </span>
                    </p>
                    {matchday.status === 'open' && (
                      <a href={`/matchdays/${id}/lineup`} className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">
                        Modifica formazione
                      </a>
                    )}
                    <a href={`/matchdays/${id}/lineup/history`} className="block text-sm text-indigo-400 hover:underline">
                      Storico invii →
                    </a>
                  </div>
                ) : matchday.status === 'open' ? (
                  <a href={`/matchdays/${id}/lineup`} className="inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400">
                    Inserisci formazione
                  </a>
                ) : (
                  <p className="text-sm text-[#55556a]">La giornata non è aperta per le formazioni.</p>
                )}
                {['published', 'archived'].includes(matchday.status) && (
                  <div className="flex flex-col gap-1">
                    <a href={`/matchdays/${id}/my-results`} className="text-sm text-indigo-400 hover:underline">I tuoi risultati →</a>
                    <a href={`/matchdays/${id}/results`} className="text-sm text-[#8888aa] hover:text-indigo-400">Tutti i risultati →</a>
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
