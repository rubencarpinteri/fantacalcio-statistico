import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { InviteMemberForm } from './InviteMemberForm'
import { ChangeRoleForm, RemoveMemberButton } from './MemberActions'

export const metadata = { title: 'Membri lega' }

export default async function LeagueMembersPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch all members with profile + team info
  const { data: members } = await supabase
    .from('league_users')
    .select(`
      user_id,
      role,
      joined_at,
      profiles ( username, full_name ),
      fantasy_teams ( name )
    `)
    .eq('league_id', ctx.league.id)
    .order('joined_at', { ascending: true })

  type Member = {
    user_id: string
    role: 'manager' | 'league_admin'
    joined_at: string
    profiles: { username: string; full_name: string } | null
    fantasy_teams: { name: string } | null
  }

  const memberList = (members ?? []) as unknown as Member[]

  const fmt = (dt: string) =>
    new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' }).format(new Date(dt))

  const roleBadge = (role: string) =>
    role === 'league_admin'
      ? 'text-indigo-300 bg-indigo-500/10'
      : 'text-[#8888aa] bg-[#1a1a24]'

  const roleLabel = (role: string) =>
    role === 'league_admin' ? 'Admin' : 'Manager'

  return (
    <div className="space-y-6">
      <div>
        <a href="/league" className="text-sm text-[#55556a] hover:text-indigo-400">
          ← Impostazioni lega
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Membri lega</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">
          {memberList.length} {memberList.length === 1 ? 'membro' : 'membri'} · {ctx.league.name}
        </p>
      </div>

      {/* Member list */}
      <Card>
        <CardHeader title="Membri attuali" />
        <CardContent className="p-0">
          {memberList.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-[#55556a]">
              Nessun membro. Invita il primo manager qui sotto.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <th className="px-6 py-2.5 text-left text-xs font-medium text-[#55556a]">Utente</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Squadra</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Ruolo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">Iscritto</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#55556a]">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {memberList.map((m) => {
                  const isSelf = m.user_id === ctx.userId
                  return (
                    <tr key={m.user_id} className="hover:bg-[#0f0f1a]">
                      <td className="px-6 py-3">
                        <div className="font-medium text-white">
                          {m.profiles?.full_name || m.profiles?.username || '—'}
                        </div>
                        <div className="text-xs text-[#55556a]">@{m.profiles?.username ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-[#8888aa]">
                        {m.fantasy_teams?.name ?? <span className="text-[#3a3a52]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${roleBadge(m.role)}`}>
                            {roleLabel(m.role)}
                          </span>
                        ) : (
                          <ChangeRoleForm memberId={m.user_id} currentRole={m.role} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#55556a]">{fmt(m.joined_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {isSelf ? (
                          <span className="text-xs text-[#3a3a52]">Tu</span>
                        ) : (
                          <RemoveMemberButton
                            memberId={m.user_id}
                            name={m.profiles?.full_name || m.profiles?.username || m.user_id}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Invite form */}
      <Card>
        <CardHeader
          title="Invita manager"
          description="Il manager riceverà un'email con il link per impostare la password e accedere all'app."
        />
        <CardContent>
          <InviteMemberForm />
        </CardContent>
      </Card>

      {/* Info box */}
      <div className="rounded-lg border border-[#2e2e42] bg-[#080810] px-4 py-3 text-xs text-[#55556a] space-y-1">
        <p>
          <span className="text-[#8888aa]">Invito:</span> il manager riceve un link valido 24h. Cliccando il link, imposta la password e accede direttamente al proprio pannello.
        </p>
        <p>
          <span className="text-[#8888aa]">Rimozione:</span> rimuovere un membro elimina la sua squadra ma non cancella il suo account Supabase. Può essere reinvitato in futuro.
        </p>
      </div>
    </div>
  )
}
