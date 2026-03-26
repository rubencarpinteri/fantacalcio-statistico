'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveEngineConfigAction } from './actions'
import type { LeagueEngineConfig } from '@/types/database.types'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/engine/v1/config'

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
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#55556a]">{title}</p>
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
      <label className="text-xs text-[#8888aa]" htmlFor={name}>
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
        className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
      />
      {hint && <p className="text-xs text-[#55556a]">{hint}</p>}
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

  // Use DB values if available, otherwise fall back to DEFAULT_ENGINE_CONFIG
  const bm = DEFAULT_ENGINE_CONFIG.bonus_malus
  const mf = DEFAULT_ENGINE_CONFIG.minutes_factor

  // When resetKey changes, form remounts with default values
  const src = useDefaults ? null : current

  const v = {
    minutes_factor_threshold: src?.minutes_factor_threshold ?? mf.threshold,
    minutes_factor_partial:   src?.minutes_factor_partial   ?? mf.partial,
    minutes_factor_full:      src?.minutes_factor_full      ?? mf.full,

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

  return (
    <form key={resetKey} action={action} className="space-y-8">

      {/* ── Fattore minuti ──────────────────────────────────────────── */}
      <FieldGroup title="Fattore minuti">
        <Field
          label="Soglia minuti"
          name="minutes_factor_threshold"
          defaultValue={v.minutes_factor_threshold}
          step="1"
          min="1"
          max="90"
          hint="Minuti minimi per fattore pieno (default 45)"
        />
        <Field
          label="Fattore parziale (< soglia)"
          name="minutes_factor_partial"
          defaultValue={v.minutes_factor_partial}
          min="0"
          max="1"
          hint="Es. 0.50 = metà peso z-score"
        />
        <Field
          label="Fattore pieno (≥ soglia)"
          name="minutes_factor_full"
          defaultValue={v.minutes_factor_full}
          min="0"
          max="1"
          hint="Tipicamente 1.00"
        />
      </FieldGroup>

      {/* ── Gol per ruolo ───────────────────────────────────────────── */}
      <FieldGroup title="Bonus gol per ruolo">
        <Field label="Gol — Portiere (GK)"      name="goal_bonus_gk"  defaultValue={v.goal_bonus_gk}  min="0" max="10" />
        <Field label="Gol — Difensore (DEF)"    name="goal_bonus_def" defaultValue={v.goal_bonus_def} min="0" max="10" />
        <Field label="Gol — Centrocampista (MID)" name="goal_bonus_mid" defaultValue={v.goal_bonus_mid} min="0" max="10" />
        <Field label="Gol — Attaccante (ATT)"   name="goal_bonus_att" defaultValue={v.goal_bonus_att} min="0" max="10" />
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
        <Field label="Bonus tripletta"  name="hat_trick_bonus" defaultValue={v.hat_trick_bonus} min="0" max="5" hint="Sostituisce il bonus doppietta" />
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
          className="rounded-lg border border-[#2e2e42] px-5 py-2 text-sm font-medium text-[#8888aa] transition-colors hover:border-white/30 hover:text-white"
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
