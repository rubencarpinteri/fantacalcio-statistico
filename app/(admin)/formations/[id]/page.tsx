import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AddSlotForm } from './AddSlotForm'
import { SlotRow } from './SlotRow'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('formations').select('name').eq('id', id).single()
  return { title: data ? `Formazione: ${data.name}` : 'Formazione' }
}

export default async function FormationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: formation } = await supabase
    .from('formations')
    .select('*')
    .eq('id', id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!formation) notFound()

  const { data: slots } = await supabase
    .from('formation_slots')
    .select('*')
    .eq('formation_id', id)
    .order('is_bench')
    .order('slot_order')

  const starterSlots = (slots ?? []).filter((s) => !s.is_bench)
  const benchSlots = (slots ?? []).filter((s) => s.is_bench)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <a href="/formations" className="text-sm text-[#55556a] hover:text-indigo-400">
              ← Formazioni
            </a>
          </div>
          <h1 className="mt-1 text-xl font-bold text-white">{formation.name}</h1>
          {formation.description && (
            <p className="mt-0.5 text-sm text-[#8888aa]">{formation.description}</p>
          )}
        </div>
        <Badge variant={formation.is_active ? 'success' : 'muted'}>
          {formation.is_active ? 'Attiva' : 'Inattiva'}
        </Badge>
      </div>

      {/* Slot compatibility model explanation */}
      <div className="rounded-lg border border-[#2e2e42] bg-[#111118] px-4 py-3 text-sm text-[#8888aa] space-y-1">
        <p className="font-medium text-[#f0f0fa]">Come funzionano gli slot</p>
        <p>
          <span className="text-indigo-400">Ruoli nativi</span> — un giocatore di panchina con uno di questi ruoli può coprire lo slot senza penalità.
        </p>
        <p>
          <span className="text-amber-400">Ruoli fuori posizione (−1)</span> — può coprire lo slot ma con −1 al fantavoto (sostituzione Mantra fuori ruolo).
        </p>
        <p>
          Il portiere titolare assente è sempre sostituito per primo dal portiere di panchina, indipendentemente dall&apos;ordine di panchina.
        </p>
      </div>

      {/* Starter slots */}
      <Card>
        <CardHeader
          title={`Titolari (${starterSlots.length} slot)`}
          description="Ogni slot titolare richiede un giocatore compatibile"
        />
        <CardContent className="p-0">
          {starterSlots.length === 0 ? (
            <p className="px-6 py-4 text-sm text-[#55556a]">
              Nessuno slot titolare. Aggiungi uno slot qui sotto.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <Th>Ord.</Th>
                  <Th>Nome slot</Th>
                  <Th>Ruoli Mantra accettati</Th>
                  <Th>Azioni</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {starterSlots.map((slot) => (
                  <SlotRow key={slot.id} slot={slot} formationId={id} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bench slots */}
      <Card>
        <CardHeader
          title={`Panchina (${benchSlots.length} slot)`}
          description="Slot panchina — accettano qualsiasi ruolo se non specificato"
        />
        <CardContent className="p-0">
          {benchSlots.length === 0 ? (
            <p className="px-6 py-4 text-sm text-[#55556a]">
              Nessuno slot panchina configurato.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2e2e42]">
                  <Th>Ord.</Th>
                  <Th>Nome slot</Th>
                  <Th>Ordine panchina</Th>
                  <Th>Ruoli accettati</Th>
                  <Th>Azioni</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {benchSlots.map((slot) => (
                  <SlotRow key={slot.id} slot={slot} formationId={id} isBenchTable />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add slot form */}
      <Card>
        <CardHeader title="Aggiungi slot" />
        <CardContent>
          <AddSlotForm formationId={id} currentSlotCount={slots?.length ?? 0} />
        </CardContent>
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#8888aa]">
      {children}
    </th>
  )
}
