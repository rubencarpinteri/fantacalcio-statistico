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
        <a href={`/campionato/giornate/${id}`} className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300">
          ← {matchday.name}
        </a>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h1
            className="flex flex-wrap items-baseline gap-x-2 font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
          >
            <span className="font-semibold">Importa</span>
            <span className="serif font-normal text-ink-3">— formazioni</span>
          </h1>
          <MatchdayStatusBadge status={matchday.status} />
        </div>
        <p className="mt-1.5 max-w-2xl text-[12.5px] leading-[1.55] text-ink-4">
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
          <div className="space-y-2 text-xs text-ink-4">
            <p className="font-medium text-ink-3">Come funziona</p>
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
