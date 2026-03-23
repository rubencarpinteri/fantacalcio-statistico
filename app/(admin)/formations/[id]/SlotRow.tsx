'use client'

import { useState, useTransition, useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { ALL_MANTRA_ROLES } from '@/domain/roles/defaultRoleMap'
import { updateSlotAction, deleteSlotAction, type SlotActionState } from './actions'
import type { FormationSlot } from '@/types/database.types'

const initialState: SlotActionState = { error: null, success: false }

function UpdateButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" loading={pending}>
      Salva
    </Button>
  )
}

export function SlotRow({
  slot,
  formationId,
  isBenchTable = false,
}: {
  slot: FormationSlot
  formationId: string
  isBenchTable?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [state, formAction] = useActionState(updateSlotAction, initialState)

  function handleDelete() {
    if (
      !window.confirm(
        `Eliminare lo slot "${slot.slot_name}"? Questa azione non può essere annullata.`
      )
    )
      return

    startTransition(async () => {
      const result = await deleteSlotAction(slot.id, formationId)
      if (result.error) alert(result.error)
    })
  }

  if (editing) {
    return (
      <tr className="bg-[#1a1a24]">
        <td colSpan={isBenchTable ? 5 : 4} className="px-6 py-4">
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="slot_id" value={slot.id} />
            <input type="hidden" name="formation_id" value={formationId} />
            <input type="hidden" name="is_bench" value={slot.is_bench ? 'true' : 'false'} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nome slot"
                name="slot_name"
                defaultValue={slot.slot_name}
                required
              />
              <Input
                label="Ordine"
                name="slot_order"
                type="number"
                min={1}
                defaultValue={slot.slot_order}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                Ruoli nativi (nessuna penalità)
              </label>
              <input
                name="allowed_mantra_roles"
                defaultValue={slot.allowed_mantra_roles.join(', ')}
                required
                className="w-full rounded-lg border border-[#2e2e42] bg-[#111118] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
              />
              <p className="text-xs text-[#55556a]">
                Tutti disponibili: {ALL_MANTRA_ROLES.join(', ')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-[#8888aa]">
                Ruoli fuori posizione (−1)
              </label>
              <input
                name="extended_mantra_roles"
                defaultValue={slot.extended_mantra_roles.join(', ')}
                placeholder="Lascia vuoto se non applicabile"
                className="w-full rounded-lg border border-[#2e2e42] bg-[#111118] px-3 py-2 text-sm text-white placeholder-[#55556a] focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {slot.is_bench && (
              <Input
                label="Ordine panchina"
                name="bench_order"
                type="number"
                min={1}
                defaultValue={slot.bench_order ?? 1}
                required
              />
            )}

            {state.error && <Alert variant="error">{state.error}</Alert>}

            <div className="flex gap-2">
              <UpdateButton />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Annulla
              </Button>
            </div>
          </form>
        </td>
      </tr>
    )
  }

  return (
    <tr className="transition-colors hover:bg-[#1a1a24]">
      <td className="px-6 py-3 text-[#8888aa]">{slot.slot_order}</td>
      <td className="px-6 py-3 font-medium text-white">{slot.slot_name}</td>
      {isBenchTable && (
        <td className="px-6 py-3 text-[#8888aa]">{slot.bench_order ?? '—'}</td>
      )}
      <td className="px-6 py-3">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            {slot.allowed_mantra_roles.map((role) => (
              <Badge key={role} variant="accent">
                {role}
              </Badge>
            ))}
          </div>
          {slot.extended_mantra_roles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {slot.extended_mantra_roles.map((role) => (
                <Badge key={role} variant="warning">
                  {role} −1
                </Badge>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-[#8888aa] transition-colors hover:text-indigo-400"
          >
            Modifica
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-[#8888aa] transition-colors hover:text-red-400 disabled:opacity-50"
          >
            Elimina
          </button>
        </div>
      </td>
    </tr>
  )
}
