'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  assignTeamToMemberAction,
  unassignTeamAction,
  type AssignTeamState,
} from './actions'

interface Team {
  id: string
  name: string
}

interface Props {
  memberUserId: string
  isSelf: boolean
  teams: Team[]
  availablePlaceholders: Team[]
}

const initial: AssignTeamState = { error: null, success: false }

function AssignSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-300"
    >
      {pending ? '…' : 'Assegna'}
    </button>
  )
}

function UnassignSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title="Riprendi in pool placeholder"
      aria-label="Riprendi in pool placeholder"
      className="rounded-md border border-hairline px-1.5 py-0.5 text-[10px] text-ink-4 hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50 transition-colors"
    >
      ↶
    </button>
  )
}

export function TeamAssignmentCell({
  memberUserId,
  isSelf,
  teams,
  availablePlaceholders,
}: Props) {
  const [assignState, assignAction] = useActionState(assignTeamToMemberAction, initial)
  const [unassignState, unassignAction] = useActionState(unassignTeamAction, initial)

  return (
    <div className="space-y-1.5">
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {teams.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-md border border-hairline bg-glass-1 px-1.5 py-0.5 text-[11px] text-ink-2"
            >
              <span className="truncate max-w-[140px]">{t.name}</span>
              {!isSelf && (
                <form action={unassignAction}>
                  <input type="hidden" name="team_id" value={t.id} />
                  <UnassignSubmit />
                </form>
              )}
            </span>
          ))}
        </div>
      )}

      {teams.length === 0 && (
        <p className="text-[11px] text-ink-5">Nessuna squadra</p>
      )}

      {!isSelf && availablePlaceholders.length > 0 && (
        <form action={assignAction} className="flex items-center gap-1.5">
          <input type="hidden" name="target_user_id" value={memberUserId} />
          <select
            name="team_id"
            required
            defaultValue=""
            className="rounded-md border border-hairline bg-transparent px-1.5 py-0.5 text-[11px] text-ink-2 focus:border-indigo-400/60 focus:outline-none"
          >
            <option value="" disabled>
              Scegli squadra…
            </option>
            {availablePlaceholders.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <AssignSubmit />
        </form>
      )}

      {(assignState.error || unassignState.error) && (
        <p className="text-[10.5px] text-rose-500">
          {assignState.error ?? unassignState.error}
        </p>
      )}
    </div>
  )
}
