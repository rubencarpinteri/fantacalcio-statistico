'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { createCompetitionAction } from '../actions'

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

  return (
    <form action={action} className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
        <p className="text-[13px] font-semibold text-indigo-300">
          Soglie gol, smussamento e punti W/D/L sono globali
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3 leading-relaxed">
          Questa competizione userà i parametri impostati in{' '}
          <a href="/regole-di-gioco" className="text-indigo-300 underline hover:text-indigo-200">Regole di gioco</a>,
          condivisi con tutte le altre competizioni della lega.
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-4">
          Nome competizione
        </label>
        <input
          name="name"
          required
          placeholder="es. Campionato 2025-26"
          className="w-full rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
        />
      </div>

      {/* Type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-4">
          Tipo di competizione
        </label>
        <select
          name="type"
          required
          className="w-full rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 focus:border-indigo-400/60 focus:outline-none"
        >
          <option value="campionato">🏟 Campionato</option>
          <option value="battle_royale">⚔ Battle Royale</option>
          <option value="coppa">🏆 Coppa</option>
        </select>
      </div>

      {/* Season */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-4">
          Stagione <span className="text-ink-4">(opzionale)</span>
        </label>
        <input
          name="season"
          placeholder="es. 2025-26"
          className="w-full rounded-lg border border-hairline bg-transparent px-3 py-2 text-sm text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none"
        />
      </div>

      {/* Scoring method */}
      <div>
        <label className="mb-2 block text-sm font-medium text-ink-4">
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
              <span className="text-sm text-ink-1">
                {m === 'goal_thresholds' ? 'Soglie gol (Mantra)' : 'Confronto diretto fantapoint'}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-ink-4">
          {method === 'goal_thresholds'
            ? 'Il totale fantavoto viene convertito in gol secondo le Regole di gioco, poi i gol decidono il risultato.'
            : 'Il fantavoto è confrontato direttamente: chi ha il totale più alto vince.'}
        </p>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <SubmitButton />
        <a href="/competitions" className="text-sm text-ink-4 hover:text-ink-1">
          Annulla
        </a>
      </div>
    </form>
  )
}
