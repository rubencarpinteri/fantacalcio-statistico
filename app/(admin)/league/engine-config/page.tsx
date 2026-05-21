import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EngineConfigForm } from './EngineConfigForm'

export const metadata = { title: 'Configurazione Motore — Fantacalcio Statistico' }

export default async function EngineConfigPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <a
          href="/league"
          className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← Impostazioni lega
        </a>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-1">Configurazione motore di calcolo</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            Personalizza bonus, malus e fattore minuti per la tua lega.
            I valori predefiniti corrispondono alla configurazione standard Mantra.
          </p>
        </div>
        <a
          href="/methodology"
          className="shrink-0 rounded-lg border border-hairline bg-glass-1 px-3 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-glass-2 hover:text-ink-1"
        >
          Metodologia →
        </a>
      </div>

      <Card>
        <CardHeader
          title="Parametri motore v3.0 — Pivot + Bonus"
          description="Pivot della scala voto + bonus/malus. Modifica i valori e salva. Le modifiche hanno effetto dal prossimo calcolo."
        />
        <CardContent>
          <EngineConfigForm current={current ?? null} />
        </CardContent>
      </Card>
    </div>
  )
}
