'use client'

import { useState, useTransition } from 'react'
import { saveConfigAction } from './actions'
import type { FMCompetitionConfig } from '@/domain/fantamondiale/config/schema'

// ── Engine preview computation (client-side) ────────────────────────────────

function computeVotoBase(
  rating: number,
  mean: number,
  std: number,
  targetMean: number,
  targetStd: number,
  multiplier: number,
  minutesFactor: number
): number {
  const z = (rating - mean) / std
  const b0 = targetMean + targetStd * z * minutesFactor
  const b1 = targetMean + multiplier * (b0 - targetMean)
  return Math.max(3, Math.min(10, Math.round(b1 * 100) / 100))
}

const PREVIEW_RATINGS = [5.5, 6.0, 6.3, 6.5, 6.7, 7.0, 7.3, 7.5, 8.0, 8.5, 9.0]

// ── Bracket editor ───────────────────────────────────────────────────────────

type Bracket = { min_pct: number; max_pct: number; pct: number }

function BracketEditor({
  label,
  brackets,
  onChange,
}: {
  label: string
  brackets: Bracket[]
  onChange: (b: Bracket[]) => void
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-4">{label}</p>
      <div className="space-y-1.5">
        {brackets.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <div className="flex items-center gap-1">
              <input
                type="number" min={0} max={100} step={1}
                value={b.min_pct}
                onChange={(e) => {
                  const next = [...brackets]
                  next[i] = { ...b, min_pct: Number(e.target.value) }
                  onChange(next)
                }}
                className="w-full rounded border border-hairline bg-glass-2 px-2 py-1 text-[11px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-ink-5">–</span>
              <input
                type="number" min={0} max={100} step={1}
                value={b.max_pct}
                onChange={(e) => {
                  const next = [...brackets]
                  next[i] = { ...b, max_pct: Number(e.target.value) }
                  onChange(next)
                }}
                className="w-full rounded border border-hairline bg-glass-2 px-2 py-1 text-[11px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-ink-5">%</span>
            </div>
            <div className="col-span-2 flex items-center gap-1">
              <span className="text-[10px] text-ink-5 shrink-0">→</span>
              <input
                type="number" step={1}
                value={b.pct}
                onChange={(e) => {
                  const next = [...brackets]
                  next[i] = { ...b, pct: Number(e.target.value) }
                  onChange(next)
                }}
                className="w-20 rounded border border-hairline bg-glass-2 px-2 py-1 text-[11px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-ink-5">%</span>
            </div>
            <button
              type="button"
              onClick={() => onChange(brackets.filter((_, j) => j !== i))}
              className="text-[10px] text-ink-5 hover:text-rose-400"
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...brackets, { min_pct: 0, max_pct: 100, pct: 0 }])}
          className="text-[10px] text-indigo-400 hover:text-indigo-300"
        >
          ＋ Fascia
        </button>
      </div>
    </div>
  )
}

// ── Main editor ──────────────────────────────────────────────────────────────

export function FMConfigEditor({
  competitionId,
  initialConfig,
}: {
  competitionId: string
  initialConfig: FMCompetitionConfig
}) {
  const [cfg, setCfg] = useState(initialConfig)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof FMCompetitionConfig>(key: K, value: FMCompetitionConfig[K]) {
    setCfg((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function updateEngine<K extends keyof FMCompetitionConfig['engine']>(
    key: K,
    value: FMCompetitionConfig['engine'][K]
  ) {
    setCfg((prev) => ({ ...prev, engine: { ...prev.engine, [key]: value } }))
    setSaved(false)
  }

  function updateFootball<K extends keyof FMCompetitionConfig['football']>(
    key: K,
    value: FMCompetitionConfig['football'][K]
  ) {
    setCfg((prev) => ({ ...prev, football: { ...prev.football, [key]: value } }))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    const fd = new FormData()
    fd.set('competition_id', competitionId)
    fd.set('config_json', JSON.stringify(cfg))
    startTransition(async () => {
      try {
        await saveConfigAction(fd)
        setSaved(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const eng = cfg.engine

  return (
    <div className="space-y-6">
      {/* ── Save bar ── */}
      <div className="sticky top-[52px] z-20 flex items-center justify-between rounded-xl border border-hairline bg-glass-1/90 backdrop-blur-xl px-4 py-3">
        <p className="text-[12px] text-ink-3">
          {saved ? '✓ Salvato' : 'Modifiche non salvate'}
        </p>
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {pending ? 'Salvo…' : 'Salva configurazione'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[12px] text-rose-300 font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      {/* ── Engine normalization ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-4">
        <p className="text-[13px] font-semibold text-ink-1">Engine v2.0 — Normalizzazione voto</p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ['rating_mean', 'Media voto', 0.01],
              ['rating_std', 'Dev. Std voto', 0.01],
              ['target_mean_vote', 'Media voto target', 0.1],
              ['target_vote_std', 'Spread voto target', 0.01],
            ] as const
          ).map(([key, label, step]) => (
            <div key={key}>
              <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">{label}</label>
              <input
                type="number"
                step={step}
                value={eng[key as keyof typeof eng] as number}
                onChange={(e) => updateEngine(key as keyof typeof eng, Number(e.target.value) as never)}
                className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [['P', 'Moltiplicatore P'], ['D', 'Moltiplicatore D'], ['C', 'Moltiplicatore C'], ['A', 'Moltiplicatore A']] as const
          ).map(([role, label]) => (
            <div key={role}>
              <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">{label}</label>
              <input
                type="number" step={0.01}
                value={eng.role_multiplier[role]}
                onChange={(e) => updateEngine('role_multiplier', { ...eng.role_multiplier, [role]: Number(e.target.value) })}
                className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        {/* ── Live preview table ── */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-5">
            Preview voto_base (90′, tutte le posizioni)
          </p>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-ink-5">
                  <th className="px-3 py-2 text-left font-semibold">Voto</th>
                  {(['P', 'D', 'C', 'A'] as const).map((r) => (
                    <th key={r} className="px-3 py-2 text-right font-semibold">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {PREVIEW_RATINGS.map((rating) => (
                  <tr key={rating} className={rating === eng.rating_mean ? 'bg-indigo-500/10' : ''}>
                    <td className="px-3 py-1.5 font-mono text-ink-3">
                      {rating.toFixed(1)}
                      {rating === eng.rating_mean ? ' ← media' : ''}
                    </td>
                    {(['P', 'D', 'C', 'A'] as const).map((role) => {
                      const vb = computeVotoBase(
                        rating,
                        eng.rating_mean,
                        eng.rating_std,
                        eng.target_mean_vote,
                        eng.target_vote_std,
                        eng.role_multiplier[role],
                        1.0
                      )
                      const diff = vb - eng.target_mean_vote
                      return (
                        <td
                          key={role}
                          className={`px-3 py-1.5 text-right font-mono ${
                            diff > 0.5 ? 'text-emerald-400' : diff < -0.5 ? 'text-rose-400' : 'text-ink-2'
                          }`}
                        >
                          {vb.toFixed(2)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[9px] text-ink-5">
            Riga evidenziata = rating medio ({eng.rating_mean}) → voto target ({eng.target_mean_vote}).
          </p>
        </div>
      </div>

      {/* ── Football bonuses ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-4">
        <p className="text-[13px] font-semibold text-ink-1">Bonus/Malus calcistici</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['goal.P', 'Goal P'],
              ['goal.D', 'Goal D'],
              ['goal.C', 'Goal C'],
              ['goal.A', 'Goal A'],
              ['assist', 'Assist'],
              ['clean_sheet.P', 'Clean Sheet P'],
              ['clean_sheet.D', 'Clean Sheet D'],
              ['penalty_saved', 'Rigore parato'],
              ['penalty_missed', 'Rigore sbagliato'],
              ['yellow_card', 'Ammonizione'],
              ['red_card', 'Espulsione'],
              ['own_goal', 'Autogol'],
              ['goal_conceded_P', 'Goal subito (P)'],
              ['brace_bonus', 'Bonus doppietta'],
              ['hat_trick_bonus', 'Bonus tripletta'],
            ] as const
          ).map(([path, label]) => {
            const [top, sub] = path.split('.') as [string, string | undefined]
            const value = sub
              ? (cfg.football[top as keyof typeof cfg.football] as Record<string, number>)[sub]
              : (cfg.football[path as keyof typeof cfg.football] as number)

            return (
              <div key={path}>
                <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">{label}</label>
                <input
                  type="number" step={0.1}
                  value={value ?? 0}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    if (sub) {
                      updateFootball(
                        top as keyof typeof cfg.football,
                        { ...(cfg.football[top as keyof typeof cfg.football] as Record<string, number>), [sub]: val } as never
                      )
                    } else {
                      updateFootball(path as keyof typeof cfg.football, val as never)
                    }
                  }}
                  className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Popularity + MVP brackets ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <BracketEditor
            label="Penalità popolarità (%)"
            brackets={cfg.popularity_brackets}
            onChange={(b) => update('popularity_brackets', b)}
          />
          <BracketEditor
            label="Bonus MVP (%)"
            brackets={cfg.mvp_bonus_brackets}
            onChange={(b) => update('mvp_bonus_brackets', b)}
          />
        </div>
        <p className="mt-3 text-[10px] text-ink-5">
          Ogni fascia: &quot;se il giocatore è posseduto da [min–max]% delle squadre, applica [pct]% di penalità/bonus&quot;.
        </p>
      </div>

      {/* ── Coach tier matrix ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Matrice allenatori</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-hairline text-[10px] text-ink-5 uppercase tracking-widest">
                <th className="pb-2 text-left font-semibold">Tier</th>
                <th className="pb-2 text-right font-semibold">Vittoria</th>
                <th className="pb-2 text-right font-semibold">Pareggio</th>
                <th className="pb-2 text-right font-semibold">Sconfitta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(['tier_1', 'tier_2', 'tier_3', 'tier_4'] as const).map((tier) => (
                <tr key={tier}>
                  <td className="py-2 pr-3 text-ink-3 font-medium">{tier.replace('_', ' ').toUpperCase()}</td>
                  {(['win', 'draw', 'loss'] as const).map((result) => (
                    <td key={result} className="py-2 text-right">
                      <input
                        type="number" step={0.5}
                        value={cfg.coach_tier_matrix[tier][result]}
                        onChange={(e) =>
                          update('coach_tier_matrix', {
                            ...cfg.coach_tier_matrix,
                            [tier]: { ...cfg.coach_tier_matrix[tier], [result]: Number(e.target.value) },
                          })
                        }
                        className="w-16 rounded border border-hairline bg-glass-2 px-2 py-1 text-[12px] text-right text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── BR thresholds ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Battle Royale — soglie goal</p>
        <p className="text-[11px] text-ink-4">
          Ogni soglia superata = +1 goal. Es. [66, 72, 78] → punteggio 74 = 2 goal.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {cfg.battle_royale.goal_thresholds.map((t, i) => (
            <input
              key={i}
              type="number" step={0.5}
              value={t}
              onChange={(e) => {
                const next = [...cfg.battle_royale.goal_thresholds]
                next[i] = Number(e.target.value)
                update('battle_royale', { ...cfg.battle_royale, goal_thresholds: next })
              }}
              className="w-16 rounded border border-hairline bg-glass-2 px-2 py-1.5 text-[12px] text-center text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ))}
          <button
            type="button"
            onClick={() => update('battle_royale', {
              ...cfg.battle_royale,
              goal_thresholds: [
                ...cfg.battle_royale.goal_thresholds,
                (cfg.battle_royale.goal_thresholds.at(-1) ?? 60) + 6,
              ],
            })}
            className="text-[11px] text-indigo-400 hover:text-indigo-300"
          >＋</button>
          <button
            type="button"
            onClick={() => update('battle_royale', {
              ...cfg.battle_royale,
              goal_thresholds: cfg.battle_royale.goal_thresholds.slice(0, -1),
            })}
            className="text-[11px] text-rose-400 hover:text-rose-300"
          >−</button>
        </div>
      </div>

      {/* ── Squad ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Rosa</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ['pool_size', 'Dim. rosa', 1],
              ['starters', 'Titolari', 1],
              ['bench', 'Panchina', 1],
              ['budget_default', 'Budget default', 10],
            ] as const
          ).map(([key, label, step]) => (
            <div key={key}>
              <label className="block text-[9px] uppercase tracking-wider text-ink-5 mb-1 font-semibold">{label}</label>
              <input
                type="number" step={step}
                value={cfg.squad[key]}
                onChange={(e) => update('squad', { ...cfg.squad, [key]: Number(e.target.value) })}
                className="w-full rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Order of operations ── */}
      <div className="rounded-xl border border-hairline bg-glass-1 p-5 space-y-3">
        <p className="text-[13px] font-semibold text-ink-1">Ordine di calcolo</p>
        <select
          value={cfg.calc_order}
          onChange={(e) => update('calc_order', e.target.value as 'mvp_then_penalty' | 'penalty_then_mvp')}
          className="w-full max-w-sm rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[13px] text-ink-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="mvp_then_penalty">1. Base → 2. Bonus/Malus → 3. MVP → 4. Penalità popolarità</option>
          <option value="penalty_then_mvp">1. Base → 2. Bonus/Malus → 3. Penalità popolarità → 4. MVP</option>
        </select>
      </div>
    </div>
  )
}
