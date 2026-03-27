'use client'

export default function MatchDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-4">
        <p className="text-sm font-semibold text-red-400">Errore nel caricamento della partita</p>
        <p className="mt-1 font-mono text-xs text-red-300 break-all">{error.message}</p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-[#55556a]">digest: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
      >
        Riprova
      </button>
    </div>
  )
}
