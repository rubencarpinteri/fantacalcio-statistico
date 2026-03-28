'use client'

import { useActionState, useEffect, useState } from 'react'
import { parseLegheCSVAction, confirmLegheImportAction } from './actions'
import type { ParsedTeamBlock, ParseResult, ConfirmState } from './actions'

interface Props {
  matchdayId: string
  matchdayName: string
  allTeams: { id: string; name: string }[]
}

const ALIASES_KEY = 'leghe_team_aliases'

function loadAliases(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ALIASES_KEY) ?? '{}') } catch { return {} }
}
function saveAliases(aliases: Record<string, string>) {
  try { localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases)) } catch { /* ignore */ }
}

/** Compute initial NV→sub assignments for a team block (GK→GK, field→field in bench order) */
function computeInitialAssignments(side: ParsedTeamBlock): Record<string, string> {
  const usedBench = new Set<string>()
  const out: Record<string, string> = {}
  const benchGk    = side.bench.filter(b => b.role === 'Por')
  const benchField = side.bench.filter(b => b.role !== 'Por')
  for (const starter of side.starters) {
    if (starter.fantavoto !== null) continue  // not NV
    const pool = starter.role === 'Por' ? benchGk : benchField
    const sub = pool.find(b => !usedBench.has(b.name))
    out[starter.name] = sub?.name ?? ''
    if (sub) usedBench.add(sub.name)
  }
  return out
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

  // Persisted team aliases: legheName → teamId
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  // Sub assignments: legheName → { nvStarterName → benchPlayerName | '' }
  const [subAssignments, setSubAssignments] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => { setOverrides(loadAliases()) }, [])

  // Auto-compute initial sub assignments whenever parse result changes
  useEffect(() => {
    if (!parseResult?.ok) return
    const initial: Record<string, Record<string, string>> = {}
    for (const mu of parseResult.matchups) {
      for (const side of [mu.team1, mu.team2]) {
        initial[side.name] = computeInitialAssignments(side)
      }
    }
    setSubAssignments(initial)
  }, [parseResult])

  const handleOverride = (legheName: string, teamId: string) => {
    setOverrides(prev => {
      const next = { ...prev, [legheName]: teamId }
      saveAliases(next)
      return next
    })
  }

  const handleSubChange = (legheName: string, nvName: string, benchName: string) => {
    setSubAssignments(prev => ({
      ...prev,
      [legheName]: { ...(prev[legheName] ?? {}), [nvName]: benchName },
    }))
  }

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

  // ── Step 1: file upload ───────────────────────────────────────────────────
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

  // ── Step 2: preview + sub editor + confirm ────────────────────────────────
  const { matchups } = parseResult

  type TeamLineup = {
    teamId: string; name: string
    starters: { name: string; isNv: boolean; role: string; legheFantavoto: number | null }[]
    bench: { name: string; role: string }[]
    subAssignments: Record<string, string>
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
        teamId,
        name: side.name,
        starters: side.starters.map(p => ({ name: p.name, isNv: p.fantavoto === null, role: p.role, legheFantavoto: p.fantavoto })),
        bench: side.bench.map(p => ({ name: p.name, role: p.role })),
        subAssignments: subAssignments[side.name] ?? {},
        playersPlayed: side.playersPlayed,
        nvCount: side.nvCount,
        legheTotal: side.total,
      })
    }
  }

  const canConfirm = hasUnresolved.length === 0 && teamLineups.length > 0

  // Collect all teams that have NV starters (need sub editor)
  const teamsWithNv = matchups
    .flatMap(mu => [mu.team1, mu.team2])
    .filter(side => side.starters.some(p => p.fantavoto === null))

  return (
    <div className="space-y-6">
      {/* ── Team matching table ── */}
      <div>
        <h2 className="text-base font-semibold text-white">Anteprima importazione</h2>
        <p className="text-sm text-[#8888aa]">{matchups.length} matchup trovati — verifica le associazioni squadra</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#2e2e42]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2e42]">
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#55556a]">Squadra (xlsx)</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-[#55556a]">Associata a</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[#55556a]">Titolari</th>
              <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-[#55556a]">NV</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-[#55556a]">Totale Leghe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {matchups.flatMap(mu =>
              [mu.team1, mu.team2].map(side => {
                const resolved = overrides[side.name] ?? side.teamId ?? null
                const matchedName = allTeams.find(t => t.id === resolved)?.name
                const isSavedAlias = !side.teamId && !!overrides[side.name]
                return (
                  <tr key={side.name} className={resolved ? '' : 'bg-red-500/5'}>
                    <td className="px-4 py-2.5 font-medium text-white">{side.name}</td>
                    <td className="px-4 py-2.5">
                      {resolved ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-emerald-400">{matchedName}</span>
                          {isSavedAlias && (
                            <span className="rounded bg-indigo-500/20 px-1 py-0.5 text-xs text-indigo-400">salvata</span>
                          )}
                        </span>
                      ) : (
                        <select
                          value={overrides[side.name] ?? ''}
                          onChange={e => handleOverride(side.name, e.target.value)}
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

      {/* ── NV substitution editor ── */}
      {teamsWithNv.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Sostituzioni NV</h3>
            <p className="text-xs text-[#55556a]">Per ogni titolare NV, scegli quale panchinaro entra nel conteggio. Svuota il campo per non far entrare nessuno.</p>
          </div>
          {teamsWithNv.map(side => {
            const nvStarters = side.starters.filter(p => p.fantavoto === null)
            const assignments = subAssignments[side.name] ?? {}
            // Which bench players are already assigned to another NV slot
            const assignedElsewhere = (forNvName: string) =>
              new Set(Object.entries(assignments).filter(([k]) => k !== forNvName).map(([, v]) => v).filter(Boolean))

            return (
              <div key={side.name} className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f]">
                <div className="border-b border-[#2e2e42] px-4 py-2">
                  <span className="text-sm font-medium text-white">{side.name}</span>
                  <span className="ml-2 text-xs text-[#55556a]">
                    {overrides[side.name] ? `→ ${allTeams.find(t => t.id === (overrides[side.name] ?? side.teamId))?.name ?? side.teamId}` : `→ ${allTeams.find(t => t.id === side.teamId)?.name ?? '?'}`}
                  </span>
                </div>
                <div className="divide-y divide-[#1a1a24]">
                  {nvStarters.map(starter => {
                    const isGk = starter.role === 'Por'
                    const pool = side.bench.filter(b => isGk ? b.role === 'Por' : b.role !== 'Por')
                    const taken = assignedElsewhere(starter.name)
                    const current = assignments[starter.name] ?? ''

                    return (
                      <div key={starter.name} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-medium text-red-400">NV</span>
                        <span className="min-w-[120px] text-sm text-[#8888aa] line-through">{starter.name}</span>
                        <span className="text-xs text-[#55556a]">{starter.role}</span>
                        <span className="text-xs text-[#55556a]">→</span>
                        <select
                          value={current}
                          onChange={e => handleSubChange(side.name, starter.name, e.target.value)}
                          className="flex-1 rounded border border-[#2e2e42] bg-[#0f0f1a] px-2 py-1 text-xs text-white"
                        >
                          <option value="">— nessuna sostituzione —</option>
                          {pool.map(b => (
                            <option key={b.name} value={b.name} disabled={taken.has(b.name)}>
                              {b.name} ({b.role}){taken.has(b.name) ? ' — già usato' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Errors / warnings ── */}
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

      {/* ── Confirm ── */}
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
