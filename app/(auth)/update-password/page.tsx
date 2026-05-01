'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updatePasswordAction, type UpdatePasswordState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-[13.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending ? 'Salvataggio…' : 'Imposta password'}
    </button>
  )
}

const initialState: UpdatePasswordState = { error: null, success: false }

const fieldClass =
  'w-full rounded-xl border border-hairline bg-glass-1 px-3.5 py-2.5 text-[13.5px] text-ink-1 placeholder:text-ink-5 backdrop-blur-xl transition-all focus:border-indigo-400/60 focus:bg-glass-2 focus:outline-none'

const labelClass =
  'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4'

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePasswordAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1
            className="flex flex-wrap items-baseline justify-center gap-x-2 font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', lineHeight: 1.15, letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">Imposta</span>
            <span className="serif font-normal text-ink-3">la tua password</span>
          </h1>
          <p className="mt-1.5 text-[12px] text-ink-4">
            Scegli una password per accedere all&apos;app.
          </p>
        </div>

        <div className="glass-strong p-7">
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="password" className={labelClass}>Nuova password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Almeno 8 caratteri"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="confirm" className={labelClass}>Conferma password</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                placeholder="Ripeti la password"
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
        </div>
      </div>
    </div>
  )
}
