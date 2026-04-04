import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { CreateMatchdayButton } from './CreateMatchdayButton'

export const metadata = { title: 'Giornate' }

// Priority order for "current" matchday selection
const STATUS_PRIORITY: Record<string, number> = {
  open: 0, locked: 1, scoring: 2, published: 3, draft: 4, archived: 5,
}

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

  // Pick the "current" matchday: most active by status priority, then highest number
  const current = isAdmin
    ? [...(matchdays ?? [])].sort((a, b) => {
        const pa = STATUS_PRIORITY[a.status] ?? 9
        const pb = STATUS_PRIORITY[b.status] ?? 9
        if (pa !== pb) return pa - pb
        return (b.matchday_number ?? 0) - (a.matchday_number ?? 0)
      })[0] ?? null
    : null

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
          <h1 className="text-xl font-bold text-white">Giornate</h1>
          <div className="mt-1 flex items-center gap-4">
            <p className="text-sm text-[#8888aa]">{matchdays?.length ?? 0} giornate</p>
            <a href="/campionato" className="text-sm text-indigo-400 hover:text-indigo-300">
              Classifica →
            </a>
          </div>
        </div>
        {isAdmin && <CreateMatchdayButton />}
      </div>

      {/* ── Command center: current matchday ────────────────────────────────── */}
      {isAdmin && current && (
        <div className="rounded-xl border border-indigo-500/30 bg-[#0d0d1a] p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-widest text-indigo-500">
                Giornata corrente
              </span>
              <span className="text-base font-bold text-white">{current.name}</span>
              <MatchdayStatusBadge status={current.status} />
              {current.is_frozen && <span title="Congelata">🧊</span>}
            </div>
            <a
              href={`/matchdays/${current.id}`}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Gestione completa →
            </a>
          </div>

          {/* Action grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Lineups */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Inserisci formazioni
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/import-lineups`}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-500/20 px-2 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 transition-colors"
                >
                  📝 Testo Leghe
                </a>
                <a
                  href={`/matchdays/${current.id}/import-leghe`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  📊 xlsx / csv Leghe
                </a>
                <a
                  href={`/matchdays/${current.id}/all-lineups`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  ✏️ Manuale (per squadra)
                </a>
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Statistiche
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/fixtures`}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors"
                >
                  📡 Fetch voti (FotMob / SS)
                </a>
                <a
                  href={`/matchdays/${current.id}/stats`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  📋 Modifica statistiche
                </a>
              </div>
            </div>

            {/* Calculate */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Calcolo
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/calculate`}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  ⚡ Calcola / Pubblica
                </a>
                <a
                  href={`/matchdays/${current.id}/overrides`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🔧 Override punteggi
                </a>
              </div>
            </div>

            {/* View */}
            <div className="rounded-lg border border-[#2e2e42] bg-[#111120] p-3">
              <p className="mb-2 text-xs font-medium text-[#8888aa] uppercase tracking-wide">
                Visualizza
              </p>
              <div className="space-y-1.5">
                <a
                  href={`/matchdays/${current.id}/all-lineups`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🗒️ Tutte le formazioni
                </a>
                <a
                  href={`/matchdays/${current.id}/results`}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#8888aa] hover:bg-[#1e1e30] hover:text-white transition-colors"
                >
                  🏅 Risultati
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Full matchdays table ─────────────────────────────────────────────── */}
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
                  <Th>Scadenza</Th>
                  <Th>Stato</Th>
                  {isAdmin && <Th>Accesso rapido</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {matchdays.map((m) => {
                  const isCurrent = m.id === current?.id
                  const isEditable = ['open', 'locked', 'scoring'].includes(m.status)
                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors hover:bg-[#1a1a24] ${isCurrent ? 'bg-indigo-500/5' : ''}`}
                    >
                      <td className="px-6 py-2.5 text-[#55556a]">{m.matchday_number ?? '—'}</td>
                      <td className="px-6 py-2.5">
                        <a
                          href={`/matchdays/${m.id}`}
                          className={`font-medium hover:text-indigo-400 ${isCurrent ? 'text-indigo-200' : 'text-white'}`}
                        >
                          {m.name}
                        </a>
                      </td>
                      <td className="px-6 py-2.5 text-[#8888aa] text-xs">{fmt(m.locks_at)}</td>
                      <td className="px-6 py-2.5">
                        <div className="flex items-center gap-2">
                          <MatchdayStatusBadge status={m.status} />
                          {m.is_frozen && <span className="text-sm" title="Congelata">🧊</span>}
                          {isAdmin && (provisionalByMatchday.get(m.id) ?? 0) > 0 && (
                            <span className="text-xs text-amber-400">
                              ~ {provisionalByMatchday.get(m.id)} prov.
                            </span>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-2.5">
                          <div className="flex items-center gap-2">
                            {isEditable && (
                              <a
                                href={`/matchdays/${m.id}/import-lineups`}
                                className="rounded px-2 py-0.5 text-xs bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/30"
                              >
                                Formazioni
                              </a>
                            )}
                            <a
                              href={`/matchdays/${m.id}/stats`}
                              className="rounded px-2 py-0.5 text-xs bg-[#1e1e2e] text-[#8888aa] hover:text-white"
                            >
                              Stats
                            </a>
                            <a
                              href={`/matchdays/${m.id}/calculate`}
                              className="rounded px-2 py-0.5 text-xs bg-[#1e1e2e] text-[#8888aa] hover:text-white"
                            >
                              Calcola
                            </a>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
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
