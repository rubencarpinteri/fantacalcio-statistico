'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PlayerForm } from './PlayerForm'

export function AddPlayerButton() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        + Aggiungi giocatore
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader
            title="Nuovo giocatore"
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
            <PlayerForm onSuccess={() => setOpen(false)} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
