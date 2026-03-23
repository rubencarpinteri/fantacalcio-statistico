'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { updateLeagueSettingsAction, type LeagueSettingsState } from './actions'
import type { League } from '@/types/database.types'

const TIMEZONES = [
  { value: 'Europe/Rome', label: 'Europe/Rome (Italia)' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'UTC', label: 'UTC' },
]

const SCORING_MODES = [
  { value: 'head_to_head', label: 'Testa a testa' },
  { value: 'points_only', label: 'Solo punti' },
  { value: 'both', label: 'Entrambe' },
]

const ROUNDING_MODES = [
  { value: 'one_decimal', label: '1 decimale (es. 7.3)' },
  { value: 'nearest_half', label: 'Mezzo punto (es. 7.5)' },
]

const LOCK_BEHAVIORS = [
  { value: 'auto', label: 'Automatico (alla scadenza)' },
  { value: 'manual', label: 'Manuale (admin conferma)' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      Salva impostazioni
    </Button>
  )
}

const initialState: LeagueSettingsState = { error: null, success: false }

export function LeagueSettingsForm({ league }: { league: League }) {
  const [state, formAction] = useActionState(updateLeagueSettingsAction, initialState)

  const [wSofa, setWSofa] = useState(league.source_weight_sofascore)
  const [wFot,  setWFot]  = useState(league.source_weight_fotmob)
  const weightSum = wSofa + wFot
  const weightOk  = weightSum === 100

  return (
    <form action={formAction} className="space-y-4">
      <Input
        label="Nome lega"
        name="name"
        defaultValue={league.name}
        required
        minLength={2}
        maxLength={80}
      />

      <Input
        label="Nome stagione"
        name="season_name"
        defaultValue={league.season_name}
        required
        placeholder="es. 2025/26"
      />

      <Select
        label="Fuso orario"
        name="timezone"
        options={TIMEZONES}
        defaultValue={league.timezone}
      />

      <Select
        label="Modalità punteggio"
        name="scoring_mode"
        options={SCORING_MODES}
        defaultValue={league.scoring_mode}
      />

      <Select
        label="Arrotondamento voti"
        name="display_rounding"
        options={ROUNDING_MODES}
        defaultValue={league.display_rounding}
      />

      <Select
        label="Blocco formazioni"
        name="lock_behavior"
        options={LOCK_BEHAVIORS}
        defaultValue={league.lock_behavior}
      />

      <div className="flex items-center gap-3">
        <input
          type="hidden"
          name="advanced_bonuses_enabled"
          value="false"
        />
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            name="advanced_bonuses_enabled"
            value="true"
            defaultChecked={league.advanced_bonuses_enabled}
            className="h-4 w-4 rounded border-[#2e2e42] bg-[#1a1a24] accent-indigo-500"
          />
          <span className="text-sm text-[#f0f0fa]">Abilita bonus avanzati</span>
        </label>
      </div>

      <Input
        label="Riserve in panchina"
        name="bench_size"
        type="number"
        min={1}
        max={10}
        defaultValue={league.bench_size}
        hint="Numero di giocatori in panchina per formazione (1–10)"
      />

      {/* Source weights */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">
          Pesi fonti di voto (%)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="SofaScore"
            name="source_weight_sofascore"
            type="number"
            min={0}
            max={100}
            value={wSofa}
            onChange={(e) => setWSofa(Number(e.target.value))}
          />
          <Input
            label="FotMob"
            name="source_weight_fotmob"
            type="number"
            min={0}
            max={100}
            value={wFot}
            onChange={(e) => setWFot(Number(e.target.value))}
          />
        </div>
        <p className={`text-xs ${weightOk ? 'text-emerald-400' : 'text-amber-400'}`}>
          Totale: {weightSum}%
          {weightOk ? ' ✓' : ' — deve sommare a 100%'}
        </p>
      </div>

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && (
        <Alert variant="success">Impostazioni salvate correttamente.</Alert>
      )}

      <SubmitButton />
    </form>
  )
}
