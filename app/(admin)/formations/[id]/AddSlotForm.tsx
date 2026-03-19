'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { ALL_MANTRA_ROLES } from '@/domain/roles/defaultRoleMap'
import { createSlotAction, type SlotActionState } from './actions'

const initialState: SlotActionState = { error: null, success: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" loading={pending}>
      Aggiungi slot
    </Button>
  )
}

export function AddSlotForm({
  formationId,
  currentSlotCount,
}: {
  formationId: string
  currentSlotCount: number
}) {
  const [state, formAction] = useActionState(createSlotAction, initialState)
  const [isBench, setIsBench] = useState(false)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="formation_id" value={formationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nome slot"
          name="slot_name"
          required
          placeholder="es. GK, DC1, W1, B1"
          hint="Identificatore unico dello slot nella formazione"
        />

        <Input
          label="Ordine"
          name="slot_order"
          type="number"
          min={1}
          defaultValue={currentSlotCount + 1}
          required
          hint="Posizione nella formazione (1 = primo)"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">
          Ruoli Mantra accettati
        </label>
        <input
          name="allowed_mantra_roles"
          required
          placeholder="es. Dc, Dd o Por o A, Pc, T"
          className="w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
        />
        <p className="text-xs text-[#55556a]">
          Separati da virgola. Un giocatore soddisfa questo slot se ha <em>almeno uno</em> di
          questi ruoli. Tutti i ruoli disponibili: {ALL_MANTRA_ROLES.join(', ')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <input type="hidden" name="is_bench" value={isBench ? 'true' : 'false'} />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#f0f0fa]">
          <input
            type="checkbox"
            checked={isBench}
            onChange={(e) => setIsBench(e.target.checked)}
            className="h-4 w-4 rounded accent-indigo-500"
          />
          Slot panchina
        </label>
      </div>

      {isBench && (
        <Input
          label="Ordine panchina"
          name="bench_order"
          type="number"
          min={1}
          required
          placeholder="es. 1"
          hint="Priorità di sostituzione (1 = prima riserva)"
        />
      )}

      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.success && <Alert variant="success">Slot aggiunto.</Alert>}

      <SubmitButton />
    </form>
  )
}
