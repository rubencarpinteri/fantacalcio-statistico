import { requireFMContext } from '@/lib/fantamondiale/server'
import { FMTabNav } from './FMTabNav'
import { FMUserTabNav } from './FMUserTabNav'

export default async function FMCompetitionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireFMContext(id)

  return (
    <div className="space-y-0">
      <div className="mb-1 flex items-center gap-2">
        <a href="/fantamondiale" className="text-[11px] text-ink-5 hover:text-ink-3 transition-colors">
          FantaMondiale
        </a>
        <span className="text-[11px] text-ink-5">/</span>
        <span className="text-[11px] font-medium text-ink-3">
          {ctx.competition.name} {ctx.competition.edition}
        </span>
      </div>

      {ctx.isSuperAdmin ? <FMTabNav id={id} /> : <FMUserTabNav id={id} />}

      {children}
    </div>
  )
}
