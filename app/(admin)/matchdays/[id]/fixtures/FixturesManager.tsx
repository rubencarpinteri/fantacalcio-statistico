'use client'

import { useActionState, useTransition } from 'react'
import { saveFixturesBulkAction, removeFixtureAction, importRatingsAction } from './actions'
import type { SaveFixturesBulkState, ImportMatch } from './actions'
import type { MatchdayFixture } from '@/types/database.types'
import type { FetchRatingsResponse } from '@/app/api/ratings/fetch/route'

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
              ID FotMob (uno per riga)
            </label>
            <textarea
              name="fotmobIds"
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
                <th className="px-4 py-2">FotMob ID</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {fixtures.map((fx, idx) => (
                <tr key={fx.id} className="hover:bg-glass-1">
                  <td className="px-4 py-2 text-ink-4">{idx + 1}</td>
                  <td className="px-4 py-2 font-mono text-ink-3">{fx.fotmob_match_id ?? '—'}</td>
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

// ---------------------------------------------------------------------------
// Fetch & Preview
// ---------------------------------------------------------------------------

type FetchState =
  | { phase: 'idle' }
  | { phase: 'fetching' }
  | { phase: 'preview'; data: FetchRatingsResponse }
  | { phase: 'importing' }
  | { phase: 'done'; imported: number }
  | { phase: 'error'; message: string }

import { useState } from 'react'

export function FetchPreview({
  matchdayId,
  hasFixtures,
}: {
  matchdayId: string
  hasFixtures: boolean
}) {
  const [state, setState] = useState<FetchState>({ phase: 'idle' })
  // overrides: league_player_id → player_id to use instead
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map())

  async function handleFetch() {
    setState({ phase: 'fetching' })
    try {
      const res = await fetch('/api/ratings/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchdayId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as FetchRatingsResponse
      setState({ phase: 'preview', data })
    } catch (e) {
      setState({ phase: 'error', message: String(e) })
    }
  }

  async function handleImport(data: FetchRatingsResponse) {
    setState({ phase: 'importing' })
    const toImport: ImportMatch[] = data.matched.map((m) => ({
      league_player_id: m.league_player_id,
      fotmob_rating: m.stat.fotmob_rating,
      minutes_played: m.stat.minutes_played,
      goals_scored: m.stat.goals_scored,
      assists: m.stat.assists,
      own_goals: m.stat.own_goals,
      yellow_cards: m.stat.yellow_cards,
      red_cards: m.stat.red_cards,
      penalties_scored: m.stat.penalties_scored,
      penalties_missed: m.stat.penalties_missed,
      penalties_saved: m.stat.penalties_saved,
      goals_conceded: m.stat.goals_conceded,
      saves: m.stat.saves,
      clean_sheet: m.stat.clean_sheet,
    }))

    const result = await importRatingsAction(matchdayId, toImport)
    if (result.error) setState({ phase: 'error', message: result.error })
    else setState({ phase: 'done', imported: result.imported ?? toImport.length })
  }

  if (!hasFixtures) {
    return (
      <p className="text-sm text-ink-4">
        Aggiungi almeno una fixture sopra per abilitare il fetch automatico.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {state.phase === 'idle' && (
        <button
          onClick={handleFetch}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Scarica voti da FotMob
        </button>
      )}

      {state.phase === 'fetching' && (
        <p className="text-sm text-ink-3 animate-pulse">Caricamento FotMob in corso…</p>
      )}

      {state.phase === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{state.message}</p>
          <button
            onClick={() => setState({ phase: 'idle' })}
            className="text-xs text-ink-3 hover:text-indigo-400"
          >
            ← Riprova
          </button>
        </div>
      )}

      {state.phase === 'done' && (
        <p className="text-sm text-green-400">
          {state.imported} giocatori importati con successo.
        </p>
      )}

      {state.phase === 'preview' && (
        <PreviewTable
          data={state.data}
          overrides={overrides}
          setOverrides={setOverrides}
          onConfirm={() => handleImport(state.data)}
          onReset={() => setState({ phase: 'idle' })}
        />
      )}

      {state.phase === 'importing' && (
        <p className="text-sm text-ink-3 animate-pulse">Importazione in corso…</p>
      )}
    </div>
  )
}

function PreviewTable({
  data,
  onConfirm,
  onReset,
}: {
  data: FetchRatingsResponse
  overrides: Map<string, string>
  setOverrides: React.Dispatch<React.SetStateAction<Map<string, string>>>
  onConfirm: () => void
  onReset: () => void
}) {
  const { matched, unmatched, errors } = data

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-1">
            <span className="font-semibold text-ink-1">{matched.length}</span> giocatori abbinati
            {unmatched.length > 0 && (
              <span className="ml-2 text-red-400">· {unmatched.length} non abbinati</span>
            )}
          </p>
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-400">{e}</p>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="text-xs text-ink-3 hover:text-indigo-400"
          >
            ← Annulla
          </button>
          <button
            onClick={onConfirm}
            disabled={matched.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Importa {matched.length} giocatori
          </button>
        </div>
      </div>

      {/* Matched table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-4">
              <th className="px-3 py-2">Giocatore DB</th>
              <th className="px-3 py-2">Nome API</th>
              <th className="px-3 py-2 text-right">FM</th>
              <th className="px-3 py-2 text-right">Min</th>
              <th className="px-3 py-2 text-right">G</th>
              <th className="px-3 py-2 text-right">A</th>
              <th className="px-3 py-2 text-right">GC</th>
              <th className="px-3 py-2 text-right">OG</th>
              <th className="px-3 py-2 text-right">Y</th>
              <th className="px-3 py-2 text-right">R</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {matched.map((m) => (
              <MatchedRow key={m.league_player_id} m={m} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Unmatched */}
      {unmatched.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-4">
            Non abbinati ({unmatched.length})
          </p>
          <div className="rounded-lg border border-hairline bg-glass-1 px-4 py-3 space-y-1">
            {unmatched.map((u, i) => (
              <div key={i} className="flex gap-4 text-xs">
                <span className="text-red-400">{u.stat.name}</span>
                <span className="text-ink-4">{u.stat.team_label}</span>
                {u.closest_name && (
                  <span className="text-ink-4">→ più simile: {u.closest_name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchedRow({ m }: { m: FetchRatingsResponse['matched'][number] }) {
  const s = m.stat
  return (
    <tr className="hover:bg-glass-1">
      <td className="px-3 py-1.5">
        <span className="text-ink-1">{m.league_player_name}</span>
        <span className="ml-1 text-ink-4">{m.club}</span>
      </td>
      <td className="px-3 py-1.5 text-ink-3">{s.name}</td>
      <td className="px-3 py-1.5 text-right font-mono text-ink-3">
        {s.fotmob_rating != null ? s.fotmob_rating.toFixed(2) : '—'}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-ink-3">{s.minutes_played}</td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.goals_scored > 0 ? 'text-green-400' : 'text-ink-4'}>{s.goals_scored}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.assists > 0 ? 'text-blue-400' : 'text-ink-4'}>{s.assists}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.goals_conceded > 0 ? 'text-red-400' : 'text-ink-4'}>{s.goals_conceded}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.own_goals > 0 ? 'text-red-400' : 'text-ink-4'}>{s.own_goals}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.yellow_cards > 0 ? 'text-yellow-400' : 'text-ink-4'}>{s.yellow_cards}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        <span className={s.red_cards > 0 ? 'text-red-400' : 'text-ink-4'}>{s.red_cards}</span>
      </td>
    </tr>
  )
}
