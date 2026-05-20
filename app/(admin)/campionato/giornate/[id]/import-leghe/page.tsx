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
        <a href={`/campionato/giornate/${id}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {matchday.name}
        </a>
        <h1
          className="mt-2 flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
        >
          <span className="font-semibold">Importa</span>
          <span className="serif font-normal text-ink-3">— da Leghe Fantacalcio</span>
        </h1>
        <p className="mt-1.5 max-w-2xl text-[12.5px] leading-[1.55] text-ink-4">
          Carica il file .xlsx scaricato da Leghe Fantacalcio per pubblicare formazioni e punteggi SportMonks.
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
