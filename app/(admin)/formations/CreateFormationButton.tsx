'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createFormationAction, type FormationActionState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending}>
      Crea formazione
    </Button>
  )
}

const initialState: FormationActionState = { error: null, success: false }

export function CreateFormationButton() {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState(createFormationAction, initialState)

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        + Nuova formazione
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader
            title="Nuova formazione"
            action={
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-[#55556a] hover:text-white"
              >
                ✕
              </button>
            }
          />
          <CardContent>
            <form action={formAction} className="space-y-4">
              <Input
                label="Nome"
                name="name"
                required
                placeholder="es. 4-3-3 Mantra, 3-5-2"
              />
              <Input
                label="Descrizione (opzionale)"
                name="description"
                placeholder="es. Con centrocampo a 3 e ala destra"
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
