'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { transitionMatchdayStatusAction } from '../actions'
import type { Matchday, MatchdayStatus } from '@/types/database.types'

interface StatusAction {
  label: string
  newStatus: MatchdayStatus
  variant: 'primary' | 'secondary' | 'danger'
  requireNote: boolean
  confirmMessage: string
}

const STATUS_ACTIONS: Partial<Record<MatchdayStatus, StatusAction[]>> = {
  draft: [
    {
      label: 'Apri per formazioni',
      newStatus: 'open',
      variant: 'primary',
      requireNote: false,
      confirmMessage: 'Aprire la giornata? I manager potranno inserire le formazioni.',
    },
  ],
  open: [
    {
      label: 'Blocca formazioni',
      newStatus: 'locked',
      variant: 'secondary',
      requireNote: false,
      confirmMessage: 'Bloccare le formazioni? I manager non potranno più modificarle.',
    },
  ],
  locked: [
    {
      label: 'Inizia calcolo voti',
      newStatus: 'scoring',
      variant: 'primary',
      requireNote: false,
      confirmMessage: 'Passare alla fase di calcolo? Potrai inserire i voti.',
    },
    {
      label: 'Riapri formazioni',
      newStatus: 'open',
      variant: 'danger',
      requireNote: true,
      confirmMessage:
        '⚠ RIAPRI: I manager potranno modificare le formazioni. Questa azione verrà registrata nel log di audit. Continua?',
    },
  ],
  scoring: [
    {
      label: 'Torna a blocco',
      newStatus: 'locked',
      variant: 'secondary',
      requireNote: true,
      confirmMessage: 'Tornare allo stato bloccato? Il calcolo corrente verrà sospeso.',
    },
  ],
  published: [
    {
      label: 'Archivia',
      newStatus: 'archived',
      variant: 'ghost' as never,
      requireNote: false,
      confirmMessage: 'Archiviare la giornata?',
    },
  ],
}

export function MatchdayStatusControls({ matchday }: { matchday: Matchday }) {
  const [isPending, startTransition] = useTransition()
  const [noteModal, setNoteModal] = useState<StatusAction | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const actions = STATUS_ACTIONS[matchday.status] ?? []

  function handleAction(action: StatusAction) {
    if (!window.confirm(action.confirmMessage)) return

    if (action.requireNote) {
      setNoteModal(action)
      return
    }

    execute(action, null)
  }

  function execute(action: StatusAction, actionNote: string | null) {
    startTransition(async () => {
      const result = await transitionMatchdayStatusAction(
        matchday.id,
        action.newStatus,
        actionNote
      )
      if (result.error) setError(result.error)
      else {
        setNoteModal(null)
        setNote('')
        setError(null)
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader title="Controlli stato" description={`Stato corrente: ${matchday.status}`} />
        <CardContent className="space-y-3">
          {actions.length === 0 ? (
            <p className="text-sm text-[#55556a]">Nessuna transizione disponibile.</p>
          ) : (
            actions.map((action) => (
              <Button
                key={action.newStatus}
                variant={action.variant as 'primary' | 'secondary' | 'danger'}
                loading={isPending}
                onClick={() => handleAction(action)}
                className="w-full"
              >
                {action.label}
              </Button>
            ))
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {matchday.status === 'scoring' && (
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2.5 text-xs text-indigo-300">
              <span className="font-semibold">Per pubblicare i risultati</span> devi eseguire il calcolo
              punteggi e pubblicarlo dalla pagina dedicata.{' '}
              <a
                href={`/matchdays/${matchday.id}/calculate`}
                className="font-semibold underline hover:text-indigo-200"
              >
                Vai al calcolo →
              </a>
            </div>
          )}

          <a
            href={`/matchdays/${matchday.id}/lineup`}
            className="block text-center text-sm text-indigo-400 hover:underline"
          >
            Gestisci formazioni →
          </a>
        </CardContent>
      </Card>

      {/* Note modal for actions requiring explanation */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2e2e42] bg-[#111118] p-6 shadow-2xl">
            <h3 className="mb-2 text-sm font-semibold text-white">{noteModal.label}</h3>
            <p className="mb-4 text-xs text-[#8888aa]">
              Inserisci un motivo per questa azione (obbligatorio per il log di audit).
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Motivo obbligatorio…"
              className="mb-4 w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <Button
                variant="danger"
                loading={isPending}
                disabled={!note.trim()}
                onClick={() => execute(noteModal, note.trim())}
              >
                Conferma
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setNoteModal(null)
                  setNote('')
                }}
              >
                Annulla
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
