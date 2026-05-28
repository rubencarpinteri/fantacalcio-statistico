import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JoinLeagueCTA } from './_landing/JoinLeagueCTA'

export const metadata = {
  title: 'CONTROFANTA — il fantacalcio basato sui voti veri',
  description:
    'Una lega privata con voti statistici da provider professionale. Scegli con un budget, ma occhio alla popolarità: più un calciatore è scelto, più ti penalizza.',
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/dashboard')

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-5 pb-24 sm:px-8">
      <TopBar />
      <SignatureMechanic />
      <HowItWorks />
      <Competitions />
      <Footer />
    </main>
  )
}

function TopBar() {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/"
        aria-label="CONTROFANTA — home"
        className="-mx-1 flex items-center gap-3 rounded-2xl px-1 py-1 transition-opacity hover:opacity-80"
      >
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-indigo-200"
          style={{
            background:
              'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(139,111,225,0.20))',
            border: '1px solid rgba(99,102,241,0.35)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3l3 5-3 4-3-4z" />
            <path d="M12 12l5 3-2 5M12 12l-5 3 2 5M12 12l4-7M12 12l-4-7" />
          </svg>
        </span>
        <span className="flex items-baseline tracking-tight">
          <span className="text-[22px] font-semibold text-ink-1 sm:text-[26px]">CONTRO</span>
          <span className="serif text-[22px] text-ink-3 sm:text-[26px]">FANTA</span>
        </span>
      </Link>

      <Link
        href="/login"
        className="inline-flex items-center justify-center rounded-xl border border-hairline-strong bg-glass-2 px-4 py-2 text-[13px] font-semibold text-ink-1 backdrop-blur-xl transition-all hover:bg-glass-3"
      >
        Accedi
      </Link>
    </header>
  )
}

function HowItWorks() {
  const steps: { n: string; title: string; body: string }[] = [
    {
      n: '01',
      title: 'Crea o unisciti a una Lega',
      body: 'Il vostro spazio, la vostra arena: squadre, dati, curiosità; più competizioni che girano in parallelo, nel tuo format preferito. Soglie e bonus completamente personalizzabili.',
    },
    {
      n: '02',
      title: 'Scegli con il budget',
      body: 'Niente asta-fiume. Hai un budget, hai una lista, hai una testa. Costruisci la tua rosa, ma attento! Trovare le perle nascoste, o prendere il rischio di pickare il top che avranno tutti gli altri? La gloria, o una inevitabile maxi-penalità.',
    },
    {
      n: '03',
      title: 'I voti, qui, li danno i dati',
      body: 'Rating statistico da un provider mondiale. Nessun intervento umano, nessun giornalista, nessuno contro cui prendersela: i voti arrivano in automatico, frutto SOLO di ciò che succede sul campo.',
    },
    {
      n: '04',
      title: 'Fai il colpaccio',
      body: 'Trova quel giocatore che non sceglieranno gli altri, nella partita giusta. Goditi il mega bonus percentuale e guarda gli altri dall’alto.',
    },
  ]

  return (
    <section className="mt-24 sm:mt-32">
      <h2
        className="font-light tracking-tight text-ink-1"
        style={{ fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
      >
        Come funziona, <span className="serif italic text-ink-3">in breve</span>
      </h2>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className="glass rounded-2xl border border-hairline p-5"
          >
            <div className="text-[11px] font-semibold tracking-[0.18em] text-indigo-500 dark:text-indigo-300">
              {s.n}
            </div>
            <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-ink-1">
              {s.title}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Competitions() {
  return (
    <section className="mt-24 sm:mt-32">
      <h2
        className="font-light tracking-tight text-ink-1"
        style={{ fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
      >
        Una Lega, <span className="serif italic text-ink-3">tante competizioni</span>
      </h2>
      <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-3">
        La Lega resta sempre la tua, la vostra. Sono le competizioni che cambiano. Si gioca tutto
        l&apos;anno, anche durante le soste delle nazionali.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="glass-strong rounded-2xl border border-hairline-strong p-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
              Livello nazionale
            </span>
          </div>
          <h3 className="mt-3 text-[18px] font-semibold tracking-tight text-ink-1">
            Serie A
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            Campionato, Coppa, Battle Royal. Tre modi diversi di vivere la stessa stagione di Serie A;
            solo una, due, o tutte in parallelo, dentro la vostra Lega.
          </p>
        </div>

        <div className="glass-strong rounded-2xl border border-hairline-strong p-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              Livello internazionale
            </span>
          </div>
          <h3 className="mt-3 text-[18px] font-semibold tracking-tight text-ink-1">
            Mondiali · Europei · Nations League
          </h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            Le grandi competizioni internazionali. Quando il campionato si ferma, la Lega no. E anche lì,
            tocca a te scoprire le gemme nascoste, o rischiare quel votaccio dimezzato dalla Penalità di
            Polarità.
          </p>
        </div>
      </div>
    </section>
  )
}

function SignatureMechanic() {
  return (
    <section className="mt-14 sm:mt-20">
      <div className="glass-strong overflow-hidden rounded-3xl border border-hairline-strong p-7 sm:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600 dark:text-rose-300">
          La meccanica che cambia tutto
        </p>
        <h2
          className="mt-3 font-light tracking-tight text-ink-1"
          style={{ fontSize: 'clamp(26px, 4.2vw, 42px)', lineHeight: 1.1, letterSpacing: '-0.03em' }}
        >
          Tutti i giocatori, un budget: <span className="serif italic">ad ogni turno, scegli chi vuoi.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-3">
          Gli altri scoprono la tua squadra solo al calcio d&apos;inizio.
        </p>
        <p className="mt-5 flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-rose-600 dark:text-rose-300">
          <span aria-hidden className="text-[18px]">⚠️</span>
          <span>
            <span className="uppercase tracking-[0.12em]">Ma occhio!</span>{' '}
            <span className="font-normal text-ink-2">Non è facile come sembra.</span>
          </span>
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-hairline bg-glass-1 p-5 backdrop-blur-xl">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink-1">
              <span aria-hidden>⚠️</span> Penalità di popolarità
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
              Più un giocatore verrà scelto nelle squadre della tua Lega, più il suo voto
              riceverà un malus percentuale!
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.06] p-5 backdrop-blur-xl">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink-1">
              <span aria-hidden>🎯</span> Bonus MVP solitario
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
              Hai pescato l&apos;MVP della giornata e nessun altro l&apos;aveva scelto?
              Bonus pesantissimo. Lo scouting vero e la strategia pagano, sempre.
            </p>
          </div>
        </div>

        <p className="mt-7 max-w-2xl text-[14px] leading-relaxed text-ink-3">
          Ogni giornata sei davanti a una scelta: <em className="serif not-italic text-ink-2">vai sul sicuro
          col big che (forse) sceglieranno tutti contro la terzultima in classifica? O scommetti sul nome
          che nessuno conosce?</em> Vince chi sa quando rischiare. O chi inganna in settimana bluffando
          sulle sue scelte. Vale tutto.
        </p>

        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/leagues/new"
            className="inline-flex items-center justify-center rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-6 py-3 text-[14px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_22px_-6px_rgba(99,102,241,0.55),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px"
          >
            Crea una Lega
          </Link>
          <JoinLeagueCTA />
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mt-24 flex flex-col items-start justify-between gap-4 border-t border-hairline pt-6 sm:flex-row sm:items-center">
      <p className="text-[12px] text-ink-4">
        © {new Date().getFullYear()} CONTROFANTA · A project by Ruben Carpinteri
      </p>
      <div className="flex items-center gap-5">
        <Link href="/login" className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-1">
          Accedi
        </Link>
        <Link href="/leagues/new" className="text-[12.5px] text-ink-3 transition-colors hover:text-ink-1">
          Crea una Lega
        </Link>
      </div>
    </footer>
  )
}
