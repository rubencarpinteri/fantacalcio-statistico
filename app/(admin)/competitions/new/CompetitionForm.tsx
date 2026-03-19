'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createCompetitionAction } from '../actions'
import { DEFAULT_MANTRA_THRESHOLDS } from '@/domain/competitions/goalThresholds'
import type { GoalThreshold } from '@/domain/competitions/goalThresholds'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
    >
      {pending ? 'Salvataggio...' : 'Crea competizione'}
    </button>
  )
}

export function CompetitionForm() {
  const [state, action] = useActionState(
    (_prev: { error: string | null; success: boolean; competition_id?: string }, formData: FormData) => createCompetitionAction(formData),
    { error: null, success: false }
  )
  const [method, setMethod] = useState<'goal_thresholds' | 'direct_comparison'>('goal_thresholds')
  const [thresholds, setThresholds] = useState<GoalThreshold[]>(DEFAULT_MANTRA_THRESHOLDS)

  const addThreshold = () => {
    setThresholds((prev) => [...prev, { min: 0, goals: 0 }])
  }

  const removeThreshold = (i: number) => {
    setThresholds((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateThreshold = (i: number, field: 'min' | 'goals', value: number) => {
    setThresholds((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {state.error}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#8888aa]">
          Nome competizione
        </label>
        <input
          name="name"
          required
          placeholder="es. Campionato 2025-26"
          className="w-full rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#8888aa]">
          Tipo di competizione
        </label>
        <select
          name="type"
          required
          className="w-full rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="campionato">🏟 Campionato</option>
          <option value="battle_royale">⚔ Battle Royale</option>
          <option value="coppa">🏆 Coppa</option>
        </select>
      </div>

      {/* Season */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[#8888aa]">
          Stagione <span className="text-[#55556a]">(opzionale)</span>
        </label>
        <input
          name="season"
          placeholder="es. 2025-26"
          className="w-full rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Scoring method */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#8888aa]">
          Metodo di punteggio
        </label>
        <div className="flex gap-4">
          {(['goal_thresholds', 'direct_comparison'] as const).map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="scoring_method"
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="accent-indigo-500"
              />
              <span className="text-sm text-white">
                {m === 'goal_thresholds' ? 'Soglie gol (Mantra)' : 'Confronto diretto fantapoint'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Threshold editor */}
      {method === 'goal_thresholds' && (
        <div>
          <label className="mb-2 block text-sm font-medium text-[#8888aa]">
            Soglie fantavoto → gol
          </label>
          <div className="space-y-2">
            {thresholds.map((t, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-16 text-right text-xs text-[#55556a]">da</span>
                <input
                  type="number"
                  value={t.min}
                  onChange={(e) => updateThreshold(i, 'min', Number(e.target.value))}
                  className="w-20 rounded border border-[#2e2e42] bg-[#0a0a0f] px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-[#55556a]">pt →</span>
                <input
                  type="number"
                  value={t.goals}
                  onChange={(e) => updateThreshold(i, 'goals', Number(e.target.value))}
                  className="w-16 rounded border border-[#2e2e42] bg-[#0a0a0f] px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-xs text-[#55556a]">gol</span>
                <button
                  type="button"
                  onClick={() => removeThreshold(i)}
                  className="text-xs text-red-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addThreshold}
            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300"
          >
            + Aggiungi soglia
          </button>
          {/* Serialize thresholds as JSON for server action */}
          <input
            type="hidden"
            name="thresholds_json"
            value={JSON.stringify(thresholds)}
          />
        </div>
      )}

      {/* Points */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#8888aa]">
          Punteggi vittoria / pareggio / sconfitta
        </label>
        <div className="flex items-center gap-4">
          {(['win', 'draw', 'loss'] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-xs text-[#55556a]">
                {k === 'win' ? 'Vittoria' : k === 'draw' ? 'Pareggio' : 'Sconfitta'}
              </span>
              <input
                type="number"
                name={`points_${k}`}
                defaultValue={k === 'win' ? 3 : k === 'draw' ? 1 : 0}
                min={0}
                max={10}
                className="w-14 rounded border border-[#2e2e42] bg-[#0a0a0f] px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton />
        <a href="/competitions" className="text-sm text-[#55556a] hover:text-white">
          Annulla
        </a>
      </div>
    </form>
  )
}
