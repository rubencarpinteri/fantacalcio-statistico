import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { parseGameRulesFromConfigRow } from '@/lib/engine/loadGameRules'
import { PlaygroundClient } from './PlaygroundClient'

export const metadata = { title: 'Playground' }

export default async function PlaygroundPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Matchdays with at least one published team score (i.e. recompute-able)
  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('id, matchday_number, status')
    .eq('league_id', ctx.league.id)
    .order('matchday_number', { ascending: false })

  // Engine config row — owns unified game rules + engine knobs
  const { data: engineConfig } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  const baseResultRules = parseGameRulesFromConfigRow(engineConfig ?? null)

  const matchdayList = (matchdays ?? []).map((m) => ({
    id: m.id,
    label: `Giornata ${m.matchday_number}`,
    status: m.status,
  }))

  // Team name map for label display in the simulation panels
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  const teamNames: Array<[string, string]> = (teams ?? []).map((t) => [t.id, t.name])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink-1">Playground</h1>
        <p className="mt-0.5 text-sm text-ink-3">
          Simula come una giornata si comporterebbe con regole diverse, senza modificare nulla in produzione.
        </p>
      </div>

      <PlaygroundClient
        matchdays={matchdayList}
        baseEngineConfig={engineConfig ?? null}
        baseResultRules={baseResultRules}
        teamNames={teamNames}
      />
    </div>
  )
}
