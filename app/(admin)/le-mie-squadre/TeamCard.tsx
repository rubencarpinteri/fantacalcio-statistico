'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  renameSerieATeamAction,
  renameFMTeamAction,
  type RenameTeamState,
} from './actions'

export type Level = 'nazionale' | 'internazionale'

interface Props {
  teamId: string
  name: string
  level: Level
  competitionLabel: string
  competitionSubLabel?: string | null
}

const initial: RenameTeamState = { error: null, success: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-indigo-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
    >
      {pending ? '…' : 'Salva'}
    </button>
  )
}

export function TeamCard({ teamId, name, level, competitionLabel, competitionSubLabel }: Props) {
  const action = level === 'nazionale' ? renameSerieATeamAction : renameFMTeamAction
  const [state, formAction] = useActionState(action, initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const isNazionale = level === 'nazionale'

  // Strong, intentional color coding. Two distinct hues so it's instantly
  // readable which competition tier a team belongs to, with a left accent bar
  // and a colored eyebrow tag.
  const accentBar = isNazionale ? 'bg-emerald-500' : 'bg-indigo-500'
  const eyebrowText = isNazionale
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-indigo-700 dark:text-indigo-300'
  const eyebrowBg = isNazionale
    ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30'
    : 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
  const icon = isNazionale ? '🇮🇹' : '🌍'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-hairline bg-glass-1 backdrop-blur-xl">
      <div className={`absolute inset-y-0 left-0 w-1 ${accentBar}`} aria-hidden />
      <div className="pl-5 pr-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${eyebrowBg} ${eyebrowText}`}
              >
                <span aria-hidden>{icon}</span>
                {isNazionale ? 'Livello nazionale' : 'Livello internazionale'}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] font-medium text-ink-3">
              {competitionLabel}
              {competitionSubLabel ? <span className="text-ink-5"> · {competitionSubLabel}</span> : null}
            </p>
          </div>
        </div>

        <div className="mt-3">
          {editing ? (
            <form
              action={(fd) => {
                fd.set('team_id', teamId)
                fd.set('name', draft)
                formAction(fd)
                setEditing(false)
              }}
              className="flex items-center gap-2"
            >
              <input
                name="name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                required
                minLength={2}
                maxLength={60}
                className="flex-1 rounded-md border border-hairline bg-transparent px-2 py-1 text-[14px] font-semibold tracking-tight text-ink-1 focus:border-indigo-400/60 focus:outline-none"
              />
              <SubmitButton />
              <button
                type="button"
                onClick={() => { setDraft(name); setEditing(false) }}
                className="rounded-md border border-hairline px-2 py-1 text-[12px] text-ink-4 hover:text-ink-1"
              >
                Annulla
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p
                className="truncate text-[18px] font-semibold tracking-tight text-ink-1"
                style={{ letterSpacing: '-0.025em' }}
              >
                {name}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink-4 hover:border-indigo-400/40 hover:text-indigo-600 transition-colors dark:hover:text-indigo-300"
              >
                Rinomina
              </button>
            </div>
          )}
        </div>

        {state.error && (
          <p className="mt-2 text-[11px] text-rose-500">{state.error}</p>
        )}
      </div>
    </div>
  )
}
