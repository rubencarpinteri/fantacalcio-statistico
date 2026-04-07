'use client'

import { useActionState, useState } from 'react'
import { saveFixturesBulkAction, importRatingsAction } from './fixtures/actions'
import type { SaveFixturesBulkState, ImportMatch } from './fixtures/actions'
import type { MatchdayFixture } from '@/types/database.types'
import type { FetchRatingsResponse, MatchedPlayer } from '@/app/api/ratings/fetch/route'

type FetchState =
  | { phase: 'idle' }
  | { phase: 'fetching' }
  | { phase: 'preview'; data: FetchRatingsResponse }
  | { phase: 'importing' }
  | { phase: 'done'; imported: number }
  | { phase: 'error'; message: string }

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
  const [fetchState, setFetchState] = useState<FetchState>({ phase: 'idle' })

  const fotmobDefault = fixtures.map((f) => f.fotmob_match_id ?? '').join('\n')
  const sofascoreDefault = fixtures.map((f) => f.sofascore_event_id ?? '').join('\n')

  async function handleFetch() {
    try {
      setFetchState({ phase: 'fetching' })

      // Browser-fetch SofaScore (server-side is cloud-IP blocked)
      const idsRes = await fetch(`/api/ratings/fixtures?matchdayId=${matchdayId}`)
      const sofascoreEventIds: number[] = idsRes.ok
        ? ((await idsRes.json()) as { sofascore_event_ids: number[] }).sofascore_event_ids ?? []
        : []

      const sofascoreByEventId: Record<string, unknown> = {}
      for (const eventId of sofascoreEventIds) {
        try {
          const ssRes = await fetch(`https://www.sofascore.com/api/v1/fantasy/event/${eventId}`, { credentials: 'include' })
          if (ssRes.ok) sofascoreByEventId[String(eventId)] = await ssRes.json()
        } catch { /* continue without this fixture */ }
      }

      const res = await fetch('/api/ratings/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchdayId,
          sofascoreByEventId: Object.keys(sofascoreByEventId).length > 0 ? sofascoreByEventId : undefined,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as FetchRatingsResponse
      setFetchState({ phase: 'preview', data })
    } catch (e) {
      setFetchState({ phase: 'error', message: String(e) })
    }
  }

  async function handleImport(matched: MatchedPlayer[]) {
    setFetchState({ phase: 'importing' })
    const toImport: ImportMatch[] = matched.map((m) => ({
      league_player_id: m.league_player_id,
      sofascore_rating: m.stat.sofascore_rating,
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
    if (result.error) setFetchState({ phase: 'error', message: result.error })
    else setFetchState({ phase: 'done', imported: result.imported ?? toImport.length })
  }

  return (
    <div className="rounded-xl border border-[#2e2e42] bg-[#111118] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">ID Partite</span>
          {fixtures.length > 0 ? (
            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400">
              {fixtures.length} salvate ✓
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
              nessuna
            </span>
          )}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-[#55556a] hover:text-indigo-400">
          {open ? 'Riduci ↑' : 'Modifica ↓'}
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          <form action={formAction} className="space-y-3">
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
        </div>
      )}

      {/* Fetch section */}
      <div className="border-t border-[#1e1e2e] px-4 py-3 space-y-3">
        {fetchState.phase === 'idle' && (
          <button
            onClick={handleFetch}
            disabled={fixtures.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Scarica voti da FotMob + SofaScore
          </button>
        )}

        {fetchState.phase === 'fetching' && (
          <p className="text-sm text-[#8888aa] animate-pulse">Scaricando voti da FotMob + SofaScore…</p>
        )}

        {fetchState.phase === 'importing' && (
          <p className="text-sm text-[#8888aa] animate-pulse">Importazione in corso…</p>
        )}

        {fetchState.phase === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{fetchState.message}</p>
            <button onClick={() => setFetchState({ phase: 'idle' })} className="text-xs text-[#8888aa] hover:text-indigo-400">
              ← Riprova
            </button>
          </div>
        )}

        {fetchState.phase === 'done' && (
          <div className="space-y-2">
            <p className="text-sm text-green-400">{fetchState.imported} giocatori importati.</p>
            <button onClick={() => setFetchState({ phase: 'idle' })} className="text-xs text-[#8888aa] hover:text-indigo-400">
              Scarica di nuovo
            </button>
          </div>
        )}

        {fetchState.phase === 'preview' && (
          <PreviewSummary
            data={fetchState.data}
            onConfirm={() => handleImport(fetchState.data.matched)}
            onReset={() => setFetchState({ phase: 'idle' })}
          />
        )}
      </div>
    </div>
  )
}

function PreviewSummary({
  data, onConfirm, onReset,
}: {
  data: FetchRatingsResponse
  onConfirm: () => void
  onReset: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { matched, unmatched, errors } = data

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[#f0f0fa]">
          <span className="font-semibold text-white">{matched.length}</span> abbinati
          {unmatched.length > 0 && <span className="ml-2 text-amber-400">· {unmatched.length} non abbinati</span>}
        </span>
        <button onClick={() => setExpanded((v) => !v)} className="text-xs text-[#55556a] hover:text-indigo-400">
          {expanded ? 'Nascondi ↑' : 'Mostra dettagli ↓'}
        </button>
      </div>

      {errors.map((e, i) => (
        <p key={i} className="text-xs text-red-400">{e}</p>
      ))}

      {expanded && (
        <div className="overflow-x-auto rounded-lg border border-[#2e2e42]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2e2e42] text-left text-[#55556a]">
                <th className="px-3 py-2">Giocatore</th>
                <th className="px-3 py-2 text-right">SS</th>
                <th className="px-3 py-2 text-right">FM</th>
                <th className="px-3 py-2 text-right">Min</th>
                <th className="px-3 py-2 text-right">G</th>
                <th className="px-3 py-2 text-right">A</th>
                <th className="px-3 py-2 text-right title" title="Own Goals">OG</th>
                <th className="px-3 py-2 text-right" title="Goals Conceded">GS</th>
                <th className="px-3 py-2 text-right" title="Penalty Scored">Rig+</th>
                <th className="px-3 py-2 text-right" title="Penalty Missed">RS</th>
                <th className="px-3 py-2 text-right" title="Penalty Saved">RP</th>
                <th className="px-3 py-2 text-right" title="Yellow Card">Y</th>
                <th className="px-3 py-2 text-right" title="Red Card">R</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {matched.map((m) => (
                <tr key={m.league_player_id} className="hover:bg-[#1a1a24]">
                  <td className="px-3 py-1.5">
                    <span className="text-[#f0f0fa]">{m.league_player_name}</span>
                    <span className="ml-1 text-[#55556a]">{m.club}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#8888aa]">
                    {m.stat.sofascore_rating != null ? m.stat.sofascore_rating.toFixed(1) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#8888aa]">
                    {m.stat.fotmob_rating != null ? m.stat.fotmob_rating.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-[#8888aa]">{m.stat.minutes_played}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.goals_scored > 0 ? 'text-green-400' : 'text-[#55556a]'}>{m.stat.goals_scored}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.assists > 0 ? 'text-blue-400' : 'text-[#55556a]'}>{m.stat.assists}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.own_goals > 0 ? 'text-red-400' : 'text-[#55556a]'}>{m.stat.own_goals}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.goals_conceded > 0 ? 'text-orange-400' : 'text-[#55556a]'}>{m.stat.goals_conceded}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.penalties_scored > 0 ? 'text-green-300' : 'text-[#55556a]'}>{m.stat.penalties_scored}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.penalties_missed > 0 ? 'text-red-400' : 'text-[#55556a]'}>{m.stat.penalties_missed}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.penalties_saved > 0 ? 'text-emerald-400' : 'text-[#55556a]'}>{m.stat.penalties_saved}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.yellow_cards > 0 ? 'text-yellow-400' : 'text-[#55556a]'}>{m.stat.yellow_cards}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    <span className={m.stat.red_cards > 0 ? 'text-red-500' : 'text-[#55556a]'}>{m.stat.red_cards}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unmatched.length > 0 && (
            <div className="border-t border-[#2e2e42] px-3 py-2 space-y-1">
              <p className="text-xs text-[#55556a] font-medium">Non abbinati:</p>
              {unmatched.map((u, i) => (
                <div key={i} className="text-xs text-amber-400">
                  {u.stat.name} <span className="text-[#55556a]">({u.stat.team_label})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={matched.length === 0}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-40"
        >
          Importa {matched.length} giocatori
        </button>
        <button onClick={onReset} className="text-xs text-[#8888aa] hover:text-indigo-400 self-center">
          Annulla
        </button>
      </div>
    </div>
  )
}
