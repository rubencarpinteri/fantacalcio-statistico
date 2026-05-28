import { requireLeagueAdmin } from '@/lib/league'
import Link from 'next/link'
import type { Route } from 'next'

export const metadata = { title: 'Nuova competizione' }

export default async function NewCompetitionPage() {
  await requireLeagueAdmin()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <a href="/competitions" className="text-sm text-ink-4 hover:text-indigo-400">
          ← Competizioni
        </a>
        <h1 className="mt-1 text-xl font-bold text-ink-1">Nuova competizione</h1>
        <p className="text-sm text-ink-4">
          Scegli prima a quale livello vuoi aggiungere una competizione.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LevelCard
          href={'/competitions/new/nazionale' as Route}
          eyebrow="Livello nazionale"
          eyebrowTint="text-emerald-600 dark:text-emerald-300"
          hoverRing="hover:border-emerald-400/40"
          title="Serie A"
          description="Crea un Campionato, una Coppa o un Battle Royal sul roster di Serie A della tua Lega."
          cta="Configura competizione →"
        />
        <LevelCard
          href={'/competitions/new/internazionale' as Route}
          eyebrow="Livello internazionale"
          eyebrowTint="text-indigo-600 dark:text-indigo-300"
          hoverRing="hover:border-indigo-400/40"
          title="Competizioni Internazionali"
          description="Iscrivi la Lega a un Mondiale, Europeo o Nations League. Sono tornei globali con calendario e rose ufficiali — la tua Lega gioca la sua versione privata."
          cta="Scegli torneo →"
        />
      </div>
    </div>
  )
}

function LevelCard({
  href,
  eyebrow,
  eyebrowTint,
  hoverRing,
  title,
  description,
  cta,
}: {
  href: Route
  eyebrow: string
  eyebrowTint: string
  hoverRing: string
  title: string
  description: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full flex-col justify-between rounded-2xl border border-hairline bg-glass-1 p-5 backdrop-blur-xl transition-all hover:bg-glass-2 ${hoverRing}`}
    >
      <div>
        <p className={`text-[10.5px] font-semibold uppercase tracking-[0.18em] ${eyebrowTint}`}>
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-ink-1">
          {title}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
          {description}
        </p>
      </div>
      <p className="mt-5 text-[12.5px] font-medium text-ink-3 transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
        {cta}
      </p>
    </Link>
  )
}
