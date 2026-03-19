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
      className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Invio in corso…' : 'Invia link di reset'}
    </button>
  )
}

const initialState: ResetPasswordState = { error: null, success: false }

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Reset password</h1>
          <p className="mt-1 text-sm text-[#8888aa]">
            Inserisci la tua email per ricevere il link di reset.
          </p>
        </div>

        <div className="rounded-2xl border border-[#2e2e42] bg-[#111118] p-6 shadow-2xl">
          {state.success ? (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              Email inviata. Controlla la tua casella di posta.
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="tu@esempio.it"
                  className="w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2.5 text-sm text-white placeholder-[#55556a] transition-colors focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {state.error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {state.error}
                </div>
              )}

              <SubmitButton />
            </form>
          )}

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-xs text-[#8888aa] hover:text-indigo-400 transition-colors"
            >
              ← Torna al login
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
