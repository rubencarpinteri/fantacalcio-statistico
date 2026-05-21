export default function AdminLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento…</span>

      <div className="h-7 w-48 animate-pulse rounded-md bg-glass-2" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-xl border border-hairline bg-glass-1" />
        <div className="h-32 animate-pulse rounded-xl border border-hairline bg-glass-1" />
      </div>

      <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
        <div className="divide-y divide-hairline">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-glass-2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
