import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CreateMatchdayButton } from './CreateMatchdayButton'

export const metadata = { title: 'Giornate' }

export default async function MatchdaysPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()
  const isAdmin = ctx.role === 'league_admin'

  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('matchday_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  // Per-matchday provisional stat count — single query, counted in JS.
  // Only fetched for admins; managers have no operational use for this signal.
  const provisionalByMatchday = new Map<string, number>()
  if (isAdmin && (matchdays?.length ?? 0) > 0) {
    const ids = (matchdays ?? []).map((m) => m.id)
    const { data: provRows } = await supabase
      .from('player_match_stats')
      .select('matchday_id')
      .eq('is_provisional', true)
      .in('matchday_id', ids)
    for (const row of provRows ?? []) {
      provisionalByMatchday.set(row.matchday_id, (provisionalByMatchday.get(row.matchday_id) ?? 0) + 1)
    }
  }

  const fmt = (dt: string | null) =>
    dt
      ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(
          new Date(dt)
        )
      : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Campionato</h1>
          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-[#8888aa]">
              {matchdays?.length ?? 0} giornate
            </p>
            <a href="/campionato" className="text-sm text-indigo-400 hover:text-indigo-300">
              Classifica →
            </a>
          </div>
        </div>
        {isAdmin && <CreateMatchdayButton />}
      </div>

      <Card>
        <CardContent className="p-0">
          {!matchdays || matchdays.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#55556a]">
              Nessuna giornata configurata. {isAdmin && 'Crea la prima giornata.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <Th>#</Th>
                  <Th>Nome</Th>
                  <Th>Apertura</Th>
                  <Th>Scadenza</Th>
                  <Th>Stato</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {matchdays.map((m) => (
                  <tr key={m.id} className="cursor-pointer transition-colors hover:bg-[#1a1a24]">
                    <td className="px-6 py-3 text-[#55556a]">{m.matchday_number ?? '—'}</td>
                    <td className="px-6 py-3">
                      <a
                        href={`/matchdays/${m.id}`}
                        className="font-medium text-white hover:text-indigo-400"
                      >
                        {m.name}
                      </a>
                    </td>
                    <td className="px-6 py-3 text-[#8888aa]">{fmt(m.opens_at)}</td>
                    <td className="px-6 py-3 text-[#8888aa]">{fmt(m.locks_at)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <MatchdayStatusBadge status={m.status} />
                        {m.is_frozen && (
                          <span className="text-sm" title="Congelata">🧊</span>
                        )}
                        {isAdmin && (provisionalByMatchday.get(m.id) ?? 0) > 0 && (
                          <span className="text-xs text-amber-400">
                            ~ {provisionalByMatchday.get(m.id)} prov.
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8888aa]">
      {children}
    </th>
  )
}
