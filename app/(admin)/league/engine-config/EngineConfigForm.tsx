'use client'

import { useActionState, useState, useId } from 'react'
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

// ── Weight slider ────────────────────────────────────────────────────────────

function WeightSlider({ defaultValue }: { defaultValue: number }) {
  const [weight, setWeight] = useState(defaultValue)
  const id = useId()
  const fmPct  = Math.round(weight * 100)
  const ssPct  = 100 - fmPct

  return (
    <div className="col-span-full flex flex-col gap-2">
      <p className="text-xs text-[#8888aa]">Peso fonti (FotMob / SofaScore)</p>

      {/* Labels + percentages */}
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-indigo-300">FotMob <span className="font-mono text-white">{fmPct}%</span></span>
        <span className="text-purple-300">SofaScore <span className="font-mono text-white">{ssPct}%</span></span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          id={id}
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="w-full cursor-pointer accent-indigo-500"
        />
        {/* Hidden input carries the value into the form action */}
        <input type="hidden" name="fotmob_weight" value={weight} />
      </div>

      <p className="text-xs text-[#55556a]">
        z_combinato = {fmPct}% × z_FotMob + {ssPct}% × z_SofaScore
      </p>
    </div>
  )
}

// ── Target distribution section ──────────────────────────────────────────────

function TargetDistributionSection({
  defaultMean,
  defaultStd,
}: {
  defaultMean: number
  defaultStd: number
}) {
  const [mean, setMean] = useState(defaultMean)
  const [std,  setStd]  = useState(defaultStd)

  // Worked example with z = +1.0 and z = -1.0
  const exampleZ    = 1.0
  const votoPlus    = (mean + exampleZ * std).toFixed(2)
  const votoMinus   = (mean - exampleZ * std).toFixed(2)
  const votoNeutral = mean.toFixed(2)

  // ±2σ range (before role multiplier and clamp)
  const rangeHigh = (mean + 2 * std).toFixed(2)
  const rangeLow  = (mean - 2 * std).toFixed(2)

  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-5">

      {/* Section header */}
      <div>
        <p className="text-sm font-semibold text-indigo-300">Scala voto finale</p>
        <p className="mt-1 text-xs text-[#8888aa] leading-relaxed">
          Definisce la distribuzione dei voti base nella nostra lega. È il secondo passo della
          calibrazione, applicato dopo la normalizzazione z-score delle fonti esterne.
        </p>
      </div>

      {/* Two-step explanation */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-3 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-[#55556a]">
            Passo 1 — Normalizzazione fonti
          </p>
          <p className="font-mono text-xs text-[#8888aa]">
            z = (voto_fonte − media_fonte) / std_fonte
          </p>
          <p className="text-xs text-[#55556a]">
            Converte i voti FotMob e SofaScore in z-score comparabili tramite le
            impostazioni &ldquo;Normalizzazione voti&rdquo; qui sopra.
          </p>
        </div>
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/8 p-3 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">
            Passo 2 — Calibrazione scala finale ← questa sezione
          </p>
          <p className="font-mono text-xs text-indigo-200">
            voto = media_finale + z × std_finale
          </p>
          <p className="text-xs text-[#8888aa]">
            Proietta lo z-score combinato sulla nostra scala fantacalcio, con centro e
            dispersione configurabili indipendentemente dalle fonti.
          </p>
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#8888aa]" htmlFor="target_mean_vote">
            Media voto finale
          </label>
          <input
            id="target_mean_vote"
            name="target_mean_vote"
            type="number"
            step="0.01"
            min="4"
            max="8"
            value={mean}
            onChange={(e) => setMean(Number(e.target.value))}
            className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-[#55556a]">
            Definisce il centro della nostra scala voto finale (z = 0 → questo voto)
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#8888aa]" htmlFor="target_vote_std">
            Deviazione standard voto finale
          </label>
          <input
            id="target_vote_std"
            name="target_vote_std"
            type="number"
            step="0.01"
            min="0.1"
            max="3"
            value={std}
            onChange={(e) => setStd(Number(e.target.value))}
            className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-[#55556a]">
            Definisce quanto i voti finali saranno compressi o dispersi (±1σ = ±{std.toFixed(2)} pt)
          </p>
        </div>
      </div>

      {/* Live formula preview */}
      <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[#55556a]">
          Anteprima formula live
        </p>

        <div className="space-y-1">
          <p className="font-mono text-xs text-indigo-200">
            b0 = {mean.toFixed(2)} + z_combinato × {std.toFixed(2)}
          </p>
          <p className="font-mono text-xs text-[#8888aa]">
            b1 = {mean.toFixed(2)} + moltiplicatore_ruolo × (b0 − {mean.toFixed(2)})
          </p>
          <p className="font-mono text-xs text-[#8888aa]">
            voto_base = clamp(b1, 3.00, 9.50)
          </p>
        </div>

        {/* Worked example */}
        <div className="border-t border-[#2e2e42] pt-3 space-y-1">
          <p className="text-xs font-medium text-[#55556a]">
            Esempio pratico (MID, minuti pieni, moltiplicatore 1.00):
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="rounded bg-green-500/10 px-2 py-1 text-center">
              <p className="text-[#55556a]">z = +1.00</p>
              <p className="text-green-300 font-semibold">{votoPlus}</p>
            </div>
            <div className="rounded bg-[#1a1a24] px-2 py-1 text-center">
              <p className="text-[#55556a]">z = 0.00</p>
              <p className="text-white font-semibold">{votoNeutral}</p>
            </div>
            <div className="rounded bg-red-500/10 px-2 py-1 text-center">
              <p className="text-[#55556a]">z = −1.00</p>
              <p className="text-red-300 font-semibold">{votoMinus}</p>
            </div>
          </div>
          <p className="text-xs text-[#55556a] pt-1">
            Range teorico ±2σ (prima del moltiplicatore ruolo e del clamp):{' '}
            <span className="font-mono text-white">{rangeLow} – {rangeHigh}</span>
          </p>
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

  // Use DB values if available, otherwise fall back to DEFAULT_ENGINE_CONFIG
  const bm = DEFAULT_ENGINE_CONFIG.bonus_malus
  const mf = DEFAULT_ENGINE_CONFIG.minutes_factor
  const rm = DEFAULT_ENGINE_CONFIG.role_multiplier
  const fn = DEFAULT_ENGINE_CONFIG.source_normalization
  const sn = DEFAULT_ENGINE_CONFIG.sofascore_normalization

  // When resetKey changes, form remounts with default values
  const src = useDefaults ? null : current

  const v = {
    fotmob_mean:    src?.fotmob_mean    ?? fn.mean,
    fotmob_std:     src?.fotmob_std     ?? fn.std,
    sofascore_mean: src?.sofascore_mean ?? sn.mean,
    sofascore_std:  src?.sofascore_std  ?? sn.std,
    fotmob_weight:  src?.fotmob_weight  ?? DEFAULT_ENGINE_CONFIG.fotmob_weight,

    minutes_factor_threshold: src?.minutes_factor_threshold ?? mf.threshold,
    minutes_factor_partial:   src?.minutes_factor_partial   ?? mf.partial,
    minutes_factor_full:      src?.minutes_factor_full      ?? mf.full,

    role_multiplier_gk:  src?.role_multiplier_gk  ?? rm.GK,
    role_multiplier_def: src?.role_multiplier_def ?? rm.DEF,
    role_multiplier_mid: src?.role_multiplier_mid ?? rm.MID,
    role_multiplier_att: src?.role_multiplier_att ?? rm.ATT,

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

    target_mean_vote: src?.target_mean_vote ?? DEFAULT_ENGINE_CONFIG.target_mean_vote,
    target_vote_std:  src?.target_vote_std  ?? DEFAULT_ENGINE_CONFIG.target_vote_std,
  }

  return (
    <form key={resetKey} action={action} className="space-y-8">

      {/* ── Normalizzazione voti ────────────────────────────────────── */}
      <FieldGroup title="Normalizzazione voti (z-score)">
        <Field
          label="FotMob — media"
          name="fotmob_mean"
          defaultValue={v.fotmob_mean}
          step="0.01"
          min="5"
          max="8"
          hint="Voto medio FotMob (default 6.6)"
        />
        <Field
          label="FotMob — deviazione standard"
          name="fotmob_std"
          defaultValue={v.fotmob_std}
          step="0.01"
          min="0.1"
          max="3"
          hint="Dispersione dei voti FotMob (default 0.79)"
        />
        <Field
          label="SofaScore — media"
          name="sofascore_mean"
          defaultValue={v.sofascore_mean}
          step="0.01"
          min="5"
          max="8"
          hint="Voto medio SofaScore (default 6.6)"
        />
        <Field
          label="SofaScore — deviazione standard"
          name="sofascore_std"
          defaultValue={v.sofascore_std}
          step="0.01"
          min="0.1"
          max="3"
          hint="Dispersione dei voti SofaScore (default 0.65)"
        />
        <WeightSlider defaultValue={v.fotmob_weight} />
      </FieldGroup>

      {/* ── Scala voto finale ───────────────────────────────────────── */}
      <TargetDistributionSection
        defaultMean={v.target_mean_vote}
        defaultStd={v.target_vote_std}
      />

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

      {/* ── Moltiplicatori di ruolo ─────────────────────────────────── */}
      <FieldGroup title="Moltiplicatori di ruolo">
        <Field
          label="Moltiplicatore — Portiere (GK)"
          name="role_multiplier_gk"
          defaultValue={v.role_multiplier_gk}
          step="0.01"
          min="0.5"
          max="2"
          hint="Default 1.15 — amplifica lo scostamento dal voto 6 per i portieri"
        />
        <Field
          label="Moltiplicatore — Difensore (DEF)"
          name="role_multiplier_def"
          defaultValue={v.role_multiplier_def}
          step="0.01"
          min="0.5"
          max="2"
          hint="Default 1.10"
        />
        <Field
          label="Moltiplicatore — Centrocampista (MID)"
          name="role_multiplier_mid"
          defaultValue={v.role_multiplier_mid}
          step="0.01"
          min="0.5"
          max="2"
          hint="Default 1.00 — neutro"
        />
        <Field
          label="Moltiplicatore — Attaccante (ATT)"
          name="role_multiplier_att"
          defaultValue={v.role_multiplier_att}
          step="0.01"
          min="0.5"
          max="2"
          hint="Default 0.97 — gol/assist già nel B/M, segnale voto leggermente compresso"
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
