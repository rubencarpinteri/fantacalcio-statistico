'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveEngineConfigAction } from './actions'
import type { LeagueEngineConfig } from '@/types/database.types'
import { DEFAULT_ENGINE_CONFIG, deriveSlope } from '@/domain/engine/v1/config'

// ── Submit button ────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
    >
      {pending ? 'Salvataggio…' : 'Salva configurazione'}
    </button>
  )
}

// ── Field helpers ────────────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-4">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  step = '0.01',
  min,
  max,
  hint,
}: {
  label: string
  name: string
  defaultValue: number
  step?: string
  min?: string
  max?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-ink-3" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue}
        className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
      />
      {hint && <p className="text-xs text-ink-4">{hint}</p>}
    </div>
  )
}

// ── Pivot section ────────────────────────────────────────────────────────────

function PivotSection({
  defaultPivotRating,
  defaultPivotVote,
}: {
  defaultPivotRating: number
  defaultPivotVote: number
}) {
  const [pivotRating, setPivotRating] = useState(defaultPivotRating)
  const [pivotVote,   setPivotVote]   = useState(defaultPivotVote)

  const slope = pivotRating < 10
    ? (10 - pivotVote) / (10 - pivotRating)
    : 1

  const examples: Array<[number, string]> = [
    [3.00, 'minimo SportMonks'],
    [5.50, 'brutta prova'],
    [6.45, 'tipica (mode)'],
    [6.50, 'baseline kickoff'],
    [6.72, 'media SportMonks'],
    [7.50, 'buona prova'],
    [8.50, 'ottima'],
    [9.50, 'top'],
    [10.00, 'massimo'],
  ]
  const fmt2 = (n: number) => n.toFixed(2)
  const compute = (r: number) => {
    const raw = pivotVote + slope * (r - pivotRating)
    return Math.max(1, Math.min(10, raw))
  }

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-indigo-300">Scala voto base</p>
        <p className="mt-1 text-xs text-ink-3 leading-relaxed">
          Una sola retta converte il voto SportMonks in voto base sulla scala 1–10.
          Il pivot ancora un valore SportMonks al voto italiano corrispondente; l&apos;altro
          estremo della retta è fissato a (10 → 10). Il bonus/malus si somma dopo.
        </p>
      </div>

      <div className="rounded-lg border border-hairline bg-transparent p-3 space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-4">Formula</p>
        <p className="font-mono text-xs text-indigo-200">
          voto_base = {fmt2(pivotVote)} + {slope.toFixed(4)} × (rating − {fmt2(pivotRating)})
        </p>
        <p className="text-xs text-ink-4">
          Pendenza = (10 − {fmt2(pivotVote)}) / (10 − {fmt2(pivotRating)}) ={' '}
          <span className="font-mono text-ink-1">{slope.toFixed(4)}</span>.
          Risultato cappato tra 1 e 10.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-3" htmlFor="pivot_rating">
            Pivot — voto SportMonks
          </label>
          <input
            id="pivot_rating"
            name="pivot_rating"
            type="number"
            step="0.01"
            min="3"
            max="9.99"
            value={pivotRating}
            onChange={(e) => setPivotRating(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
          />
          <p className="text-xs text-ink-4">
            Default <span className="font-mono">6.50</span> = punto di partenza di ogni giocatore al fischio d&apos;inizio (SportMonks).
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink-3" htmlFor="pivot_vote">
            Pivot — voto base
          </label>
          <input
            id="pivot_vote"
            name="pivot_vote"
            type="number"
            step="0.01"
            min="1"
            max="10"
            value={pivotVote}
            onChange={(e) => setPivotVote(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
          />
          <p className="text-xs text-ink-4">
            Default <span className="font-mono">6.00</span> = sufficienza italiana.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-transparent p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
          Tabella di conversione
        </p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {examples.map(([r, label]) => {
            const v = compute(r)
            const isAnchor = r === pivotRating || r === 10
            return (
              <div key={r} className="flex items-center justify-between gap-2">
                <span className="text-ink-3">
                  <span className="font-mono text-ink-1">{fmt2(r)}</span>{' '}
                  <span className="text-ink-4">{label}</span>
                </span>
                <span className={`font-mono font-semibold ${isAnchor ? 'text-indigo-300' : 'text-ink-1'}`}>
                  → {fmt2(v)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  current: LeagueEngineConfig | null
}

// ── Component ────────────────────────────────────────────────────────────────

export function EngineConfigForm({ current }: Props) {
  const [state, action] = useActionState(saveEngineConfigAction, { error: null, success: false })
  const [resetKey, setResetKey] = useState(0)
  const [useDefaults, setUseDefaults] = useState(false)

  const bm = DEFAULT_ENGINE_CONFIG.bonus_malus

  const src = useDefaults ? null : current

  const v = {
    pivot_rating: src?.pivot_rating ?? DEFAULT_ENGINE_CONFIG.pivot_rating,
    pivot_vote:   src?.pivot_vote   ?? DEFAULT_ENGINE_CONFIG.pivot_vote,

    goal_bonus_gk:  src?.goal_bonus_gk  ?? bm.goal_by_role.GK,
    goal_bonus_def: src?.goal_bonus_def ?? bm.goal_by_role.DEF,
    goal_bonus_mid: src?.goal_bonus_mid ?? bm.goal_by_role.MID,
    goal_bonus_att: src?.goal_bonus_att ?? bm.goal_by_role.ATT,

    penalty_scored_discount: src?.penalty_scored_discount ?? bm.penalty_scored_discount,
    brace_bonus:             src?.brace_bonus             ?? bm.brace_bonus,
    hat_trick_bonus:         src?.hat_trick_bonus         ?? bm.hat_trick_bonus,

    assist:         src?.assist         ?? bm.assist,
    own_goal:       src?.own_goal       ?? bm.own_goal,
    yellow_card:    src?.yellow_card    ?? bm.yellow_card,
    red_card:       src?.red_card       ?? bm.red_card,
    penalty_missed: src?.penalty_missed ?? bm.penalty_missed,
    penalty_saved:  src?.penalty_saved  ?? bm.penalty_saved,

    clean_sheet_gk:           src?.clean_sheet_gk           ?? (bm.clean_sheet_by_role.GK  ?? 0),
    clean_sheet_def:          src?.clean_sheet_def          ?? (bm.clean_sheet_by_role.DEF ?? 0),
    clean_sheet_min_minutes:  src?.clean_sheet_min_minutes  ?? bm.clean_sheet_min_minutes,

    goals_conceded_gk:               src?.goals_conceded_gk               ?? (bm.goals_conceded_by_role.GK  ?? 0),
    goals_conceded_def:              src?.goals_conceded_def              ?? (bm.goals_conceded_by_role.DEF ?? 0),
    goals_conceded_def_min_minutes:  src?.goals_conceded_def_min_minutes  ?? bm.goals_conceded_def_min_minutes,
  }

  // Acknowledge unused import in some code paths
  void deriveSlope

  return (
    <form key={resetKey} action={action} className="space-y-8">

      {/* ── Pivot ───────────────────────────────────────────────────── */}
      <PivotSection
        defaultPivotRating={v.pivot_rating}
        defaultPivotVote={v.pivot_vote}
      />

      {/* ── Gol per ruolo ───────────────────────────────────────────── */}
      <FieldGroup title="Bonus gol per ruolo">
        <Field label="Gol — Portiere (GK)"        name="goal_bonus_gk"  defaultValue={v.goal_bonus_gk}  min="0" max="10" />
        <Field label="Gol — Difensore (DEF)"      name="goal_bonus_def" defaultValue={v.goal_bonus_def} min="0" max="10" />
        <Field label="Gol — Centrocampista (MID)" name="goal_bonus_mid" defaultValue={v.goal_bonus_mid} min="0" max="10" />
        <Field label="Gol — Attaccante (ATT)"     name="goal_bonus_att" defaultValue={v.goal_bonus_att} min="0" max="10" />
        <Field
          label="Sconto gol su rigore"
          name="penalty_scored_discount"
          defaultValue={v.penalty_scored_discount}
          min="0"
          max="5"
          hint="Gol rigore = bonus ruolo − sconto"
        />
      </FieldGroup>

      {/* ── Multi-gol ───────────────────────────────────────────────── */}
      <FieldGroup title="Bonus multi-gol">
        <Field label="Bonus doppietta"  name="brace_bonus"     defaultValue={v.brace_bonus}     min="0" max="5" />
        <Field label="Bonus tripletta+" name="hat_trick_bonus" defaultValue={v.hat_trick_bonus} min="0" max="5" hint="Sostituisce il bonus doppietta" />
      </FieldGroup>

      {/* ── Altri eventi ────────────────────────────────────────────── */}
      <FieldGroup title="Altri eventi">
        <Field label="Assist"           name="assist"         defaultValue={v.assist}         min="-5" max="5"  />
        <Field label="Autorete"         name="own_goal"       defaultValue={v.own_goal}       min="-10" max="0" />
        <Field label="Ammonizione"      name="yellow_card"    defaultValue={v.yellow_card}    min="-5" max="0"  />
        <Field label="Espulsione"       name="red_card"       defaultValue={v.red_card}       min="-10" max="0" />
        <Field label="Rigore sbagliato" name="penalty_missed" defaultValue={v.penalty_missed} min="-10" max="0" />
        <Field label="Rigore parato (solo GK)" name="penalty_saved" defaultValue={v.penalty_saved} min="0" max="10" />
      </FieldGroup>

      {/* ── Clean sheet ─────────────────────────────────────────────── */}
      <FieldGroup title="Porta inviolata (clean sheet)">
        <Field label="Clean sheet — GK"  name="clean_sheet_gk"  defaultValue={v.clean_sheet_gk}  min="0" max="5" />
        <Field label="Clean sheet — DEF" name="clean_sheet_def" defaultValue={v.clean_sheet_def} min="0" max="5" />
        <Field
          label="Minuti minimi per CS"
          name="clean_sheet_min_minutes"
          defaultValue={v.clean_sheet_min_minutes}
          step="1"
          min="1"
          max="90"
        />
      </FieldGroup>

      {/* ── Goal subiti ─────────────────────────────────────────────── */}
      <FieldGroup title="Goal subiti (per goal, valore negativo)">
        <Field
          label="Goal subiti — GK"
          name="goals_conceded_gk"
          defaultValue={v.goals_conceded_gk}
          min="-5"
          max="0"
          hint="Applicato sempre"
        />
        <Field
          label="Goal subiti — DEF"
          name="goals_conceded_def"
          defaultValue={v.goals_conceded_def}
          min="-5"
          max="0"
        />
        <Field
          label="Minuti minimi per DEF"
          name="goals_conceded_def_min_minutes"
          defaultValue={v.goals_conceded_def_min_minutes}
          step="1"
          min="1"
          max="90"
        />
      </FieldGroup>

      {/* ── Submit ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton />
        <button
          type="button"
          onClick={() => { setUseDefaults(true); setResetKey(k => k + 1) }}
          className="rounded-lg border border-hairline px-5 py-2 text-sm font-medium text-ink-3 transition-colors hover:border-white/30 hover:text-ink-1"
        >
          Ripristina valori standard
        </button>
        {state.success && (
          <span className="text-sm text-emerald-400">Configurazione salvata.</span>
        )}
        {state.error && (
          <span className="text-sm text-red-400">{state.error}</span>
        )}
      </div>
    </form>
  )
}
