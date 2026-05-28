'use client'

import { useState, useTransition } from 'react'
import { regenerateInviteTokenAction, revokeInviteTokenAction } from './actions'

interface Props {
  joinUrl: string | null
  leagueName: string
}

export function InviteLinkCard({ joinUrl, leagueName }: Props) {
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  async function copy() {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-glass-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-4">
            Link di invito
          </p>
          <p className="mt-1 text-[12px] text-ink-3">
            Condividi questo link per far iscrivere nuovi membri a{' '}
            <span className="text-ink-1 font-medium">{leagueName}</span>. Chi lo apre crea
            un account (se necessario) ed entra in Lega come manager. Le iscrizioni
            alle singole competizioni (Serie A, Mondiali, Europei, Nations League)
            restano una scelta del manager dalla dashboard.
          </p>
        </div>
      </div>

      {joinUrl ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={joinUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[12px] font-mono text-ink-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={copy}
            className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-[12px] font-medium text-ink-1 hover:bg-glass-3 transition-colors"
          >
            {copied ? 'Copiato!' : 'Copia'}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-ink-5">
          Nessun link attivo. Genera un nuovo link qui sotto.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => regenerateInviteTokenAction())}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {joinUrl ? 'Rigenera link' : 'Genera link'}
        </button>
        {joinUrl && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('Revocare il link? Smetterà di funzionare per i nuovi inviti.')) return
              startTransition(() => revokeInviteTokenAction())
            }}
            className="rounded-lg border border-hairline bg-glass-2 px-3 py-1.5 text-[12px] font-medium text-rose-400 hover:bg-rose-400/10 hover:border-rose-400/40 transition-colors disabled:opacity-50"
          >
            Revoca
          </button>
        )}
      </div>
    </div>
  )
}
