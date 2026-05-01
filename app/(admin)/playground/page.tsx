import { requireLeagueAdmin } from '@/lib/league'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_RESULT_RULES, type ResultRulesConfig } from '@/domain/competitions/resultRules'
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

  // Engine config row
  const { data: engineConfig } = await supabase
    .from('league_engine_config')
    .select('*')
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  // Result rules — cast through unknown until DB types regenerated
  const { data: leagueRaw } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', ctx.league.id)
    .maybeSingle()

  const leagueAny = leagueRaw as unknown as { result_rules?: unknown } | null
  const baseResultRules: ResultRulesConfig = parseRules(leagueAny?.result_rules)

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
        <h1 className="text-xl font-bold text-white">Playground</h1>
        <p className="mt-0.5 text-sm text-[#b8bcdc]">
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

function parseRules(raw: unknown): ResultRulesConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_RESULT_RULES
  const r = raw as Partial<ResultRulesConfig>
  return {
    thresholds: Array.isArray(r.thresholds) ? r.thresholds : DEFAULT_RESULT_RULES.thresholds,
    smoothing: r.smoothing ?? DEFAULT_RESULT_RULES.smoothing,
    points: r.points ?? DEFAULT_RESULT_RULES.points,
  }
}
