import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MatchdayStatusBadge } from '@/components/ui/badge'
import { LineupTextImport } from './LineupTextImport'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('matchdays').select('name').eq('id', id).single()
  return { title: `Importa Formazioni — ${data?.name ?? 'Giornata'}` }
}

export default async function ImportLineupsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status')
    .eq('id', id)
    .single()

  if (!matchday) notFound()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <a href={`/matchdays/${id}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {matchday.name}
        </a>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Importa Formazioni</h1>
          <MatchdayStatusBadge status={matchday.status} />
        </div>
        <p className="mt-1 text-sm text-[#8888aa]">
          Incolla il testo delle formazioni da Leghe per salvare le rose di tutte le squadre in un colpo solo.
        </p>
      </div>

      <Card>
        <CardHeader title="Testo formazioni" />
        <CardContent>
          <LineupTextImport
            matchdayId={id}
            matchdayName={matchday.name}
          />
        </CardContent>
      </Card>

      {/* Info box */}
      <Card>
        <CardContent>
          <div className="space-y-2 text-xs text-[#55556a]">
            <p className="font-medium text-[#8888aa]">Come funziona</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Incolla il testo completo delle formazioni (anche più sfide insieme)</li>
              <li>Il sistema abbina automaticamente squadre, giocatori e slot della formazione</li>
              <li>Controlla la preview: verde = pronta, giallo = avvisi, rosso = errori</li>
              <li>Conferma per salvare le formazioni abbinate — quelle con errori vengono saltate</li>
              <li>Ogni squadra riceve una nuova <em>lineup submission</em>; le precedenti sono conservate nello storico</li>
              <li>Slot assegnati in modalità estesa (⚠) applicano −1 in caso di sostituzione da panchina</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
