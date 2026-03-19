import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Competition } from '@/types/database.types'

const TYPE_LABEL: Record<string, string> = {
  campionato:    'Campionato',
  battle_royale: 'Battle Royale',
  coppa:         'Coppa',
}

const TYPE_ICON: Record<string, string> = {
  campionato:    '🏟',
  battle_royale: '⚔',
  coppa:         '🏆',
}

const STATUS_LABEL: Record<string, string> = {
  setup:     'Setup',
  active:    'Attiva',
  completed: 'Conclusa',
  cancelled: 'Annullata',
}

const STATUS_COLOR: Record<string, string> = {
  setup:     'text-[#8888aa] bg-[#1a1a24]',
  active:    'text-emerald-400 bg-emerald-500/10',
  completed: 'text-indigo-300 bg-indigo-500/10',
  cancelled: 'text-red-400 bg-red-500/10',
}

export default async function CompetitionsPage() {
  await requireLeagueAdmin()
  const ctx = await import('@/lib/league').then((m) => m.requireLeagueAdmin())
  const supabase = await createClient()

  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .eq('league_id', ctx.league.id)
    .order('created_at', { ascending: true })

  const list = (competitions ?? []) as Competition[]

  // Per-competition team counts
  const compIds = list.map((c) => c.id)
  const { data: teamCounts } = compIds.length > 0
    ? await supabase
        .from('competition_teams')
        .select('competition_id')
        .in('competition_id', compIds)
    : { data: [] }

  const teamCountMap = new Map<string, number>()
  for (const t of teamCounts ?? []) {
    teamCountMap.set(t.competition_id, (teamCountMap.get(t.competition_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Competizioni</h1>
          <p className="text-sm text-[#8888aa]">Campionato · Battle Royale · Coppa</p>
        </div>
        <a
          href="/competitions/new"
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          + Nuova competizione
        </a>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessuna competizione creata. Crea il Campionato, il Battle Royale e la Coppa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((comp) => (
            <a
              key={comp.id}
              href={`/competitions/${comp.id}`}
              className="group rounded-xl border border-[#2e2e42] bg-[#0f0f1a] p-5 transition-colors hover:border-indigo-500/40 hover:bg-[#12121f]"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{TYPE_ICON[comp.type] ?? '🏆'}</span>
                  <div>
                    <p className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {comp.name}
                    </p>
                    <p className="text-xs text-[#55556a]">
                      {TYPE_LABEL[comp.type] ?? comp.type}
                      {comp.season ? ` · ${comp.season}` : ''}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[comp.status] ?? ''}`}
                >
                  {STATUS_LABEL[comp.status] ?? comp.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#55556a]">
                <span>{teamCountMap.get(comp.id) ?? 0} squadre</span>
                <span>→ Gestisci</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
