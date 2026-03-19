import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const ctx = await requireLeagueContext()
  const supabase = await createClient()

  const [teamsResult, playersResult, matchdaysResult] = await Promise.all([
    supabase
      .from('fantasy_teams')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', ctx.league.id),
    supabase
      .from('league_players')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', ctx.league.id)
      .eq('is_active', true),
    supabase
      .from('matchdays')
      .select('id, name, status, locks_at')
      .eq('league_id', ctx.league.id)
      .in('status', ['open', 'locked', 'scoring'])
      .order('locks_at', { ascending: true })
      .limit(3),
  ])

  const teamCount = teamsResult.count ?? 0
  const playerCount = playersResult.count ?? 0
  const activeMatchdays = matchdaysResult.data ?? []

  const isAdmin = ctx.role === 'league_admin'

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-white">{ctx.league.name}</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">{ctx.league.season_name}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Squadre" value={teamCount.toString()} />
        <StatCard label="Giocatori attivi" value={playerCount.toString()} />
        <StatCard
          label="Stagione"
          value={ctx.league.season_name}
          small
        />
        <StatCard
          label="Modalità"
          value={
            ctx.league.scoring_mode === 'head_to_head'
              ? 'Testa a testa'
              : ctx.league.scoring_mode === 'points_only'
              ? 'Punti'
              : 'Entrambe'
          }
          small
        />
      </div>

      {/* Active matchdays */}
      {activeMatchdays.length > 0 && (
        <Card>
          <CardHeader title="Giornate attive" />
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                    Giornata
                  </th>
                  <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                    Stato
                  </th>
                  <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                    Scadenza
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {activeMatchdays.map((m) => (
                  <tr key={m.id} className="hover:bg-[#1a1a24]">
                    <td className="px-6 py-3 font-medium text-white">{m.name}</td>
                    <td className="px-6 py-3">
                      <Badge
                        variant={
                          m.status === 'open'
                            ? 'info'
                            : m.status === 'locked'
                            ? 'warning'
                            : 'accent'
                        }
                      >
                        {m.status === 'open'
                          ? 'Aperta'
                          : m.status === 'locked'
                          ? 'Chiusa'
                          : 'In calcolo'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-[#8888aa]">
                      {m.locks_at
                        ? new Intl.DateTimeFormat('it-IT', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(new Date(m.locks_at))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Admin quick actions */}
      {isAdmin && (
        <Card>
          <CardHeader title="Azioni rapide" description="Gestione lega" />
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <QuickLink href="/league" label="Impostazioni lega" />
              <QuickLink href="/league/role-rules" label="Regole ruoli" />
              <QuickLink href="/players" label="Gestione giocatori" />
              <QuickLink href="/formations" label="Formazioni" />
              <QuickLink href="/roster" label="Importa rose" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  small = false,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <div className="rounded-xl border border-[#2e2e42] bg-[#111118] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">{label}</p>
      <p
        className={[
          'mt-1 font-bold text-white',
          small ? 'text-base' : 'text-2xl',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-4 py-2 text-sm text-[#f0f0fa] transition-colors hover:border-indigo-500/50 hover:bg-[#252532]"
    >
      {label}
    </a>
  )
}
