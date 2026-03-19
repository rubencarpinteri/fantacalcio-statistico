'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  generateCalendarioAction,
  createBattleRoyaleRoundAction,
  linkRoundToMatchdayAction,
  computeRoundAction,
} from '../actions'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { CompetitionRound, Matchday } from '@/types/database.types'

function Spinner() {
  return <span className="animate-spin text-sm">⟳</span>
}

function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50 flex items-center gap-2">
      {pending && <Spinner />}
      {pending ? (pendingLabel ?? label) : label}
    </button>
  )
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'text-[#8888aa] bg-[#1a1a24]',
  computed: 'text-emerald-400 bg-emerald-500/10',
  locked:   'text-indigo-300 bg-indigo-500/10',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'In attesa', computed: 'Calcolato', locked: 'Bloccato',
}

interface RoundsManagerProps {
  competitionId: string
  competitionType: string
  competitionStatus: string
  rounds: CompetitionRound[]
  publishedMatchdays: Matchday[]
  teamCount: number
}

export function RoundsManager({
  competitionId,
  competitionType,
  competitionStatus,
  rounds,
  publishedMatchdays,
  teamCount,
}: RoundsManagerProps) {

  // ---- Campionato: generate calendario ----
  const [genState, genAction] = useActionState(
    async (_prev: { error: string | null; message?: string }, fd: FormData) => {
      const legs = Number(fd.get('legs') ?? 2) as 1 | 2
      const result = await generateCalendarioAction(competitionId, legs)
      if (result.success) {
        return { error: null, message: `Calendario generato: ${result.rounds_created} turni, ${result.fixtures_created} incontri.` }
      }
      return { error: result.error, message: undefined }
    },
    { error: null, message: undefined }
  )

  // ---- Battle Royale: add a round ----
  const [brState, brAction] = useActionState(
    async (_prev: { error: string | null; message?: string }, fd: FormData) => {
      const matchdayId = fd.get('matchday_id') as string
      if (!matchdayId) return { error: 'Seleziona una giornata.', message: undefined }
      const result = await createBattleRoyaleRoundAction(competitionId, matchdayId)
      if (result.success) {
        return { error: null, message: `Turno BR calcolato: ${result.fixtures_computed} incontri.` }
      }
      return { error: result.error, message: undefined }
    },
    { error: null, message: undefined }
  )

  // ---- Per-round compute ----
  const [computeState, setComputeState] = useState<Record<string, { error: string | null; loading: boolean }>>({})

  async function handleCompute(roundId: string) {
    setComputeState((prev) => ({ ...prev, [roundId]: { error: null, loading: true } }))
    const result = await computeRoundAction(roundId)
    setComputeState((prev) => ({
      ...prev,
      [roundId]: { error: result.error, loading: false },
    }))
  }

  // ---- Per-round link matchday ----
  const [linkState, setLinkState] = useState<Record<string, string>>({})

  const [linkActionState, linkFormAction] = useActionState(
    async (_prev: { error: string | null; success: boolean }, fd: FormData) => {
      const roundId   = fd.get('round_id') as string
      const matchdayId = fd.get('matchday_id') as string
      return linkRoundToMatchdayAction(roundId, matchdayId)
    },
    { error: null, success: false }
  )

  // Already linked matchday IDs (to exclude from BR dropdown)
  const linkedMatchdayIds = new Set(rounds.map((r) => r.matchday_id).filter(Boolean))

  const availableForBR = publishedMatchdays.filter((m) => !linkedMatchdayIds.has(m.id))

  return (
    <div className="space-y-6">
      {/* ---- Campionato: generate calendario ---- */}
      {competitionType === 'campionato' && (
        <Card>
          <CardHeader title="Genera calendario" />
          <CardContent>
            {genState.message && (
              <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                {genState.message}
              </div>
            )}
            {genState.error && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                {genState.error}
              </div>
            )}
            {rounds.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                ⚠ Rigenerare il calendario eliminerà tutti i turni esistenti (ma non i risultati già calcolati nei snapshot).
              </div>
            )}
            <form action={genAction} className="flex items-end gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#8888aa]">Gironi</label>
                <select name="legs" defaultValue="2"
                  className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
                  <option value="2">Andata e ritorno (default)</option>
                  <option value="1">Solo andata</option>
                </select>
              </div>
              <SubmitBtn label="Genera calendario" pendingLabel="Generazione..." />
            </form>
          </CardContent>
        </Card>
      )}

      {/* ---- Battle Royale: add a round ---- */}
      {competitionType === 'battle_royale' && (
        <Card>
          <CardHeader title="Aggiungi giornata Battle Royale" />
          <CardContent>
            {brState.message && (
              <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
                {brState.message}
              </div>
            )}
            {brState.error && (
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                {brState.error}
              </div>
            )}
            {teamCount < 2 && (
              <p className="mb-3 text-sm text-amber-400">⚠ Iscrivi almeno 2 squadre prima di calcolare.</p>
            )}
            {availableForBR.length === 0 && teamCount >= 2 && (
              <p className="text-sm text-[#55556a]">Nessuna giornata pubblicata disponibile da aggiungere.</p>
            )}
            {availableForBR.length > 0 && (
              <form action={brAction} className="flex items-end gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#8888aa]">Giornata pubblicata</label>
                  <select name="matchday_id"
                    className="rounded-lg border border-[#2e2e42] bg-[#0a0a0f] px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none">
                    <option value="">— Seleziona —</option>
                    {availableForBR.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <SubmitBtn label="Aggiungi e calcola" pendingLabel="Calcolo..." />
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Coppa placeholder ---- */}
      {competitionType === 'coppa' && rounds.length === 0 && (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-sm text-[#55556a]">
              La gestione completa dei turni di Coppa (gironi + eliminazione diretta) è in arrivo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ---- Round list ---- */}
      {rounds.length > 0 && (
        <Card>
          <CardHeader title={`Turni (${rounds.length})`} />
          <CardContent className="p-0">
            {linkActionState.error && (
              <div className="mx-4 my-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                {linkActionState.error}
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  {['#','Nome','Giornata','Stato','Azioni'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-[#55556a]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {rounds.map((r) => {
                  const roundCompute = computeState[r.id]
                  const linkedMatchday = publishedMatchdays.find((m) => m.id === r.matchday_id)
                  return (
                    <tr key={r.id} className="hover:bg-[#0f0f1a]">
                      <td className="px-4 py-3 text-[#55556a] w-10">{r.round_number}</td>
                      <td className="px-4 py-3 text-white">{r.name}</td>
                      <td className="px-4 py-3 text-[#8888aa]">
                        {linkedMatchday ? (
                          <span className="text-white">{linkedMatchday.name}</span>
                        ) : competitionType === 'campionato' ? (
                          <form action={linkFormAction} className="flex items-center gap-2">
                            <input type="hidden" name="round_id" value={r.id} />
                            <select name="matchday_id"
                              className="rounded border border-[#2e2e42] bg-[#0a0a0f] px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none">
                              <option value="">— Collega giornata —</option>
                              {publishedMatchdays.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <button type="submit"
                              className="text-xs text-indigo-400 hover:text-indigo-300">
                              Salva
                            </button>
                          </form>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? ''}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {r.status !== 'locked' && r.matchday_id && (
                            <button
                              onClick={() => handleCompute(r.id)}
                              disabled={roundCompute?.loading}
                              className="rounded px-2.5 py-1 text-xs font-medium bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 flex items-center gap-1"
                            >
                              {roundCompute?.loading && <Spinner />}
                              {r.status === 'computed' ? 'Ricalcola' : 'Calcola'}
                            </button>
                          )}
                          {roundCompute?.error && (
                            <span className="text-xs text-red-400">{roundCompute.error}</span>
                          )}
                          <a
                            href={`/competitions/${competitionId}/rounds/${r.round_number}`}
                            className="text-xs text-[#55556a] hover:text-indigo-400"
                          >
                            Dettaglio →
                          </a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {rounds.length === 0 && competitionType !== 'battle_royale' && competitionType !== 'coppa' && (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-[#55556a]">
              Nessun turno generato. Usa il pulsante qui sopra per generare il calendario.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
