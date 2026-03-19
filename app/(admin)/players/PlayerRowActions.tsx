'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PlayerForm } from './PlayerForm'
import { togglePlayerActiveAction } from './actions'
import type { LeaguePlayer } from '@/types/database.types'

export function PlayerRowActions({ player }: { player: LeaguePlayer }) {
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleToggleActive() {
    const msg = player.is_active
      ? `Disattivare ${player.full_name}? Il giocatore non apparirà nelle rose ma rimarrà nello storico.`
      : `Riattivare ${player.full_name}?`

    if (!window.confirm(msg)) return

    startTransition(async () => {
      const result = await togglePlayerActiveAction(player.id, !player.is_active)
      if (result.error) alert(result.error)
    })
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setEditOpen(true)}
          className="text-xs text-[#8888aa] transition-colors hover:text-indigo-400"
        >
          Modifica
        </button>
        <button
          onClick={handleToggleActive}
          disabled={isPending}
          className="text-xs text-[#8888aa] transition-colors hover:text-amber-400 disabled:opacity-50"
        >
          {player.is_active ? 'Disattiva' : 'Riattiva'}
        </button>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg">
            <Card>
              <CardHeader
                title={`Modifica: ${player.full_name}`}
                action={
                  <button
                    onClick={() => setEditOpen(false)}
                    className="text-sm text-[#55556a] hover:text-white"
                  >
                    ✕
                  </button>
                }
              />
              <CardContent>
                <PlayerForm
                  player={player}
                  onSuccess={() => setEditOpen(false)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
