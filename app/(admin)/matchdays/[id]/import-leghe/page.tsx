import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent } from '@/components/ui/card'
import { ImportLegheClient } from './ImportLegheClient'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Importa Leghe — ${data?.name ?? 'Giornata'}` }
}

export default async function ImportLeghePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <a href={`/matchdays/${id}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Importa da Leghe Fantacalcio</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">
          Incolla il CSV di Leghe per pubblicare i punteggi senza usare il motore interno.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <ImportLegheClient
            matchdayId={id}
            matchdayName={matchday.name}
            allTeams={teams ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
