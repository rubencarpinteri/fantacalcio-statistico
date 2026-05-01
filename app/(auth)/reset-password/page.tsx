'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { resetPasswordAction, type ResetPasswordState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-[13.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Invio in corso…' : 'Invia link di reset'}
    </button>
  )
}

const initialState: ResetPasswordState = { error: null, success: false }

const fieldClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13.5px] text-[#f5f7ff] placeholder:text-[#6a6f8e] backdrop-blur-xl transition-all focus:border-indigo-400/60 focus:bg-white/[0.07] focus:outline-none'

const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9095b8]'

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1
            className="flex flex-wrap items-baseline justify-center gap-x-2 font-light tracking-tight text-[#f5f7ff]"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">Reset</span>
            <span className="serif font-normal text-[#b8bcdc]">password</span>
          </h1>
          <p className="mt-1.5 text-[12px] text-[#9095b8]">
            Inserisci la tua email per ricevere il link di reset.
          </p>
        </div>

        <div className="glass-strong p-7">
          {state.success ? (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-200 backdrop-blur-xl">
              Email inviata. Controlla la tua casella di posta.
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="tu@esempio.it"
                  className={fieldClass}
                />
              </div>

              {state.error && (
                <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200 backdrop-blur-xl">
                  {state.error}
                </div>
              )}

              <SubmitButton />
            </form>
          )}

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-[11.5px] text-[#9095b8] transition-colors hover:text-indigo-300"
            >
              ← Torna al login
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
