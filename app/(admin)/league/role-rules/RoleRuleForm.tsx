'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { upsertRoleRuleAction, type RoleRuleState } from './actions'
import type { RatingClass } from '@/types/database.types'

const RATING_CLASS_OPTIONS = [
  { value: 'DEF', label: 'DEF — Difensore' },
  { value: 'MID', label: 'MID — Centrocampista' },
  { value: 'ATT', label: 'ATT — Attaccante' },
  { value: 'GK',  label: 'GK — Portiere' },
]

function SubmitButton({ isUpdate }: { isUpdate: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" loading={pending}>
      {isUpdate ? 'Aggiorna' : 'Configura'}
    </Button>
  )
}

const initialState: RoleRuleState = { error: null, success: false }

export function RoleRuleForm({
  mantraRole,
  currentClass,
}: {
  mantraRole: string
  currentClass?: RatingClass
}) {
  const [state, formAction] = useActionState(upsertRoleRuleAction, initialState)

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="mantra_role" value={mantraRole} />
      <Select
        name="default_rating_class"
        options={RATING_CLASS_OPTIONS}
        defaultValue={currentClass ?? ''}
        placeholder="Seleziona…"
        className="w-44"
      />
      <SubmitButton isUpdate={!!currentClass} />
      {state.error && (
        <p className="text-xs text-red-400">{state.error}</p>
      )}
    </form>
  )
}
