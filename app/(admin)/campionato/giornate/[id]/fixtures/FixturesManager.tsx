'use client'

import { useActionState, useTransition } from 'react'
import { saveFixturesBulkAction, removeFixtureAction } from './actions'
import type { SaveFixturesBulkState } from './actions'
import type { MatchdayFixture } from '@/types/database.types'

// ---------------------------------------------------------------------------
// Fixtures list + paste-based bulk save form
// ---------------------------------------------------------------------------

export function FixturesManager({
  matchdayId,
  fixtures,
}: {
  matchdayId: string
  fixtures: MatchdayFixture[]
}) {
  const [state, formAction] = useActionState<SaveFixturesBulkState, FormData>(
    saveFixturesBulkAction,
    {}
  )
  const [removing, startRemove] = useTransition()

  return (
    <div className="space-y-6">
      {/* Hint */}
      <p className="text-xs text-ink-4">
        Incolla gli ID numerici delle 10 partite di Serie A, uno per riga. L&apos;ordine non
        è importante.
      </p>

      {/* Paste form */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="matchdayId" value={matchdayId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink-3 mb-1">
              ID SportMonks (uno per riga)
            </label>
            <textarea
              name="sportmonksIds"
              rows={11}
              placeholder={"4803335\n4803336\n..."}
              className="w-full rounded-lg border border-hairline bg-glass-1 px-3 py-2 text-sm font-mono text-ink-1 placeholder-ink-4 focus:border-indigo-400/60 focus:outline-none resize-none"
            />
          </div>
        </div>

        {state.error && <p className="text-xs text-red-400">{state.error}</p>}
        {state.success && (
          <p className="text-xs text-green-400">
            {state.count} fixture salvate con successo.
          </p>
        )}

        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Salva fixture
        </button>
      </form>

      {/* Current fixtures table */}
      {fixtures.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-4">
            Fixture salvate ({fixtures.length})
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-4">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">SportMonks ID</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {fixtures.map((fx, idx) => (
                <tr key={fx.id} className="hover:bg-glass-1">
                  <td className="px-4 py-2 text-ink-4">{idx + 1}</td>
                  <td className="px-4 py-2 font-mono text-ink-3">{fx.sportmonks_fixture_id ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      disabled={removing}
                      onClick={() => startRemove(() => removeFixtureAction(fx.id, matchdayId))}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ink-4">Nessuna fixture configurata.</p>
      )}
    </div>
  )
}
