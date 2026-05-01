'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Database } from '@/types/database.types'
import type { ResultRulesConfig } from '@/domain/competitions/resultRules'
import type { SimulationResponse } from '@/app/api/playground/simulate/route'
import type { RecomputeAllResponse } from '@/app/api/recompute-all/route'

type EngineConfigRow = Database['public']['Tables']['league_engine_config']['Row']

type MatchdayOption = { id: string; label: string; status: string }

interface Props {
  matchdays: MatchdayOption[]
  baseEngineConfig: EngineConfigRow | null
  baseResultRules: ResultRulesConfig
  teamNames: Array<[string, string]>
}

// Numeric column keys we expose in the form. Mirrors zod schema in the API.
const ENGINE_NUMERIC_KEYS = [
  'goal_bonus_gk', 'goal_bonus_def', 'goal_bonus_mid', 'goal_bonus_att',
  'penalty_scored_discount', 'brace_bonus', 'hat_trick_bonus',
  'assist', 'own_goal', 'yellow_card', 'red_card',
  'penalty_missed', 'penalty_saved',
  'clean_sheet_gk', 'clean_sheet_def', 'clean_sheet_min_minutes',
  'goals_conceded_gk', 'goals_conceded_def', 'goals_conceded_def_min_minutes',
  'role_multiplier_gk', 'role_multiplier_def', 'role_multiplier_mid', 'role_multiplier_att',
  'fotmob_mean', 'fotmob_std', 'sofascore_mean', 'sofascore_std', 'fotmob_weight',
  'target_mean_vote', 'target_vote_std',
  'voto_base_cap_min', 'voto_base_cap_max',
  'minutes_factor_threshold', 'minutes_factor_partial', 'minutes_factor_full',
] as const
type EngineKey = typeof ENGINE_NUMERIC_KEYS[number]

export function PlaygroundClient({ matchdays, baseEngineConfig, baseResultRules, teamNames }: Props) {
  const [matchdayId, setMatchdayId] = useState<string | null>(matchdays[0]?.id ?? null)
  const [engine, setEngine] = useState<Record<EngineKey, number>>(() => initEngine(baseEngineConfig))
  const [rules, setRules] = useState<ResultRulesConfig>(baseResultRules)
  const [includeBR, setIncludeBR] = useState(true)
  const [result, setResult] = useState<SimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'team' | 'camp' | 'br'>('team')

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<RecomputeAllResponse | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const runSimulation = useCallback(async () => {
    if (!matchdayId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/playground/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchday_id: matchdayId,
          engine_config_overrides: engine,
          result_rules_overrides: rules,
          include_battle_royale: includeBR,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setResult((await res.json()) as SimulationResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [matchdayId, engine, rules, includeBR])

  // Debounce simulation on form changes
  useEffect(() => {
    const t = setTimeout(() => { void runSimulation() }, 250)
    return () => clearTimeout(t)
  }, [runSimulation])

  function resetToProduction() {
    setEngine(initEngine(baseEngineConfig))
    setRules(baseResultRules)
  }

  async function runSave() {
    setSaving(true)
    setSaveError(null)
    setSaveResult(null)
    try {
      const res = await fetch('/api/recompute-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine_config_overrides: engine,
          result_rules_overrides: rules,
          dry_run: false,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSaveResult(json as RecomputeAllResponse)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // ---- Render helpers --------------------------------------

  const teamScores = result?.team_scores ?? []
  const sortedTeams = [...teamScores].sort((a, b) => b.total_fantavoto - a.total_fantavoto)
  const campResult = result?.competition_results.find((c) => c.competition_id !== 'br-sim')
  const brResult = result?.competition_results.find((c) => c.competition_id === 'br-sim')

  const teamNameById = useMemo(() => new Map(teamNames), [teamNames])

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 py-1">
            <div>
              <label className="block text-xs text-[#b8bcdc] mb-1">Giornata</label>
              <select
                value={matchdayId ?? ''}
                onChange={(e) => setMatchdayId(e.target.value || null)}
                className="rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-sm text-white"
              >
                {matchdays.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} · {m.status}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#b8bcdc] mb-1.5">
              <input
                type="checkbox"
                checked={includeBR}
                onChange={(e) => setIncludeBR(e.target.checked)}
              />
              Includi Battle Royale
            </label>
            <div className="flex-1" />
            <button
              onClick={resetToProduction}
              className="rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-sm text-[#b8bcdc] hover:text-white"
            >
              Ripristina valori di produzione
            </button>
            <button
              onClick={() => { setSaveResult(null); setSaveError(null); setSaveDialogOpen(true) }}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Salva e ricalcola
            </button>
          </div>
        </CardContent>
      </Card>

      {saveDialogOpen && (
        <SaveDialog
          matchdayCount={matchdays.length}
          onConfirm={async () => { await runSave() }}
          onClose={() => setSaveDialogOpen(false)}
          saving={saving}
          result={saveResult}
          error={saveError}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Form column */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Regole risultato" description="Soglie gol + smoothing + punti" />
            <CardContent>
              <ResultRulesForm rules={rules} onChange={setRules} base={baseResultRules} />
            </CardContent>
          </Card>

          <CollapsibleCard title="Bonus / Malus" defaultOpen>
            <EngineGroup
              keys={['goal_bonus_gk', 'goal_bonus_def', 'goal_bonus_mid', 'goal_bonus_att', 'penalty_scored_discount']}
              labels={{ goal_bonus_gk: 'Gol GK', goal_bonus_def: 'Gol DEF', goal_bonus_mid: 'Gol MID', goal_bonus_att: 'Gol ATT', penalty_scored_discount: 'Sconto rigore' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
            <EngineGroup
              keys={['assist', 'own_goal', 'yellow_card', 'red_card', 'penalty_missed', 'penalty_saved']}
              labels={{ assist: 'Assist', own_goal: 'Autogol', yellow_card: 'Giallo', red_card: 'Rosso', penalty_missed: 'Rig. sbagliato', penalty_saved: 'Rig. parato (GK)' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
            <EngineGroup
              keys={['clean_sheet_gk', 'clean_sheet_def', 'clean_sheet_min_minutes', 'goals_conceded_gk', 'goals_conceded_def', 'goals_conceded_def_min_minutes']}
              labels={{ clean_sheet_gk: 'PI GK', clean_sheet_def: 'PI DEF', clean_sheet_min_minutes: 'PI min minuti', goals_conceded_gk: 'Gol subiti GK', goals_conceded_def: 'Gol subiti DEF', goals_conceded_def_min_minutes: 'Gol sub. DEF min min.' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
            <EngineGroup
              keys={['brace_bonus', 'hat_trick_bonus']}
              labels={{ brace_bonus: 'Doppietta', hat_trick_bonus: 'Tripletta+' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Calibrazione voto base">
            <EngineGroup
              keys={['target_mean_vote', 'target_vote_std', 'voto_base_cap_min', 'voto_base_cap_max']}
              labels={{ target_mean_vote: 'Voto medio target', target_vote_std: 'σ voto target', voto_base_cap_min: 'Cap min', voto_base_cap_max: 'Cap max' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
            <EngineGroup
              keys={['role_multiplier_gk', 'role_multiplier_def', 'role_multiplier_mid', 'role_multiplier_att']}
              labels={{ role_multiplier_gk: 'Mult. GK', role_multiplier_def: 'Mult. DEF', role_multiplier_mid: 'Mult. MID', role_multiplier_att: 'Mult. ATT' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
            <EngineGroup
              keys={['minutes_factor_threshold', 'minutes_factor_partial', 'minutes_factor_full']}
              labels={{ minutes_factor_threshold: 'Soglia minuti', minutes_factor_partial: 'Fattore parz.', minutes_factor_full: 'Fattore pieno' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
          </CollapsibleCard>

          <CollapsibleCard title="Normalizzazione (FotMob / SofaScore)">
            <EngineGroup
              keys={['fotmob_mean', 'fotmob_std', 'sofascore_mean', 'sofascore_std', 'fotmob_weight']}
              labels={{ fotmob_mean: 'FM media', fotmob_std: 'FM σ', sofascore_mean: 'SS media', sofascore_std: 'SS σ', fotmob_weight: 'Peso FM' }}
              engine={engine}
              base={baseEngineConfig}
              onChange={(k, v) => setEngine((s) => ({ ...s, [k]: v }))}
            />
          </CollapsibleCard>
        </div>

        {/* Results column */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Risultati simulati"
              description={loading ? 'Calcolo in corso…' : error ? `Errore: ${error}` : ' '}
            />
            <CardContent>
              <div className="mb-3 flex gap-1 border-b border-white/10">
                <Tab active={activeTab === 'team'} onClick={() => setActiveTab('team')}>Punteggi squadre</Tab>
                <Tab active={activeTab === 'camp'} onClick={() => setActiveTab('camp')}>Campionato</Tab>
                <Tab active={activeTab === 'br'} onClick={() => setActiveTab('br')} disabled={!includeBR}>Battle Royale</Tab>
              </div>

              {activeTab === 'team' && (
                <TeamScoresPanel teams={sortedTeams} teamNameById={teamNameById} />
              )}
              {activeTab === 'camp' && (
                <FixturesPanel fixtures={campResult?.fixtures ?? []} teamNameById={teamNameById} emptyHint="Nessun campionato attivo per questa giornata." />
              )}
              {activeTab === 'br' && (
                <BattleRoyalePanel
                  fixtures={brResult?.fixtures ?? []}
                  standings={brResult?.standings ?? []}
                  teamNameById={teamNameById}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Subcomponents
// ============================================================

function ResultRulesForm({ rules, onChange, base }: { rules: ResultRulesConfig; onChange: (r: ResultRulesConfig) => void; base: ResultRulesConfig }) {
  const updateThreshold = (i: number, field: 'min' | 'goals', val: number) => {
    const next = rules.thresholds.map((t, idx) => idx === i ? { ...t, [field]: val } : t)
    onChange({ ...rules, thresholds: next })
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-[#b8bcdc]">Soglie gol</p>
        <div className="space-y-1">
          {rules.thresholds.map((t, i) => {
            const baseT = base.thresholds[i]
            const changed = baseT && (baseT.min !== t.min || baseT.goals !== t.goals)
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 text-xs text-[#9095b8]">≥</span>
                <input
                  type="number"
                  step="0.1"
                  value={t.min}
                  onChange={(e) => updateThreshold(i, 'min', parseFloat(e.target.value) || 0)}
                  className={`w-24 rounded border bg-transparent px-2 py-1 text-sm text-white ${changed ? 'border-amber-500/50' : 'border-white/10'}`}
                />
                <span className="text-xs text-[#9095b8]">→</span>
                <input
                  type="number"
                  step="1"
                  value={t.goals}
                  onChange={(e) => updateThreshold(i, 'goals', parseInt(e.target.value) || 0)}
                  className={`w-16 rounded border bg-transparent px-2 py-1 text-sm text-white ${changed ? 'border-amber-500/50' : 'border-white/10'}`}
                />
                <span className="text-xs text-[#9095b8]">gol</span>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[#b8bcdc]">Smoothing (anti-fortuna)</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Pareggio se Δ <"
            value={rules.smoothing.drawIfDiffBelow}
            base={base.smoothing.drawIfDiffBelow}
            step={0.1}
            onChange={(v) => onChange({ ...rules, smoothing: { ...rules.smoothing, drawIfDiffBelow: v } })}
          />
          <NumberField
            label="Pareggio se 1g lead & Δ <"
            value={rules.smoothing.drawIf1GoalLeadAndDiffBelow}
            base={base.smoothing.drawIf1GoalLeadAndDiffBelow}
            step={0.1}
            onChange={(v) => onChange({ ...rules, smoothing: { ...rules.smoothing, drawIf1GoalLeadAndDiffBelow: v } })}
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[#b8bcdc]">Punti</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Vittoria" value={rules.points.win} base={base.points.win} step={1}
            onChange={(v) => onChange({ ...rules, points: { ...rules.points, win: v } })} />
          <NumberField label="Pareggio" value={rules.points.draw} base={base.points.draw} step={1}
            onChange={(v) => onChange({ ...rules, points: { ...rules.points, draw: v } })} />
          <NumberField label="Sconfitta" value={rules.points.loss} base={base.points.loss} step={1}
            onChange={(v) => onChange({ ...rules, points: { ...rules.points, loss: v } })} />
        </div>
      </div>
    </div>
  )
}

function EngineGroup({ keys, labels, engine, base, onChange }: {
  keys: EngineKey[]
  labels: Record<string, string>
  engine: Record<EngineKey, number>
  base: EngineConfigRow | null
  onChange: (k: EngineKey, v: number) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {keys.map((k) => {
        const baseVal = base?.[k as keyof EngineConfigRow] as number | null | undefined
        return (
          <NumberField
            key={k}
            label={labels[k] ?? k}
            value={engine[k]}
            base={typeof baseVal === 'number' ? baseVal : engine[k]}
            step={0.1}
            onChange={(v) => onChange(k, v)}
          />
        )
      })}
    </div>
  )
}

function NumberField({ label, value, base, step, onChange }: {
  label: string; value: number; base: number; step: number; onChange: (v: number) => void
}) {
  const changed = value !== base
  return (
    <label className="block">
      <span className="block text-[11px] text-[#9095b8] mb-0.5">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        className={`w-full rounded border bg-transparent px-2 py-1 text-sm text-white ${changed ? 'border-amber-500/50' : 'border-white/10'}`}
      />
    </label>
  )
}

function CollapsibleCard({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-white/10 px-6 py-4"
      >
        <h2 className="text-sm font-semibold text-[#f5f7ff]">{title}</h2>
        <span className="text-[#9095b8]">{open ? '−' : '+'}</span>
      </button>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  )
}

function Tab({ active, disabled, children, onClick }: { active: boolean; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors',
        active ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-[#b8bcdc] hover:text-white',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function TeamScoresPanel({ teams, teamNameById }: { teams: SimulationResponse['team_scores']; teamNameById: Map<string, string> }) {
  if (teams.length === 0) return <Empty>Nessun punteggio simulato.</Empty>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-[#9095b8]"><th className="py-1">Team</th><th>Tot.</th><th className="text-right">NV</th></tr></thead>
      <tbody>
        {teams.map((t, idx) => (
          <tr key={t.team_id} className="border-t border-white/10">
            <td className="py-1.5 text-white">{idx + 1}. {teamNameById.get(t.team_id) ?? t.team_id.slice(0, 6)}</td>
            <td className="text-white font-mono">{t.total_fantavoto.toFixed(1)}</td>
            <td className="text-right text-[#9095b8]">{t.nv_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FixturesPanel({ fixtures, teamNameById, emptyHint }: { fixtures: NonNullable<SimulationResponse['competition_results'][number]>['fixtures']; teamNameById: Map<string, string>; emptyHint: string }) {
  if (fixtures.length === 0) return <Empty>{emptyHint}</Empty>
  return (
    <div className="space-y-1">
      {fixtures.map((f) => (
        <div key={f.fixture_id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm">
          <span className="flex-1 text-right text-white truncate">{teamNameById.get(f.home_team_id) ?? f.home_team_id.slice(0,6)}</span>
          <span className="mx-3 font-mono text-white">{f.home_score ?? '–'}–{f.away_score ?? '–'}</span>
          <span className="flex-1 text-white truncate">{teamNameById.get(f.away_team_id) ?? f.away_team_id.slice(0,6)}</span>
          <span className="ml-2 w-16 text-right text-xs text-[#9095b8] font-mono">{f.home_fantavoto.toFixed(1)}–{f.away_fantavoto.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

function BattleRoyalePanel({ fixtures, standings, teamNameById }: { fixtures: NonNullable<SimulationResponse['competition_results'][number]>['fixtures']; standings: NonNullable<SimulationResponse['competition_results'][number]>['standings']; teamNameById: Map<string, string> }) {
  const [showAllPairs, setShowAllPairs] = useState(false)
  if (standings.length === 0) return <Empty>Battle Royale non disponibile.</Empty>
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-[#9095b8]"><th className="py-1">Team</th><th>Pt</th><th>V/N/P</th><th>GF:GS</th><th className="text-right">DR</th></tr></thead>
        <tbody>
          {standings.map((s, idx) => (
            <tr key={s.team_id} className="border-t border-white/10">
              <td className="py-1.5 text-white">{idx + 1}. {teamNameById.get(s.team_id) ?? s.team_id.slice(0, 6)}</td>
              <td className="text-white font-mono font-bold">{s.points}</td>
              <td className="text-[#b8bcdc] font-mono">{s.wins}/{s.draws}/{s.losses}</td>
              <td className="text-[#b8bcdc] font-mono">{s.goals_for}:{s.goals_against}</td>
              <td className="text-right text-[#b8bcdc] font-mono">{s.goal_difference > 0 ? '+' : ''}{s.goal_difference}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => setShowAllPairs((s) => !s)}
        className="text-xs text-indigo-400 hover:text-indigo-300"
      >
        {showAllPairs ? '▾ Nascondi' : '▸ Mostra'} tutte le {fixtures.length} partite
      </button>
      {showAllPairs && (
        <div className="max-h-96 overflow-auto">
          <FixturesPanel fixtures={fixtures} teamNameById={teamNameById} emptyHint="—" />
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-[#9095b8]">{children}</div>
}

// ============================================================
// SaveDialog
// ============================================================

function SaveDialog({
  matchdayCount,
  onConfirm,
  onClose,
  saving,
  result,
  error,
}: {
  matchdayCount: number
  onConfirm: () => Promise<void>
  onClose: () => void
  saving: boolean
  result: RecomputeAllResponse | null
  error: string | null
}) {
  const done = !!result || !!error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
        {!done && !saving && (
          <>
            <h2 className="mb-2 text-base font-semibold text-white">Salva configurazione e ricalcola</h2>
            <p className="mb-4 text-sm text-[#b8bcdc]">
              Questa operazione salva la nuova configurazione del motore e delle regole risultato,
              poi ricalcola <span className="text-white font-medium">{matchdayCount} giornate</span> con
              dati pubblicati e aggiorna tutte le competizioni attive. L&apos;operazione è irreversibile.
            </p>
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              ⚠ I punteggi pubblicati verranno sovrascritti. I calcoli precedenti rimangono accessibili
              nell&apos;archivio dei run.
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-[#b8bcdc] hover:text-white"
              >
                Annulla
              </button>
              <button
                onClick={() => { void onConfirm() }}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Conferma e ricalcola
              </button>
            </div>
          </>
        )}

        {saving && (
          <div className="py-6 text-center">
            <div className="mb-3 text-2xl animate-spin inline-block">⏳</div>
            <p className="text-sm text-[#b8bcdc]">Ricalcolo in corso…</p>
            <p className="mt-1 text-xs text-[#9095b8]">Non chiudere questa finestra.</p>
          </div>
        )}

        {done && result && (
          <>
            <h2 className="mb-3 text-base font-semibold text-white">Ricalcolo completato</h2>
            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="text-lg font-bold text-green-400">{result.matchdays_ok}</div>
                <div className="text-xs text-[#9095b8]">Giornate OK</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="text-lg font-bold text-[#b8bcdc]">{result.matchdays_skipped}</div>
                <div className="text-xs text-[#9095b8]">Saltate</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="text-lg font-bold text-red-400">{result.matchdays_errored}</div>
                <div className="text-xs text-[#9095b8]">Errori</div>
              </div>
            </div>
            <p className="mb-4 text-xs text-[#9095b8]">
              Turni competizioni aggiornati: <span className="text-white">{result.competitions_rounds_recomputed}</span>
            </p>
            {result.matchdays_errored > 0 && (
              <div className="mb-4 max-h-40 overflow-auto rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 space-y-1">
                {result.results.filter((r) => r.status === 'error').map((r) => (
                  <div key={r.matchday_id}><span className="text-red-400 font-medium">{r.label}:</span> {r.error}</div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-[#b8bcdc] hover:text-white"
              >
                Chiudi
              </button>
            </div>
          </>
        )}

        {done && error && (
          <>
            <h2 className="mb-3 text-base font-semibold text-white">Errore durante il ricalcolo</h2>
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-md border border-white/10 px-4 py-1.5 text-sm text-[#b8bcdc] hover:text-white"
              >
                Chiudi
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Init helpers
// ============================================================

function initEngine(row: EngineConfigRow | null): Record<EngineKey, number> {
  const out = {} as Record<EngineKey, number>
  for (const k of ENGINE_NUMERIC_KEYS) {
    const v = row ? (row[k as keyof EngineConfigRow] as unknown) : undefined
    out[k] = typeof v === 'number' ? v : 0
  }
  return out
}
