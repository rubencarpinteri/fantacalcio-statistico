import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { PoolImport } from './PoolImport'
import type { SerieAPlayer } from '@/types/database.types'

export const metadata = { title: 'Pool Giocatori Serie A' }

const CURRENT_SEASON = '2024-25'

const RC_COLORS: Record<string, string> = {
  GK:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
  DEF: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  MID: 'bg-green-500/20 text-green-300 border-green-500/30',
  ATT: 'bg-red-500/20 text-red-300 border-red-500/30',
}

function RCBadge({ rc }: { rc: string }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-mono font-bold',
        RC_COLORS[rc] ?? 'bg-[#2e2e42] text-ink-3 border-hairline-strong',
      ].join(' ')}
    >
      {rc}
    </span>
  )
}

export default async function PoolPage() {
  await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch pool stats for current season
  const { data: players } = await supabase
    .from('serie_a_players')
    .select('*')
    .eq('season', CURRENT_SEASON)
    .order('club', { ascending: true })
    .order('full_name', { ascending: true })

  const allPlayers = (players ?? []) as SerieAPlayer[]

  const totalPlayers  = allPlayers.length
  const withSportmonks = allPlayers.filter((p) => p.sportmonks_player_id !== null).length
  const activePlayers = allPlayers.filter((p) => p.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-ink-1">Pool Giocatori Serie A</h1>
        <p className="text-sm text-ink-3">
          Stagione {CURRENT_SEASON} — database globale dei giocatori di Serie A per l&apos;assegnazione alle rose.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Giocatori nel pool', value: totalPlayers,   color: 'text-ink-1' },
          { label: 'Con ID SportMonks',  value: withSportmonks,  color: 'text-green-400' },
          { label: 'Attivi',             value: activePlayers,   color: 'text-indigo-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-hairline bg-glass-1 px-4 py-4"
          >
            <div className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="mt-1 text-xs text-ink-4">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Import section */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-ink-1">Importa giocatori nel pool</h2>
        <PoolImport />
      </div>

      {/* Players table */}
      {allPlayers.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-ink-1">
            Giocatori nel pool — stagione {CURRENT_SEASON}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['Nome', 'Squadra', 'Ruolo', 'Classe', 'SM ID', 'Attivo'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ink-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2a]">
                {allPlayers.map((p) => (
                  <tr key={p.id} className="hover:bg-glass-1">
                    <td className="px-4 py-2.5 font-medium text-ink-1">{p.full_name}</td>
                    <td className="px-4 py-2.5 text-ink-3">{p.club}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-1">
                      {p.mantra_roles.length > 0 ? p.mantra_roles.join('/') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <RCBadge rc={p.rating_class} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                      {p.sportmonks_player_id ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.is_active ? (
                        <span className="inline-flex h-2 w-2 rounded-full bg-green-500" />
                      ) : (
                        <span className="inline-flex h-2 w-2 rounded-full bg-[#55556a]" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-4">
            {totalPlayers} giocatori — scorri per vedere tutti
          </p>
        </div>
      )}

      {allPlayers.length === 0 && (
        <div className="rounded-xl border border-hairline bg-glass-1 px-6 py-10 text-center">
          <p className="text-ink-3">
            Nessun giocatore nel pool per la stagione {CURRENT_SEASON}.
          </p>
          <p className="mt-1 text-sm text-ink-4">
            Usa il modulo qui sopra per importare i giocatori da SportMonks e Leghe Fantacalcio.
          </p>
        </div>
      )}
    </div>
  )
}
