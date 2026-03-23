import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { LeagueSettingsForm } from './LeagueSettingsForm'

export const metadata = { title: 'Impostazioni Lega' }

export default async function LeagueSettingsPage() {
  const ctx = await requireLeagueAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Impostazioni Lega</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">
          Configura il comportamento della lega e della stagione corrente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Configurazione generale"
            description="Nome, stagione, fuso orario"
          />
          <CardContent>
            <LeagueSettingsForm league={ctx.league} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Navigazione rapida"
              description="Altre sezioni di configurazione"
            />
            <CardContent>
              <nav className="space-y-1">
                <a
                  href="/league/members"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-[#1a1a24]"
                >
                  <div>
                    <p className="font-medium text-white">Membri e inviti</p>
                    <p className="text-xs text-[#8888aa]">
                      Invita manager, cambia ruoli, gestisci le squadre
                    </p>
                  </div>
                  <span className="text-[#55556a]">→</span>
                </a>
                <a
                  href="/league/role-rules"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-[#1a1a24]"
                >
                  <div>
                    <p className="font-medium text-white">Regole ruoli ambigui</p>
                    <p className="text-xs text-[#8888aa]">
                      Configura E → DEF o MID e altri ruoli ambigui
                    </p>
                  </div>
                  <span className="text-[#55556a]">→</span>
                </a>
                <a
                  href="/formations"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-[#1a1a24]"
                >
                  <div>
                    <p className="font-medium text-white">Formazioni valide</p>
                    <p className="text-xs text-[#8888aa]">
                      Gestisci le formazioni e gli slot Mantra
                    </p>
                  </div>
                  <span className="text-[#55556a]">→</span>
                </a>
              </nav>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
