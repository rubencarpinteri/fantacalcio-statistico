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
      className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Salvataggio…' : 'Imposta password'}
    </button>
  )
}

const initialState: UpdatePasswordState = { error: null, success: false }

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePasswordAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Imposta la tua password</h1>
          <p className="mt-1 text-sm text-[#8888aa]">
            Scegli una password per accedere all&apos;app.
          </p>
        </div>

        <div className="rounded-2xl border border-[#2e2e42] bg-[#111118] p-6 shadow-2xl">
          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]"
              >
                Nuova password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Almeno 8 caratteri"
                className="w-full rounded-lg border border-[#2e2e42] bg-[#1a1a24] px-3 py-2.5 text-sm text-white placeholder-[#55556a] transition-colors focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]"
              >
                Conferma password
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                placeholder="Ripeti la password"
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
        </div>
      </div>
    </div>
  )
}
