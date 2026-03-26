'use client'

export default function AuditError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-red-500/30 bg-red-900/20 p-4">
        <h2 className="text-sm font-semibold text-red-400">Errore nel caricamento dell&apos;Audit Log</h2>
        <p className="mt-1 font-mono text-xs text-red-300 break-all">{error.message}</p>
        {error.digest && (
          <p className="mt-1 text-xs text-red-400/60">Digest: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-[#2e2e42] px-4 py-2 text-sm text-[#8888aa] hover:text-white"
      >
        Riprova
      </button>
    </div>
  )
}
