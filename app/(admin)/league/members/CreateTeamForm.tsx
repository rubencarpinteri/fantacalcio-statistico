'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { createTeamAction, type CreateTeamState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending} variant="secondary">
      Crea squadra
    </Button>
  )
}

const initialState: CreateTeamState = { error: null, success: false }

export function CreateTeamForm() {
  const [state, formAction] = useActionState(createTeamAction, initialState)

  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="flex-1">
        <Input
          label="Nome squadra"
          name="team_name"
          required
          placeholder="Gli Invincibili"
        />
      </div>
      <div className="pb-0.5">
        <SubmitButton />
      </div>
      {state.error && <Alert variant="error">{state.error}</Alert>}
    </form>
  )
}
