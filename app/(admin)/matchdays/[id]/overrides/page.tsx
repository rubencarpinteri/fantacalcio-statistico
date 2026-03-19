import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { OverridesManager } from './OverridesManager'
import type { ActiveOverride, PlayerOption } from './OverridesManager'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Override — ${data?.name ?? 'Giornata'}` }
}

export default async function OverridesPage({
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

  // Active overrides with player info
  const { data: rawOverrides } = await supabase
    .from('score_overrides')
    .select(`
      id,
      player_id,
      original_fantavoto,
      override_fantavoto,
      reason,
      created_at,
      league_players ( full_name, club )
    `)
    .eq('matchday_id', matchdayId)
    .is('removed_at', null)
    .order('created_at', { ascending: false })

  const activeOverrides: ActiveOverride[] = (rawOverrides ?? []).map((o) => {
    const player = o.league_players as unknown as { full_name: string; club: string } | null
    return {
      id: o.id,
      player_id: o.player_id,
      player_name: player?.full_name ?? '—',
      player_club: player?.club ?? '',
      original_fantavoto: o.original_fantavoto,
      override_fantavoto: o.override_fantavoto,
      reason: o.reason,
      created_at: o.created_at,
    }
  })

  // All active league players for the "add override" dropdown
  const { data: rawPlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, rating_class')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('full_name')

  const players: PlayerOption[] = (rawPlayers ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    club: p.club,
    rating_class: p.rating_class,
  }))

  // Removed overrides (history)
  const { data: removedOverrides } = await supabase
    .from('score_overrides')
    .select(`
      id,
      player_id,
      original_fantavoto,
      override_fantavoto,
      reason,
      created_at,
      removed_at,
      league_players ( full_name, club )
    `)
    .eq('matchday_id', matchdayId)
    .not('removed_at', 'is', null)
    .order('removed_at', { ascending: false })
    .limit(20)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <a
          href={`/matchdays/${matchdayId}`}
          className="text-sm text-[#55556a] hover:text-indigo-400"
        >
          ← {matchday.name}
        </a>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Override punteggi</h1>
          <MatchdayStatusBadge status={matchday.status} />
        </div>
        <p className="mt-1 text-sm text-[#8888aa]">
          Gli override sostituiscono il fantavoto calcolato dal motore per giocatori specifici.
          Dopo aver creato o rimosso un override, ricalcola i punteggi per applicare la modifica.
        </p>
      </div>

      {matchday.status === 'archived' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
          La giornata è archiviata. Gli override sono in sola lettura.
        </div>
      )}

      {/* Active overrides + create form */}
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-3">
              <span>Override attivi</span>
              {activeOverrides.length > 0 && (
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
                  {activeOverrides.length}
                </span>
              )}
            </div>
          }
        />
        <CardContent>
          <OverridesManager
            matchdayId={matchdayId}
            matchdayStatus={matchday.status}
            activeOverrides={activeOverrides}
            players={players}
          />
        </CardContent>
      </Card>

      {/* Removed override history */}
      {removedOverrides && removedOverrides.length > 0 && (
        <Card>
          <CardHeader title="Storico rimossi" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42] text-left text-xs text-[#55556a]">
                  <th className="px-6 py-2.5">Giocatore</th>
                  <th className="px-4 py-2.5 text-right">Override</th>
                  <th className="px-4 py-2.5">Motivazione</th>
                  <th className="px-4 py-2.5 text-right">Rimosso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {removedOverrides.map((o) => {
                  const player = o.league_players as unknown as { full_name: string; club: string } | null
                  return (
                    <tr key={o.id} className="opacity-50">
                      <td className="px-6 py-2.5">
                        <div className="text-white">{player?.full_name ?? '—'}</div>
                        <div className="text-xs text-[#55556a]">{player?.club ?? ''}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[#8888aa]">
                        {o.override_fantavoto.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-xs italic text-[#55556a]">{o.reason}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-[#55556a]">
                        {o.removed_at
                          ? new Intl.DateTimeFormat('it-IT', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(o.removed_at))
                          : '—'}
                      </td>
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
