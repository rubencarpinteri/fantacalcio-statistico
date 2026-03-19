import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { updateCompetitionStatusAction } from '../actions'
import type { Competition, CompetitionRound } from '@/types/database.types'

const TYPE_LABEL: Record<string, string> = {
  campionato: 'Campionato', battle_royale: 'Battle Royale', coppa: 'Coppa',
}
const STATUS_COLOR: Record<string, string> = {
  setup:     'text-[#8888aa]',
  active:    'text-emerald-400',
  completed: 'text-indigo-300',
  cancelled: 'text-red-400',
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
  team_id: string; played: number; wins: number; draws: number; losses: number
  goals_for: number; goals_against: number; goal_difference: number
  points: number; total_fantavoto: number
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('competitions').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Competizione' }
}

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: comp } = await supabase
    .from('competitions')
    .select('*')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!comp) notFound()
  const competition = comp as Competition

  const { count: teamCount } = await supabase
    .from('competition_teams')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', id)

  const { data: recentRounds } = await supabase
    .from('competition_rounds')
    .select('*')
    .eq('competition_id', id)
    .eq('status', 'computed')
    .order('round_number', { ascending: false })
    .limit(5)

  const rounds = (recentRounds ?? []) as CompetitionRound[]

  const { data: latestSnapshot } = await supabase
    .from('competition_standings_snapshots')
    .select('snapshot_json')
    .eq('competition_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const standingRows: TeamStandingRow[] = []
  if (latestSnapshot?.snapshot_json) {
    const json = latestSnapshot.snapshot_json as { type?: string; rows?: TeamStandingRow[] }
    if (json.type === 'table' && Array.isArray(json.rows)) standingRows.push(...json.rows.slice(0, 5))
  }

  const teamIds = standingRows.map((r) => r.team_id)
  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams').select('id, name').in('id', teamIds)
    : { data: [] }
  const teamNameMap = new Map((teams ?? []).map((t) => [t.id, t.name]))

  const sc = competition.scoring_config as { method?: string } | null
  const hasGoals = sc?.method !== 'direct_comparison'

  // Inline server actions for status transitions
  async function activateAction() {
    'use server'
    await updateCompetitionStatusAction(id, 'active')
  }
  async function completeAction() {
    'use server'
    await updateCompetitionStatusAction(id, 'completed')
  }
  async function cancelAction() {
    'use server'
    await updateCompetitionStatusAction(id, 'cancelled')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <a href="/competitions" className="text-sm text-[#55556a] hover:text-indigo-400">
            ← Competizioni
          </a>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">{competition.name}</h1>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[competition.status] ?? ''}`}>
              {STATUS_LABEL[competition.status] ?? competition.status}
            </span>
          </div>
          <p className="text-sm text-[#8888aa]">
            {TYPE_LABEL[competition.type] ?? competition.type}
            {competition.season ? ` · ${competition.season}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quick links */}
        <Card>
          <CardHeader title="Gestione" />
          <CardContent>
            <div className="space-y-1">
              {[
                { href: `/competitions/${id}/teams`,    label: `Squadre (${teamCount ?? 0})`, icon: '👥' },
                { href: `/competitions/${id}/rounds`,   label: 'Turni e incontri',            icon: '📅' },
                { href: `/competitions/${id}/standings`,label: 'Classifica completa',          icon: '📊' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#8888aa] hover:bg-[#1a1a24] hover:text-white transition-colors"
                >
                  <span>{link.icon}</span>
                  {link.label} →
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status card */}
        <Card>
          <CardHeader title="Stato competizione" />
          <CardContent>
            <p className="mb-3 text-sm text-[#8888aa]">
              Stato attuale:{' '}
              <span className={`font-medium ${STATUS_COLOR[competition.status] ?? 'text-white'}`}>
                {STATUS_LABEL[competition.status]}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {competition.status === 'setup' && (
                <form action={activateAction}>
                  <button type="submit" className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10">
                    Attiva competizione
                  </button>
                </form>
              )}
              {competition.status === 'active' && (
                <>
                  <form action={completeAction}>
                    <button type="submit" className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10">
                      Segna come conclusa
                    </button>
                  </form>
                  <form action={cancelAction}>
                    <button type="submit" className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10">
                      Annulla
                    </button>
                  </form>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Type-specific info */}
        <Card>
          <CardHeader title={competition.type === 'battle_royale' ? 'Battle Royale' : competition.type === 'coppa' ? 'Coppa' : 'Calendario'} />
          <CardContent>
            <p className="mb-3 text-sm text-[#8888aa]">
              {competition.type === 'campionato' && 'Genera il calendario round-robin. Poi collega ogni turno a una giornata e calcola i risultati.'}
              {competition.type === 'battle_royale' && 'Ogni giornata ogni squadra sfida tutte le altre. Aggiungi i turni man mano che le giornate vengono pubblicate.'}
              {competition.type === 'coppa' && 'Configura il formato (gironi / eliminazione diretta) e gestisci i turni.'}
            </p>
            <a
              href={`/competitions/${id}/rounds`}
              className="inline-block rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/20"
            >
              Vai ai turni →
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Standings preview */}
      {standingRows.length > 0 && (
        <Card>
          <CardHeader title="Classifica (anteprima — top 5)" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {['Pos','Squadra','G','V','N','P',
                    ...(hasGoals ? ['GF','GS','DR'] : []),
                    'Pt','FV'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-center text-xs font-medium text-[#55556a] first:text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {standingRows.map((row, idx) => (
                  <tr key={row.team_id} className="hover:bg-[#0f0f1a]">
                    <td className="px-4 py-2.5 text-[#55556a]">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-white">
                      {teamNameMap.get(row.team_id) ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.played}</td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.wins}</td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.draws}</td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.losses}</td>
                    {hasGoals && (
                      <>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.goals_for}</td>
                        <td className="px-4 py-2.5 text-center text-[#8888aa]">{row.goals_against}</td>
                        <td className={`px-4 py-2.5 text-center ${row.goal_difference >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.goal_difference > 0 ? '+' : ''}{row.goal_difference}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-2.5 text-center font-bold text-white">{row.points}</td>
                    <td className="px-4 py-2.5 text-center text-[#55556a]">{row.total_fantavoto.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[#1e1e2e] px-4 py-2">
              <a href={`/competitions/${id}/standings`} className="text-xs text-indigo-400 hover:underline">
                Classifica completa →
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent rounds */}
      {rounds.length > 0 && (
        <Card>
          <CardHeader title="Turni calcolati di recente" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#1e1e2e]">
                {rounds.map((r) => (
                  <tr key={r.id} className="hover:bg-[#0f0f1a]">
                    <td className="px-4 py-2.5 text-[#55556a] w-10">#{r.round_number}</td>
                    <td className="px-4 py-2.5 text-white">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded px-2 py-0.5 text-xs font-medium text-emerald-400 bg-emerald-500/10">calcolato</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a href={`/competitions/${id}/rounds/${r.round_number}`} className="text-xs text-indigo-400 hover:underline">
                        Dettaglio →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
