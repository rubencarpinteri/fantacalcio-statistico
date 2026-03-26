'use client'

import { useActionState } from 'react'
import { generateMatchdaysAction } from '@/app/(admin)/matchdays/actions'

type State = { error?: string; created?: number }

function initialState(): State { return {} }

export function GenerateMatchdaysForm({
  competitionId,
  linkedCount,
  totalRounds,
}: {
  competitionId: string
  linkedCount: number
  totalRounds: number
}) {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    async (_prev, _fd) => {
      return generateMatchdaysAction(competitionId)
    },
    initialState()
  )

  // All rounds already have matchdays
  if (linkedCount >= totalRounds && totalRounds > 0) {
    return (
      <span className="rounded-lg border border-[#2e2e42] px-3 py-1.5 text-sm text-[#55556a]">
        Giornate gia generate ({linkedCount})
      </span>
    )
  }

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Generazione…' : '⚡ Genera tutte le giornate'}
      </button>
      {state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
      {state.created !== undefined && (
        <p className="text-xs text-green-400">
          {state.created === 0
            ? 'Nessuna nuova giornata creata (tutte gia esistenti).'
            : `${state.created} giornate create con successo.`}
        </p>
      )}
    </form>
  )
}
