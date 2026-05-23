import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LeagueSettingsForm } from './LeagueSettingsForm'

export const metadata = { title: 'Impostazioni Lega' }

export default async function LeagueSettingsPage() {
  const ctx = await requireLeagueAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Impostazioni</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Identità della lega, regole di gioco condivise, e impostazioni specifiche di Serie A
          e Fantamondiale. Ogni sezione indica chiaramente il suo ambito.
        </p>
      </div>

      <LeagueSettingsForm league={ctx.league} />

      {/* ── Regole di gioco ── */}
      <Card>
        <CardHeader
          title="Regole di gioco"
          description="Motore di calcolo, bonus/malus, soglie gol, popolarità, MVP. Valide per ogni competizione (Campionato, Battle Royale, Coppa, Fantamondiale)."
        />
        <CardContent>
          <a
            href="/regole-di-gioco"
            className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-4 py-3 transition-colors hover:bg-indigo-500/10"
          >
            <div>
              <p className="text-[13px] font-semibold text-indigo-300">Apri Regole di gioco →</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                Pivot, bonus/malus, soglie gol, smussamento, punti W/D/L, fasce popolarità e MVP.
              </p>
            </div>
            <span className="text-indigo-300">→</span>
          </a>
        </CardContent>
      </Card>

      {/* ── Sezioni operative ── */}
      <Card>
        <CardHeader
          title="Altre sezioni"
          description="Gestione membri, ruoli ambigui, rose, formazioni, monitoring."
        />
        <CardContent>
          <nav className="space-y-1">
            <a
              href="/league/members"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Membri e inviti</p>
                <p className="text-xs text-ink-3">Invita manager, cambia ruoli, gestisci le squadre</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/league/role-rules"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Regole ruoli ambigui</p>
                <p className="text-xs text-ink-3">Configura E → DEF o MID e altri ruoli ambigui (Serie A)</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/formations"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Formazioni valide</p>
                <p className="text-xs text-ink-3">Gestisci formazioni e slot Mantra (Serie A)</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/roster"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Gestione rose</p>
                <p className="text-xs text-ink-3">Visualizza e modifica le rose Serie A</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/fantamondiale"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Fantamondiale</p>
                <p className="text-xs text-ink-3">
                  Ogni competizione FM (Trial Scottish, Main FM, Mondiale&hellip;) ha il proprio Setup:
                  rosa, formazioni, matrice allenatore.
                </p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
            <a
              href="/league/cron-status"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-glass-1"
            >
              <div>
                <p className="font-medium text-ink-1">Stato cron SportMonks</p>
                <p className="text-xs text-ink-3">Ultimo tick, errori 24h, cronologia run</p>
              </div>
              <span className="text-ink-4">→</span>
            </a>
          </nav>
        </CardContent>
      </Card>

      <p className="text-[11px] text-ink-4">
        Lega: <span className="font-mono text-ink-3">{ctx.league.name}</span>
      </p>
    </div>
  )
}
