'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  acceptTeamTransferAction,
  rejectTeamTransferAction,
  type TransferActionState,
} from './actions'

export interface IncomingOffer {
  request_id: string
  team_id: string
  team_name: string
  from_username: string
  from_full_name: string | null
  message: string | null
  created_at: string
}

const initial: TransferActionState = { error: null, success: false }

function AcceptSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
    >
      {pending ? 'Accetto…' : 'Accetta'}
    </button>
  )
}

function RejectSubmit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-hairline px-3 py-1.5 text-[12px] font-medium text-ink-3 hover:border-rose-400/40 hover:text-rose-500 disabled:opacity-50"
    >
      {pending ? '…' : 'Rifiuta'}
    </button>
  )
}

function OfferRow({ offer }: { offer: IncomingOffer }) {
  const [acceptState, acceptAction] = useActionState(acceptTeamTransferAction, initial)
  const [rejectState, rejectAction] = useActionState(rejectTeamTransferAction, initial)

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            Richiesta in arrivo
          </p>
          <p className="mt-1 text-[14px] font-semibold tracking-tight text-ink-1">
            {offer.team_name}
          </p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            da{' '}
            <span className="text-ink-1 font-medium">
              {offer.from_full_name || `@${offer.from_username}`}
            </span>
            {offer.from_full_name && (
              <span className="text-ink-5"> · @{offer.from_username}</span>
            )}
          </p>
          {offer.message && (
            <p className="mt-2 rounded-md border border-hairline bg-glass-2 px-2.5 py-1.5 text-[12px] italic text-ink-3">
              “{offer.message}”
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form action={acceptAction}>
            <input type="hidden" name="request_id" value={offer.request_id} />
            <AcceptSubmit />
          </form>
          <form action={rejectAction}>
            <input type="hidden" name="request_id" value={offer.request_id} />
            <RejectSubmit />
          </form>
        </div>
      </div>
      {(acceptState.error || rejectState.error) && (
        <p className="mt-2 text-[11px] text-rose-500">
          {acceptState.error ?? rejectState.error}
        </p>
      )}
    </div>
  )
}

export function TransferInbox({ offers }: { offers: IncomingOffer[] }) {
  if (offers.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
        Richieste in attesa di risposta
      </h2>
      <div className="space-y-2">
        {offers.map((o) => (
          <OfferRow key={o.request_id} offer={o} />
        ))}
      </div>
    </section>
  )
}
