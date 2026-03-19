import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CreateFormationButton } from './CreateFormationButton'
import { FormationRowActions } from './FormationRowActions'

export const metadata = { title: 'Formazioni' }

export default async function FormationsPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: formations } = await supabase
    .from('formations')
    .select('*, formation_slots(id)')
    .eq('league_id', ctx.league.id)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Formazioni</h1>
          <p className="mt-0.5 text-sm text-[#8888aa]">
            Gestisci le formazioni valide e gli slot Mantra per la lega.
            Ogni slot dichiara i ruoli Mantra compatibili.
          </p>
        </div>
        <CreateFormationButton />
      </div>

      {/* Info callout */}
      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm text-[#8888aa]">
        <span className="font-medium text-indigo-400">Nota:</span> Le formazioni sono
        completamente configurabili. Nessuna logica Mantra ufficiale è codificata nel sistema.
        Ogni slot definisce esplicitamente i ruoli Mantra accettati. Gli slot panchina sono
        permissivi per default.
      </div>

      <Card>
        <CardContent className="p-0">
          {!formations || formations.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#55556a]">
              Nessuna formazione configurata. Crea la prima formazione per iniziare.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <Th>Nome</Th>
                  <Th>Descrizione</Th>
                  <Th>Slot configurati</Th>
                  <Th>Stato</Th>
                  <Th>Azioni</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {formations.map((f) => {
                  const slotCount = Array.isArray(f.formation_slots) ? f.formation_slots.length : 0
                  return (
                    <tr key={f.id} className="transition-colors hover:bg-[#1a1a24]">
                      <td className="px-6 py-3">
                        <a
                          href={`/formations/${f.id}`}
                          className="font-medium text-white hover:text-indigo-400"
                        >
                          {f.name}
                        </a>
                      </td>
                      <td className="px-6 py-3 text-[#8888aa]">
                        {f.description ?? '—'}
                      </td>
                      <td className="px-6 py-3 text-[#8888aa]">{slotCount}</td>
                      <td className="px-6 py-3">
                        <Badge variant={f.is_active ? 'success' : 'muted'}>
                          {f.is_active ? 'Attiva' : 'Inattiva'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <FormationRowActions formation={f} />
                      </td>
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
