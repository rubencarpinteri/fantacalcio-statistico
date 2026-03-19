'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { ALL_MANTRA_ROLES } from '@/domain/roles/defaultRoleMap'
import { createPlayerAction, updatePlayerAction, type PlayerActionState } from './actions'
import type { LeaguePlayer } from '@/types/database.types'

const RATING_CLASS_OPTIONS = [
  { value: 'GK', label: 'GK — Portiere' },
  { value: 'DEF', label: 'DEF — Difensore' },
  { value: 'MID', label: 'MID — Centrocampista' },
  { value: 'ATT', label: 'ATT — Attaccante' },
]

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      {isEdit ? 'Aggiorna giocatore' : 'Crea giocatore'}
    </Button>
  )
}

const initialState: PlayerActionState = { error: null, success: false }

interface PlayerFormProps {
  player?: LeaguePlayer
  onSuccess?: () => void
}

export function PlayerForm({ player, onSuccess }: PlayerFormProps) {
  const action = player ? updatePlayerAction : createPlayerAction
  const [state, formAction] = useActionState(action, initialState)

  if (state.success && onSuccess) {
    onSuccess()
  }

  const defaultRoles = player?.mantra_roles.join(', ') ?? ''

  return (
    <form action={formAction} className="space-y-4">
      {player && <input type="hidden" name="player_id" value={player.id} />}

      <Input
        label="Nome completo"
        name="full_name"
        defaultValue={player?.full_name ?? ''}
        required
        placeholder="es. Lautaro Martinez"
        error={state.fieldErrors?.['full_name']}
      />

      <Input
        label="Club"
        name="club"
        defaultValue={player?.club ?? ''}
        required
        placeholder="es. Inter"
        error={state.fieldErrors?.['club']}
      />

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">
          Ruoli Mantra
        </label>
        <input
          name="mantra_roles"
          defaultValue={defaultRoles}
          required
          placeholder="es. A, Pc"
          className="w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
        />
        <p className="text-xs text-[#55556a]">
          Ruoli separati da virgola. Disponibili: {ALL_MANTRA_ROLES.join(', ')}
        </p>
        {state.fieldErrors?.['mantra_roles'] && (
          <p className="text-xs text-red-400">{state.fieldErrors['mantra_roles']}</p>
        )}
      </div>

      <Select
        label="Ruolo Mantra primario (opzionale)"
        name="primary_mantra_role"
        options={ALL_MANTRA_ROLES.map((r) => ({ value: r, label: r }))}
        defaultValue={player?.primary_mantra_role ?? ''}
        placeholder="Nessuno (usa il primo)"
      />

      <Select
        label="Classe statistica (rating class)"
        name="rating_class"
        options={RATING_CLASS_OPTIONS}
        defaultValue={player?.rating_class ?? ''}
        placeholder="Seleziona…"
        error={state.fieldErrors?.['rating_class']}
      />

      <Input
        label="Note (opzionale)"
        name="notes"
        defaultValue={player?.notes ?? ''}
        placeholder="es. Acquistato per riparazione, giornata 5"
      />

      {player && (
        <Input
          label="Motivo modifica (opzionale)"
          name="change_reason"
          placeholder="es. Cambio modulo in squadra reale"
          hint="Registrato nello storico ruoli se cambi ruolo o rating class."
        />
      )}

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && (
        <Alert variant="success">
          {player ? 'Giocatore aggiornato.' : 'Giocatore creato con successo.'}
        </Alert>
      )}

      <SubmitButton isEdit={!!player} />
    </form>
  )
}
