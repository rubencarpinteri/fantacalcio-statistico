import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FixturesManager, FetchPreview } from './FixturesManager'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Fixture — ${data?.name ?? 'Giornata'}` }
}

export default async function MatchdayFixturesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const [{ data: matchday }, { data: fixtures }] = await Promise.all([
    supabase
      .from('matchdays')
      .select('id, name, status')
      .eq('id', matchdayId)
      .eq('league_id', ctx.league.id)
      .single(),
    supabase
      .from('matchday_fixtures')
      .select('*')
      .eq('matchday_id', matchdayId)
      .order('created_at'),
  ])

  if (!matchday) notFound()

  const fixtureList = fixtures ?? []

  return (
    <div className="space-y-6">
      <div>
        <a
          href={`/matchdays/${matchdayId}`}
          className="text-sm text-[#55556a] hover:text-indigo-400"
        >
          ← {matchday.name}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">Fixture API</h1>
        <p className="mt-0.5 text-sm text-[#8888aa]">
          Configura gli ID di partita per il fetch automatico di voti e statistiche.
        </p>
      </div>

      <div className="rounded-lg border border-[#2e2e42] bg-[#111118] px-4 py-3 text-sm text-[#8888aa] space-y-1">
        <p className="font-medium text-[#f0f0fa]">Come funziona</p>
        <p>
          Inserisci gli ID di partita da{' '}
          <span className="text-indigo-400">FotMob</span> e{' '}
          <span className="text-indigo-400">SofaScore</span> per ogni incontro della giornata.
          Il sistema recupera automaticamente voti, gol, assist e cartellini, abbinando i
          giocatori al database per nome.
        </p>
        <p>
          <span className="text-amber-400">FotMob</span> è la fonte primaria per eventi
          (cartellini, autogol, rigori). <span className="text-amber-400">SofaScore</span>{' '}
          contribuisce solo al voto SofaScore.
        </p>
        <p>
          Gli abbinamenti fuzzy (in giallo nell&apos;anteprima) vanno verificati prima
          dell&apos;importazione.
        </p>
      </div>

      <Card>
        <CardHeader title="Fixture configurate" />
        <CardContent>
          <FixturesManager matchdayId={matchdayId} fixtures={fixtureList} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Fetch automatico"
          description="Recupera voti e statistiche dalle API esterne"
        />
        <CardContent>
          <FetchPreview matchdayId={matchdayId} hasFixtures={fixtureList.length > 0} />
        </CardContent>
      </Card>
    </div>
  )
}
