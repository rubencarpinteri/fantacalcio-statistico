'use client'

import { useState } from 'react'
import { computeRoundAction } from '../../actions'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { CompetitionRound } from '@/types/database.types'

interface RoundManagerProps {
  round: CompetitionRound
  competitionId: string
  matchday: { id: string; name: string; status: string } | null
  hasGoals: boolean
}

const STATUS_LABEL: Record<string, string> = {
  pending:  'In attesa',
  computed: 'Calcolato',
  locked:   'Bloccato',
}
const STATUS_COLOR: Record<string, string> = {
  pending:  'text-[#8888aa] bg-[#1a1a24]',
  computed: 'text-emerald-400 bg-emerald-500/10',
  locked:   'text-indigo-300 bg-indigo-500/10',
}

export function RoundManager({ round, competitionId, matchday, hasGoals }: RoundManagerProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ error: string | null; fixtures_computed?: number } | null>(null)

  async function handleCompute() {
    setLoading(true)
    setResult(null)
    const res = await computeRoundAction(round.id)
    setResult(res)
    setLoading(false)
  }

  const canCompute = round.status !== 'locked' && ['published', 'archived'].includes(matchday?.status ?? '')

  return (
    <Card>
      <CardHeader title="Stato turno" />
      <CardContent>
        {/* Status row */}
        <div className="mb-5 flex flex-wrap items-center gap-6">
          <div>
            <p className="mb-1 text-xs text-[#55556a]">Stato</p>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[round.status] ?? ''}`}>
              {STATUS_LABEL[round.status] ?? round.status}
            </span>
          </div>

          <div>
            <p className="mb-1 text-xs text-[#55556a]">Giornata collegata</p>
            <span className="text-sm text-white">{matchday?.name ?? '—'}</span>
          </div>

          {matchday && (
            <div>
              <p className="mb-1 text-xs text-[#55556a]">Stato giornata</p>
              <span className="text-sm text-[#8888aa]">{matchday.status}</span>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs text-[#55556a]">Metodo punteggio</p>
            <span className="text-sm text-[#8888aa]">
              {hasGoals ? 'Soglie gol (Mantra)' : 'Confronto diretto'}
            </span>
          </div>
        </div>

        {/* Warnings / blockers */}
        {round.status === 'locked' && (
          <p className="mb-4 text-sm text-[#55556a]">
            Questo turno è bloccato e non può essere ricalcolato.
          </p>
        )}
        {round.status !== 'locked' && !matchday && (
          <p className="mb-4 text-sm text-amber-400">
            ⚠ Collega una giornata a questo turno dalla pagina dei turni prima di calcolare.
          </p>
        )}
        {round.status !== 'locked' && matchday && matchday.status === 'draft' && (
          <p className="mb-4 text-sm text-amber-400">
            ⚠ La giornata &quot;{matchday.name}&quot; è ancora in bozza. Aggiungi statistiche e pubblica un calcolo prima.
          </p>
        )}

        {/* Result feedback */}
        {result?.error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            {result.error}
          </div>
        )}
        {result && !result.error && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400">
            Turno calcolato con successo: <span className="font-medium">{result.fixtures_computed}</span> incontri elaborati.
          </div>
        )}

        {/* Compute button */}
        {canCompute && (
          <button
            onClick={handleCompute}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading && <span className="animate-spin text-sm">⟳</span>}
            {round.status === 'computed' ? 'Ricalcola turno' : 'Calcola turno'}
          </button>
        )}

        {round.computed_at && (
          <p className="mt-4 text-xs text-[#55556a]">
            Ultimo calcolo: {new Date(round.computed_at).toLocaleString('it-IT')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
