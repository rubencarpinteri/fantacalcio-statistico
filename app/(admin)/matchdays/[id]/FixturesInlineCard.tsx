'use client'

import { useActionState, useState } from 'react'
import { saveFixturesBulkAction } from './fixtures/actions'
import type { SaveFixturesBulkState } from './fixtures/actions'
import type { MatchdayFixture } from '@/types/database.types'

export function FixturesInlineCard({
  matchdayId,
  fixtures,
}: {
  matchdayId: string
  fixtures: MatchdayFixture[]
}) {
  const [open, setOpen] = useState(fixtures.length === 0)
  const [state, formAction] = useActionState<SaveFixturesBulkState, FormData>(
    saveFixturesBulkAction,
    {}
  )

  const fotmobDefault = fixtures.map((f) => f.fotmob_match_id ?? '').join('\n')
  const sofascoreDefault = fixtures.map((f) => f.sofascore_event_id ?? '').join('\n')

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

      {open && (
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="matchdayId" value={matchdayId} />
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
