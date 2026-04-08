'use client'

import { useActionState, useState, useTransition } from 'react'
import { saveFixturesBulkAction, autoImportFixturesFromCsvAction } from './fixtures/actions'
import type { SaveFixturesBulkState, AutoImportFixturesState } from './fixtures/actions'
import type { MatchdayFixture } from '@/types/database.types'
import type { CalendarMatch } from '@/lib/calendar/serieaCalendar'

export function FixturesInlineCard({
  matchdayId,
  fixtures,
  roundMatches = [],
}: {
  matchdayId: string
  fixtures: MatchdayFixture[]
  roundMatches?: CalendarMatch[]
}) {
  const [open, setOpen] = useState(fixtures.length === 0)
  const [state, formAction] = useActionState<SaveFixturesBulkState, FormData>(
    saveFixturesBulkAction,
    {}
  )
  const [autoState, setAutoState] = useState<AutoImportFixturesState>({})
  const [importing, startImport] = useTransition()

  const fotmobDefault = fixtures.map((f) => f.fotmob_match_id ?? '').join('\n')
  const sofascoreDefault = fixtures.map((f) => f.sofascore_event_id ?? '').join('\n')

  const csvHasIds = roundMatches.some(
    (m) => m.sofascoreMatchId !== null || m.fotmobMatchId !== null,
  )

  function handleAutoImport() {
    setAutoState({})
    startImport(async () => {
      const result = await autoImportFixturesFromCsvAction(matchdayId)
      setAutoState(result)
    })
  }

  return (
    <div>
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {fixtures.length > 0 ? (
            <span className="text-xs text-green-400">{fixtures.length} partite configurate</span>
          ) : (
            <span className="text-xs text-amber-400">Nessuna partita configurata</span>
          )}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-[#55556a] hover:text-indigo-400">
          {open ? 'Riduci ↑' : 'Modifica ↓'}
        </button>
      </div>

      {/* Auto-import from CSV — shown when CSV has IDs for this round */}
      {csvHasIds && fixtures.length === 0 && (
        <div className="mt-2">
          <button
            onClick={handleAutoImport}
            disabled={importing}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {importing ? 'Caricamento…' : 'Auto-carica dal CSV'}
          </button>
          {autoState.error && <p className="mt-1 text-xs text-red-400">{autoState.error}</p>}
          {autoState.success && (
            <p className="mt-1 text-xs text-green-400">{autoState.count} fixture caricate dal CSV.</p>
          )}
        </div>
      )}

      {/* Re-import button when fixtures already exist but CSV has IDs */}
      {csvHasIds && fixtures.length > 0 && (
        <div className="mt-2">
          <button
            onClick={handleAutoImport}
            disabled={importing}
            className="text-xs text-[#55556a] hover:text-emerald-400 disabled:opacity-50"
          >
            {importing ? 'Caricamento…' : 'Ricaricare dal CSV ↺'}
          </button>
          {autoState.error && <p className="mt-1 text-xs text-red-400">{autoState.error}</p>}
        </div>
      )}

      {open && (
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="matchdayId" value={matchdayId} />
          {roundMatches.length > 0 && !csvHasIds && (
            <div className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2">
              <p className="mb-1.5 text-xs font-medium text-[#55556a] uppercase tracking-wider">
                Ordine partite dalla giornata (incolla gli ID in quest&apos;ordine)
              </p>
              <ol className="space-y-0.5">
                {roundMatches.map((m, i) => (
                  <li key={m.matchNumber} className="text-xs text-[#8888aa]">
                    <span className="mr-2 text-[#55556a]">{i + 1}.</span>
                    {m.label}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#8888aa] mb-1">FotMob IDs</label>
              <textarea
                name="fotmobIds"
                rows={10}
                defaultValue={fotmobDefault}
                placeholder={'4803335\n4803336\n...'}
                className="w-full rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-3 py-2 text-sm font-mono text-[#f0f0fa] placeholder-[#55556a] focus:border-indigo-500 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#8888aa] mb-1">SofaScore IDs</label>
              <textarea
                name="sofascoreIds"
                rows={10}
                defaultValue={sofascoreDefault}
                placeholder={'13981724\n13981725\n...'}
                className="w-full rounded-lg border border-[#2e2e42] bg-[#0f0f1a] px-3 py-2 text-sm font-mono text-[#f0f0fa] placeholder-[#55556a] focus:border-indigo-500 focus:outline-none resize-none"
              />
            </div>
          </div>
          {state.error && <p className="text-xs text-red-400">{state.error}</p>}
          {state.success && <p className="text-xs text-green-400">{state.count} fixture salvate.</p>}
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            Salva ID
          </button>
        </form>
      )}
    </div>
  )
}
