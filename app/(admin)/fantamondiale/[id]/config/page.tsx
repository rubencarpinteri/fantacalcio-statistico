import { requireFMContext, assertSuperAdmin } from '@/lib/fantamondiale/server'
import { DEFAULT_FM_CONFIG } from '@/domain/fantamondiale/config/defaults'
import { FMConfigEditor } from './FMConfigEditor'
import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireFMContext(id)
  assertSuperAdmin(ctx)

  const storedConfig = ctx.config?.config as FMCompetitionConfig | null
  const config: FMCompetitionConfig = storedConfig ?? DEFAULT_FM_CONFIG

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[16px] font-semibold text-ink-1">Regole e configurazione</h2>
        <p className="mt-0.5 text-[11px] text-ink-4">
          Tutte le modifiche sono applicate ai calcoli futuri — i punteggi già pubblicati rimangono invariati.
        </p>
      </div>

      <FMConfigEditor competitionId={id} initialConfig={config} />
    </div>
  )
}
