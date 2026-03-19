'use client'

import { useTransition } from 'react'
import { deleteRoleRuleAction } from './actions'

export function DeleteRuleButton({
  ruleId,
  mantraRole,
}: {
  ruleId: string
  mantraRole: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    const confirmed = window.confirm(
      `Rimuovere la regola per il ruolo "${mantraRole}"?\n\n` +
        `Giocatori con questo ruolo richiederanno conferma manuale durante le importazioni future.`
    )
    if (!confirmed) return

    startTransition(async () => {
      const result = await deleteRoleRuleAction(ruleId)
      if (result.error) {
        alert(result.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-[#55556a] transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? 'Rimozione…' : 'Rimuovi'}
    </button>
  )
}
