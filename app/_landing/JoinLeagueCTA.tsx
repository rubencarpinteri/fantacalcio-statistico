'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

function extractToken(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    const parts = url.pathname.split('/').filter(Boolean)
    const joinIdx = parts.indexOf('join')
    const fromUrl = joinIdx >= 0 ? parts[joinIdx + 1] : parts[parts.length - 1]
    if (fromUrl && /^[A-Za-z0-9_-]{6,}$/.test(fromUrl)) return fromUrl
  } catch {
    // not a URL — fall through and treat as raw token
  }
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed)) return trimmed
  return null
}

export function JoinLeagueCTA() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl border border-hairline-strong bg-glass-2 px-5 py-2.5 text-[13.5px] font-semibold text-ink-1 backdrop-blur-xl transition-all hover:bg-glass-3"
      >
        Unisciti a una Lega
      </button>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const token = extractToken(value)
    if (!token) {
      setError('Inserisci un token o un link di invito valido')
      return
    }
    setError(null)
    startTransition(() => {
      router.push(`/join/${token}`)
    })
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} className="flex items-stretch gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          placeholder="Incolla token o link di invito"
          className="flex-1 rounded-xl border border-hairline bg-glass-1 px-3.5 py-2.5 text-[13.5px] text-ink-1 placeholder:text-ink-5 backdrop-blur-xl focus:border-indigo-400/60 focus:bg-glass-2 focus:outline-none"
          aria-label="Token o link di invito"
          aria-invalid={!!error}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2.5 text-[13.5px] font-semibold tracking-tight text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-4px_rgba(99,102,241,0.45),0_1px_2px_rgba(0,0,0,0.4)] transition-all hover:from-indigo-400 hover:to-indigo-500 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
        >
          {pending ? '…' : 'Entra'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-rose-500 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}
