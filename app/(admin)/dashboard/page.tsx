import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'FantaMondiale Statistico' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: latestComp } = await supabase
    .from('fm_competition')
    .select('id, name, edition, starts_at, status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ctaHref: Route = latestComp
    ? (`/fantamondiale/${latestComp.id}` as Route)
    : ('/fantamondiale' as Route)

  const startsAt = latestComp?.starts_at
    ? new Date(latestComp.starts_at).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <div className="mx-auto max-w-2xl space-y-10 py-8 sm:py-12">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-4">
          Edizione {latestComp?.edition ?? '2026'}
        </p>
        <h1
          className="mt-3 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(34px, 5.5vw, 56px)', lineHeight: 1.05, letterSpacing: '-0.04em' }}
        >
          Fanta<span className="font-semibold">Mondiale</span>
          <br />
          <span className="serif italic font-light text-ink-3">Statistico</span>
        </h1>
        {startsAt && (
          <p className="mt-4 text-[12px] text-ink-4">
            Inizio competizione · <span className="text-ink-2">{startsAt}</span>
          </p>
        )}
      </div>

      {/* ── Explanation ──────────────────────────────────────────────────── */}
      <div className="space-y-4 text-[14px] leading-[1.7] text-ink-2">
        <p>
          Il <span className="font-semibold text-ink-1">FantaMondiale Statistico</span> è il
          fantacalcio costruito attorno alla Coppa del Mondo 2026. Ogni partecipante compone
          la propria rosa scegliendo tra i convocati delle nazionali e segue la competizione
          fase per fase — dalla fase a gironi fino alla finale.
        </p>
        <p>
          A differenza del fanta tradizionale, i voti non sono dati da una redazione: ogni
          giocatore riceve un <span className="font-semibold text-ink-1">voto base</span>{' '}
          calcolato in modo statistico a partire dai rating di mercato, normalizzato e
          tradotto sulla scala 6.0 con bonus e malus per ruolo, minuti, gol e cartellini.
        </p>
        <p>
          Tra una fase e l&apos;altra puoi modificare la rosa, schierare la formazione e
          seguire la classifica in tempo reale. Il regolamento completo e i dettagli del
          calcolo sono disponibili all&apos;interno della competizione.
        </p>
      </div>

      {/* ── Feature tiles ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Rosa', desc: 'Convocati delle nazionali' },
          { label: 'Fasi', desc: 'Dai gironi alla finale' },
          { label: 'Voto base', desc: 'Calcolato in modo statistico' },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg border border-hairline bg-glass-1 px-3 py-3 text-center"
          >
            <p className="text-[11px] font-semibold text-ink-1">{f.label}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-ink-4">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          Vai al FantaMondiale
          <span aria-hidden>→</span>
        </Link>
        {!latestComp && (
          <p className="text-[11px] text-ink-5">
            La competizione non è ancora stata inizializzata.
          </p>
        )}
      </div>
    </div>
  )
}
