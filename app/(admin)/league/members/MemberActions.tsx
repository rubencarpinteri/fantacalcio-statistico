'use client'

import { useActionState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { Select } from '@/components/ui/select'
import { changeRoleAction, removeMemberAction, type MemberActionState } from './actions'

const ROLE_OPTIONS = [
  { value: 'manager',      label: 'Manager' },
  { value: 'league_admin', label: 'Admin' },
]

// ─── Role change ──────────────────────────────────────────────────────────────

function RoleSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded px-2 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
    >
      {pending ? '…' : 'Salva'}
    </button>
  )
}

const initialState: MemberActionState = { error: null, success: false }

export function ChangeRoleForm({
  memberId,
  currentRole,
}: {
  memberId: string
  currentRole: 'manager' | 'league_admin'
}) {
  const [state, formAction] = useActionState(changeRoleAction, initialState)

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <Select
        name="role"
        options={ROLE_OPTIONS}
        defaultValue={currentRole}
        className="py-1 text-xs"
      />
      <RoleSubmitButton />
      {state.error && (
        <span className="text-xs text-red-400">{state.error}</span>
      )}
    </form>
  )
}

// ─── Remove member ────────────────────────────────────────────────────────────

export function RemoveMemberButton({ memberId, name }: { memberId: string; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Rimuovere "${name}" dalla lega? La squadra verrà eliminata.`)) return
    startTransition(async () => {
      await removeMemberAction(memberId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      {isPending ? '…' : 'Rimuovi'}
    </button>
  )
}
