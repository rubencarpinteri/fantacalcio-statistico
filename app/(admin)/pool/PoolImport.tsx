'use client'

/**
 * Pool import — placeholder.
 *
 * The legacy import workflow (paste FotMob/SofaScore URLs, scrape player
 * profiles, merge with Leghe xlsx) was removed when FotMob/SofaScore were
 * dropped from the rating pipeline. The serie_a_players pool is now
 * populated by the SportMonks seed command (run server-side around
 * Aug 1 once the Serie A SportMonks subscription is active).
 *
 * This component is kept so the page layout stays stable; the actual
 * import flow will be reintroduced as a button that triggers the
 * SportMonks seed when ready.
 */
export function PoolImport() {
  return (
    <div className="rounded-xl border border-hairline bg-glass-1 px-5 py-6">
      <p className="text-sm font-medium text-ink-1">Import via SportMonks</p>
      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-4">
        Il pool dei giocatori Serie A viene popolato automaticamente da
        SportMonks. L&apos;import manuale via URL FotMob/Leghe è stato rimosso
        nella migrazione a SportMonks come unica fonte di voto.
      </p>
      <p className="mt-2 text-[11.5px] text-ink-5">
        Il comando di seed verrà attivato lato server una volta sottoscritto
        il piano SportMonks Starter per la stagione 26/27.
      </p>
    </div>
  )
}
