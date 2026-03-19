import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AddPlayerButton } from './AddPlayerButton'
import { PlayerRowActions } from './PlayerRowActions'

export const metadata = { title: 'Giocatori' }

const RATING_CLASS_BADGE: Record<string, 'info' | 'success' | 'accent' | 'warning'> = {
  GK: 'warning',
  DEF: 'info',
  MID: 'accent',
  ATT: 'success',
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; role?: string; search?: string; inactive?: string }>
}) {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()
  const params = await searchParams

  const isAdmin = ctx.role === 'league_admin'
  const showInactive = params.inactive === '1'

  let query = supabase
    .from('league_players')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('club')
    .order('full_name')

  if (!showInactive) {
    query = query.eq('is_active', true)
  }

  if (params.club) {
    query = query.eq('club', params.club)
  }

  if (params.search) {
    query = query.ilike('full_name', `%${params.search}%`)
  }

  const { data: players } = await query

  // Distinct clubs for filter dropdown
  const { data: clubs } = await supabase
    .from('league_players')
    .select('club')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('club')

  const uniqueClubs = [...new Set((clubs ?? []).map((c) => c.club))]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Giocatori</h1>
          <p className="mt-0.5 text-sm text-[#8888aa]">
            Pool giocatori della lega — {players?.length ?? 0} risultati
          </p>
        </div>
        {isAdmin && <AddPlayerButton />}
      </div>

      {/* Filters */}
      <form className="flex flex-wrap gap-3">
        <input
          name="search"
          type="search"
          placeholder="Cerca per nome…"
          defaultValue={params.search ?? ''}
          className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
        />

        <select
          name="club"
          defaultValue={params.club ?? ''}
          className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Tutti i club</option>
          {uniqueClubs.map((club) => (
            <option key={club} value={club}>
              {club}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-[#8888aa]">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={showInactive}
            className="accent-indigo-500"
          />
          Mostra inattivi
        </label>

        <button
          type="submit"
          className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-4 py-2 text-sm text-[#f0f0fa] hover:bg-[#252532]"
        >
          Filtra
        </button>
      </form>

      {/* Players table */}
      <Card>
        <CardContent className="p-0">
          {!players || players.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#55556a]">
              Nessun giocatore trovato. {isAdmin && 'Aggiungi giocatori o importa una rosa.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2e2e42]">
                    <Th>Giocatore</Th>
                    <Th>Club</Th>
                    <Th>Ruoli Mantra</Th>
                    <Th>Classe</Th>
                    {isAdmin && <Th>Azioni</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e1e2e]">
                  {players.map((player) => (
                    <tr
                      key={player.id}
                      className={[
                        'transition-colors hover:bg-[#1a1a24]',
                        !player.is_active ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <td className="px-6 py-3">
                        <span className="font-medium text-white">{player.full_name}</span>
                        {!player.is_active && (
                          <Badge variant="muted" className="ml-2">
                            Inattivo
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-3 text-[#8888aa]">{player.club}</td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1">
                          {player.mantra_roles.map((role) => (
                            <Badge
                              key={role}
                              variant={
                                role === player.primary_mantra_role ? 'accent' : 'default'
                              }
                            >
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={RATING_CLASS_BADGE[player.rating_class] ?? 'default'}>
                          {player.rating_class}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-3">
                          <PlayerRowActions player={player} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
