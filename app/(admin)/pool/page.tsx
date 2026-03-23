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
        RC_COLORS[rc] ?? 'bg-[#2e2e42] text-[#8888aa] border-[#3a3a52]',
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
  const withSS        = allPlayers.filter((p) => p.sofascore_id !== null).length
  const withFM        = allPlayers.filter((p) => p.fotmob_id    !== null).length
  const activePlayers = allPlayers.filter((p) => p.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Pool Giocatori Serie A</h1>
        <p className="text-sm text-[#8888aa]">
          Stagione {CURRENT_SEASON} — database globale dei giocatori di Serie A per l&apos;assegnazione alle rose.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Giocatori nel pool', value: totalPlayers,   color: 'text-white' },
          { label: 'Con ID SofaScore',   value: withSS,          color: 'text-green-400' },
          { label: 'Con ID FotMob',      value: withFM,          color: 'text-green-400' },
          { label: 'Attivi',             value: activePlayers,   color: 'text-indigo-400' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] px-4 py-4"
          >
            <div className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="mt-1 text-xs text-[#55556a]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Import section */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-white">Importa giocatori nel pool</h2>
        <PoolImport />
      </div>

      {/* Players table */}
      {allPlayers.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-white">
            Giocatori nel pool — stagione {CURRENT_SEASON}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#2e2e42]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42] text-left">
                  {['Nome', 'Squadra', 'Ruolo', 'Classe', 'SS ID', 'FM ID', 'Attivo'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8888aa]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2a]">
                {allPlayers.map((p) => (
                  <tr key={p.id} className="hover:bg-[#0d0d18]">
                    <td className="px-4 py-2.5 font-medium text-white">{p.full_name}</td>
                    <td className="px-4 py-2.5 text-[#8888aa]">{p.club}</td>
                    <td className="px-4 py-2.5 text-xs text-[#f0f0fa]">
                      {p.mantra_roles.length > 0 ? p.mantra_roles.join('/') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <RCBadge rc={p.rating_class} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#8888aa]">
                      {p.sofascore_id ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-[#8888aa]">
                      {p.fotmob_id ?? '—'}
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
          <p className="mt-2 text-xs text-[#55556a]">
            {totalPlayers} giocatori — scorri per vedere tutti
          </p>
        </div>
      )}

      {allPlayers.length === 0 && (
        <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d18] px-6 py-10 text-center">
          <p className="text-[#8888aa]">
            Nessun giocatore nel pool per la stagione {CURRENT_SEASON}.
          </p>
          <p className="mt-1 text-sm text-[#55556a]">
            Usa il modulo qui sopra per importare i giocatori da SofaScore, FotMob e Leghe Fantacalcio.
          </p>
        </div>
      )}
    </div>
  )
}
