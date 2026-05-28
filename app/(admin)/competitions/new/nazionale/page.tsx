import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CompetitionForm } from './CompetitionForm'

export const metadata = { title: 'Nuova competizione · Serie A' }

export default async function NewSerieACompetitionPage() {
  await requireLeagueAdmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/competitions/new" className="text-sm text-ink-4 hover:text-indigo-400">
          ← Scegli livello
        </a>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
          Livello nazionale · Serie A
        </p>
        <h1 className="mt-1 text-xl font-bold text-ink-1">Nuova competizione</h1>
        <p className="text-sm text-ink-4">
          Configura nome, tipo e regole di punteggio. Le squadre si iscrivono nel passaggio successivo.
        </p>
      </div>

      <Card>
        <CardHeader title="Dettagli competizione" />
        <CardContent>
          <CompetitionForm />
        </CardContent>
      </Card>
    </div>
  )
}
