import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { enrollSelfInFMAction } from './actions'

export const metadata = { title: 'FantaMondiale Statistico' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: latestComp } = await supabase
    .from('fm_competition')
    .select('id, name, edition, starts_at, status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let userTeamId: string | null = null
  let userDisplayName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', user.id)
      .maybeSingle()
    const fullName = profile?.full_name?.trim() ?? ''
    userDisplayName = fullName || profile?.username || null

    if (latestComp) {
      const { data: team } = await supabase
        .from('fm_fantasy_team')
        .select('id')
        .eq('competition_id', latestComp.id)
        .eq('manager_id', user.id)
        .maybeSingle()
      userTeamId = team?.id ?? null
    }
  }

  // Show only the first name in the greeting — "Ciao Mario" reads more
  // natural than "Ciao Mario Rossi".
  const firstName = userDisplayName?.split(' ')[0] ?? null

  const enrollmentClosed =
    latestComp?.status === 'archived' || latestComp?.status === 'completed'
  const canEnroll = !!latestComp && !userTeamId && !enrollmentClosed
  const deepLink: Route | null = latestComp
    ? (`/fantamondiale/${latestComp.id}` as Route)
    : null

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
      <div className="pt-2">
        {canEnroll && latestComp ? (
          <form
            action={enrollSelfInFMAction.bind(null, latestComp.id)}
            className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3"
          >
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">
                {firstName ? `Ciao ${firstName}` : 'Iscriviti'}
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                Manca solo una cosa: scegli il nome della tua squadra per
                completare l&apos;iscrizione al FantaMondiale.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                name="team_name"
                placeholder="Nome squadra"
                required
                minLength={2}
                maxLength={80}
                className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2.5 text-[14px] text-ink-1 placeholder-ink-5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-500 transition-colors"
              >
                Iscriviti al FantaMondiale
                <span aria-hidden>→</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Link
              href={deepLink ?? ('/fantamondiale' as Route)}
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
            {latestComp && userTeamId && (
              <p className="text-[11px] text-emerald-400/80">
                Sei iscritto.
              </p>
            )}
            {latestComp && !userTeamId && enrollmentClosed && (
              <p className="text-[11px] text-ink-5">
                Le iscrizioni sono chiuse.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
