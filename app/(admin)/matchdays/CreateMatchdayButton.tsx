'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createMatchdayAction, type MatchdayActionState } from './actions'

const initialState: MatchdayActionState = { error: null, success: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      Crea giornata
    </Button>
  )
}

export function CreateMatchdayButton() {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(createMatchdayAction, initialState)

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Nuova giornata
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader
            title="Nuova giornata"
            action={
              <button onClick={() => setOpen(false)} className="text-sm text-[#55556a] hover:text-white">
                ✕
              </button>
            }
          />
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nome"
                  name="name"
                  required
                  placeholder="es. Giornata 1"
                />
                <Input
                  label="Numero giornata (opzionale)"
                  name="matchday_number"
                  type="number"
                  min={1}
                  placeholder="1"
                />
              </div>
              <Input
                label="Numero giornata campionato (opzionale)"
                name="round_number"
                type="number"
                min={1}
                placeholder="es. 1"
                hint="Collega questa giornata a un turno del Campionato per il calcolo automatico dei risultati H2H"
              />

              <Input
                label="Apertura formazioni"
                name="opens_at"
                type="datetime-local"
                hint="Quando i manager possono iniziare a inserire la formazione"
              />

              <Input
                label="Scadenza formazioni"
                name="locks_at"
                type="datetime-local"
                hint="Dopo questa data le formazioni vengono bloccate"
              />

              {state.error && <Alert variant="error">{state.error}</Alert>}
              <SubmitButton />
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
