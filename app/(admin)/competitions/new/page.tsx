import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CompetitionForm } from './CompetitionForm'

export const metadata = { title: 'Nuova competizione' }

export default async function NewCompetitionPage() {
  await requireLeagueAdmin()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/competitions" className="text-sm text-[#9095b8] hover:text-indigo-400">
          ← Competizioni
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Nuova competizione</h1>
        <p className="text-sm text-[#9095b8]">
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
