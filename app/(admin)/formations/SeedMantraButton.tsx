'use client'

import { useState, useTransition } from 'react'
import { seedMantraFormationsAction } from './actions'

export function SeedMantraButton() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ error?: string; created?: number; skipped?: number } | null>(null)

  function handleSeed() {
    startTransition(async () => {
      const res = await seedMantraFormationsAction()
      setResult(res)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSeed}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Caricamento…
          </>
        ) : (
          <>
            ⚽ Carica preset Mantra
          </>
        )}
      </button>

      {result && !result.error && (
        <p className="text-sm text-emerald-400">
          ✓ {result.created} formazioni create
          {(result.skipped ?? 0) > 0 && `, ${result.skipped} già presenti (saltate)`}
        </p>
      )}

      {result?.error && (
        <p className="text-sm text-red-400">Errore: {result.error}</p>
      )}
    </div>
  )
}
