'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { loginAction, type LoginActionState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? 'Accesso in corso…' : 'Accedi'}
    </button>
  )
}

const initialState: LoginActionState = { error: null }

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-2xl">
            ⚽
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Fantacalcio Statistico
          </h1>
          <p className="mt-1 text-sm text-[#8888aa]">Lega privata · Accesso riservato</p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-[#2e2e42] bg-[#111118] p-6 shadow-2xl">
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

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#8888aa]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
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

          <div className="mt-4 text-center">
            <a
              href="/reset-password"
              className="text-xs text-[#8888aa] hover:text-indigo-400 transition-colors"
            >
              Password dimenticata?
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
