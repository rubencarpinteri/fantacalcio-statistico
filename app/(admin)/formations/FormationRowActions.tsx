'use client'

import { useTransition } from 'react'
import { toggleFormationActiveAction } from './actions'
import type { Formation } from '@/types/database.types'

export function FormationRowActions({ formation }: { formation: Formation }) {
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const msg = formation.is_active
      ? `Disattivare la formazione "${formation.name}"? Non sarà più selezionabile dai manager.`
      : `Riattivare la formazione "${formation.name}"?`

    if (!window.confirm(msg)) return

    startTransition(async () => {
      const result = await toggleFormationActiveAction(formation.id, !formation.is_active)
      if (result.error) alert(result.error)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <a
        href={`/formations/${formation.id}`}
        className="text-xs text-[#8888aa] transition-colors hover:text-indigo-400"
      >
        Configura slot
      </a>
      <button
        onClick={handleToggle}
        disabled={isPending}
        className="text-xs text-[#8888aa] transition-colors hover:text-amber-400 disabled:opacity-50"
      >
        {formation.is_active ? 'Disattiva' : 'Riattiva'}
      </button>
    </div>
  )
}
