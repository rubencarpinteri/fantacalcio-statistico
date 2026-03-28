'use client'

import { useActionState, useState } from 'react'
import { parseLegheCSVAction, confirmLegheImportAction } from './actions'
import type { ParsedMatchup, ParseResult, ConfirmState } from './actions'

interface Props {
  matchdayId: string
  matchdayName: string
  allTeams: { id: string; name: string }[]
}

export function ImportLegheClient({ matchdayId, matchdayName, allTeams }: Props) {
  const [parseResult, parseDispatch, parsePending] = useActionState<ParseResult | null, FormData>(
    parseLegheCSVAction,
    null
  )
  const [confirmResult, confirmDispatch, confirmPending] = useActionState<ConfirmState, FormData>(
    confirmLegheImportAction,
    { ok: false }
  )

  // Team ID overrides for unmatched teams
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  if (confirmResult.ok && confirmResult.message) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-400">✓ {confirmResult.message}</p>
        <a href={`/matchdays/${matchdayId}`} className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
          ← Torna alla giornata
        </a>
      </div>
    )
  }

  // Step 1 — file upload
  if (!parseResult || !parseResult.ok) {
    return (
      <div className="space-y-4">
        {parseResult && !parseResult.ok && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {parseResult.error}
          </div>
        )}

        <form action={parseDispatch} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#8888aa]">
              File Leghe Fantacalcio — <span className="text-white">{matchdayName}</span>
            </label>
            <p className="mb-3 text-xs text-[#55556a]">Carica il file .xlsx scaricato da Leghe Fantacalcio (accetta anche .csv).</p>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv"
              required
              className="block w-full text-sm text-[#8888aa] file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-300 hover:file:bg-indigo-500/30"
            />
          </div>
          <button
            type="submit"
            disabled={parsePending}
            className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {parsePending ? 'Analisi in corso…' : 'Analizza file'}
          </button>
        </form>
      </div>
    )
  }

  // Step 2 — preview + confirm
  const { matchups } = parseResult

  // Build team lineups (starters + bench names) — totals are computed server-side from FotMob
  type TeamLineup = {
    teamId: string; name: string
    starters: { name: string; isNv: boolean; role: string }[]
    bench: { name: string; role: string }[]
    playersPlayed: number; nvCount: number
    legheTotal: number | null
  }
  const teamLineups: TeamLineup[] = []
  const hasUnresolved: string[] = []

  for (const mu of matchups) {
    for (const side of [mu.team1, mu.team2]) {
      const teamId = overrides[side.name] ?? side.teamId ?? null
      if (!teamId) { hasUnresolved.push(side.name); continue }
      teamLineups.push({
        teamId, name: side.name,
        starters: side.starters.map(p => ({ name: p.name, isNv: p.fantavoto === null, role: p.role })),
        bench: side.bench.map(p => ({ name: p.name, role: p.role })),
        playersPlayed: side.playersPlayed,
        nvCount: side.nvCount,
        legheTotal: side.total,
      })
    }
  }

  const canConfirm = hasUnresolved.length === 0 && teamLineups.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Anteprima importazione</h2>
        <p className="text-sm text-[#8888aa]">{matchups.length} matchup trovati — verifica le associazioni squadra</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#2e2e42]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2e42]">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#55556a]">Squadra (CSV)</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#55556a]">Associata a</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[#55556a]">Titolari</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[#55556a]">NV</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-[#55556a]">Totale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {matchups.flatMap(mu =>
              [mu.team1, mu.team2].map(side => {
                const resolved = overrides[side.name] ?? side.teamId ?? null
                const matchedName = allTeams.find(t => t.id === resolved)?.name
                return (
                  <tr key={side.name} className={resolved ? '' : 'bg-red-500/5'}>
                    <td className="px-4 py-2.5 font-medium text-white">{side.name}</td>
                    <td className="px-4 py-2.5">
                      {resolved ? (
                        <span className="text-emerald-400">{matchedName}</span>
                      ) : (
                        <select
                          value={overrides[side.name] ?? ''}
                          onChange={e => setOverrides(prev => ({ ...prev, [side.name]: e.target.value }))}
                          className="rounded border border-red-500/40 bg-[#0f0f1a] px-2 py-1 text-xs text-white"
                        >
                          <option value="">— seleziona squadra —</option>
                          {allTeams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-[#8888aa]">{side.playersPlayed}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={side.nvCount > 0 ? 'text-amber-400' : 'text-[#55556a]'}>{side.nvCount}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#55556a]">
                      {side.total !== null ? side.total.toFixed(2) : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmResult.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {confirmResult.error}
        </div>
      )}

      {!canConfirm && hasUnresolved.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          ⚠ Alcune squadre non sono state associate automaticamente. Selezionale manualmente sopra.
        </div>
      )}

      <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 text-sm text-indigo-300">
        ℹ I punteggi saranno calcolati usando i voti FotMob (run statistico), non i totali di Leghe.
      </div>

      <form action={confirmDispatch} className="flex items-center gap-3">
        <input type="hidden" name="matchday_id" value={matchdayId} />
        <input type="hidden" name="team_lineups" value={JSON.stringify(teamLineups)} />
        <button
          type="submit"
          disabled={!canConfirm || confirmPending}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          {confirmPending ? 'Pubblicazione…' : `Pubblica giornata (${teamLineups.length} squadre)`}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-sm text-[#55556a] hover:text-white"
        >
          Ricomincia
        </button>
      </form>
    </div>
  )
}
