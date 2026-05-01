import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card'
import { LeagueSettingsForm } from './LeagueSettingsForm'

export const metadata = { title: 'Impostazioni Lega' }

export default async function LeagueSettingsPage() {
  const ctx = await requireLeagueAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Impostazioni Lega</h1>
        <p className="mt-0.5 text-sm text-ink-3">
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
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">Membri e inviti</p>
                    <p className="text-xs text-ink-3">
                      Invita manager, cambia ruoli, gestisci le squadre
                    </p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
                <a
                  href="/league/role-rules"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">Regole ruoli ambigui</p>
                    <p className="text-xs text-ink-3">
                      Configura E → DEF o MID e altri ruoli ambigui
                    </p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
                <a
                  href="/league/engine-config"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">Motore di calcolo</p>
                    <p className="text-xs text-ink-3">
                      Bonus, malus e fattore minuti personalizzabili
                    </p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
                <a
                  href="/formations"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">Formazioni valide</p>
                    <p className="text-xs text-ink-3">
                      Gestisci le formazioni e gli slot Mantra
                    </p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
                <a
                  href="/roster"
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
                >
                  <div>
                    <p className="font-medium text-ink-1">Gestione Rose</p>
                    <p className="text-xs text-ink-3">
                      Visualizza e modifica le rose delle squadre
                    </p>
                  </div>
                  <span className="text-ink-4">→</span>
                </a>
              </nav>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
