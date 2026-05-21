import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PricesUpload } from './PricesUpload'

export const metadata = { title: 'Prezzi giornata' }

export default async function PrezziPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireLeagueAdmin()
  const { id: matchdayId } = await params
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, name, status, locks_at')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) notFound()

  // Pool size + already-priced count for this matchday.
  const [{ count: poolSize }, { count: pricedCount }, { data: priceRows }] = await Promise.all([
    supabase
      .from('league_players')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', ctx.league.id)
      .eq('is_active', true),
    supabase
      .from('matchday_player_prices')
      .select('id', { count: 'exact', head: true })
      .eq('matchday_id', matchdayId),
    supabase
      .from('matchday_player_prices')
      .select('player_id, price, league_players!inner(full_name, club, rating_class)')
      .eq('matchday_id', matchdayId)
      .order('price', { ascending: false })
      .limit(50),
  ])

  // Type the joined rows
  type ExistingRow = {
    player_id: string
    price: number
    league_players: { full_name: string; club: string; rating_class: string } | null
  }
  const existingPriced = (priceRows ?? []) as unknown as ExistingRow[]

  const totalPool = poolSize ?? 0
  const totalPriced = pricedCount ?? 0
  const coverage = totalPool > 0 ? Math.round((totalPriced / totalPool) * 100) : 0
  const canEdit = matchday.status === 'draft'

  return (
    <div className="space-y-6">
      <div>
        <a
          href={`/campionato/giornate/${matchdayId}`}
          className="text-[12.5px] text-ink-4 transition-colors hover:text-indigo-300"
        >
          ← {matchday.name}
        </a>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <h1
            className="font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(24px, 3vw, 34px)', lineHeight: 1.15, letterSpacing: '-0.035em' }}
          >
            <span className="font-semibold">Prezzi</span>
            <span className="serif font-normal text-ink-3"> — caricamento CSV</span>
          </h1>
          <Badge variant={canEdit ? 'muted' : 'warning'}>{matchday.status}</Badge>
        </div>
        {!canEdit && (
          <p className="mt-2 text-sm text-amber-400">
            I prezzi possono essere modificati solo quando la giornata è in stato <span className="font-mono">draft</span>.
            Una volta aperta, restano congelati.
          </p>
        )}
      </div>

      {/* Coverage card */}
      <Card>
        <CardHeader title="Copertura" description="Quanti giocatori del pool hanno un prezzo per questa giornata" />
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-glass-1 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-4">Pool attivo</p>
              <p className="mt-1 font-mono text-2xl font-bold text-ink-1">{totalPool}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-glass-1 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-4">Prezzi caricati</p>
              <p className="mt-1 font-mono text-2xl font-bold text-ink-1">{totalPriced}</p>
            </div>
            <div className={`rounded-lg border p-4 ${coverage >= 95 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <p className="text-xs uppercase tracking-wider text-ink-4">Copertura</p>
              <p className={`mt-1 font-mono text-2xl font-bold ${coverage >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {coverage}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload card */}
      {canEdit && (
        <Card>
          <CardHeader
            title="Carica nuovi prezzi"
            description="CSV con 3 colonne: nome giocatore, squadra, prezzo. Header opzionale."
          />
          <CardContent>
            <PricesUpload matchdayId={matchdayId} />
          </CardContent>
        </Card>
      )}

      {/* Existing prices preview */}
      {existingPriced.length > 0 && (
        <Card>
          <CardHeader
            title={`Prezzi correnti — top ${Math.min(existingPriced.length, 50)}`}
            description="I 50 giocatori più costosi nella giornata"
          />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-4">
                    <th className="px-4 py-2">Giocatore</th>
                    <th className="px-4 py-2">Squadra</th>
                    <th className="px-4 py-2">Classe</th>
                    <th className="px-4 py-2 text-right">Prezzo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {existingPriced.map((row) => (
                    <tr key={row.player_id}>
                      <td className="px-4 py-2 text-ink-1">{row.league_players?.full_name ?? '—'}</td>
                      <td className="px-4 py-2 text-ink-3">{row.league_players?.club ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-ink-4">{row.league_players?.rating_class ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-1 font-semibold">{row.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
