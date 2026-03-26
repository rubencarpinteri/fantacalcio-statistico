'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { inviteMemberAction, type InviteMemberState } from './actions'

interface UnassignedTeam {
  id: string
  name: string
}

interface Props {
  unassignedTeams: UnassignedTeam[]
}

const ROLE_OPTIONS = [
  { value: 'manager',      label: 'Manager' },
  { value: 'league_admin', label: 'Admin lega' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      Invia invito
    </Button>
  )
}

const initialState: InviteMemberState = { error: null, success: false }

export function InviteMemberForm({ unassignedTeams }: Props) {
  const [state, formAction] = useActionState(inviteMemberAction, initialState)
  const [useExisting, setUseExisting] = useState(unassignedTeams.length > 0)

  const teamOptions = [
    { value: '', label: '— Crea nuova squadra —' },
    ...unassignedTeams.map((t) => ({ value: t.id, label: t.name })),
  ]

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Email"
          name="email"
          type="email"
          required
          placeholder="manager@esempio.it"
          autoComplete="off"
        />
        <Input
          label="Nome completo"
          name="full_name"
          required
          placeholder="Mario Rossi"
        />
        <Input
          label="Username"
          name="username"
          required
          placeholder="mario.rossi"
          hint="Solo lettere minuscole, numeri, . - _"
        />

        {/* Team assignment */}
        {unassignedTeams.length > 0 ? (
          <div className="space-y-2">
            <Select
              label="Squadra"
              name="existing_team_id"
              options={teamOptions}
              onChange={(e) => setUseExisting(e.target.value !== '')}
            />
            {!useExisting && (
              <Input
                name="team_name"
                placeholder="Nome nuova squadra"
              />
            )}
          </div>
        ) : (
          <Input
            label="Nome squadra"
            name="team_name"
            required
            placeholder="Gli Invincibili"
          />
        )}
      </div>

      <Select
        label="Ruolo"
        name="role"
        options={ROLE_OPTIONS}
        defaultValue="manager"
      />

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && (
        <Alert variant="success">
          Invito inviato. Il manager riceverà un&apos;email per impostare la password.
        </Alert>
      )}

      <SubmitButton />
    </form>
  )
}
