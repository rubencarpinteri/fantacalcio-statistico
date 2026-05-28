import Link from 'next/link'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from './SignupForm'
import { AcceptButton } from './AcceptButton'

export const metadata = { title: 'Invito · CONTROFANTA' }

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, season_name')
    .eq('invite_token', token)
    .maybeSingle()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let userProfile: { full_name: string | null; username: string } | null = null
  let alreadyMember = false
  if (user && league) {
    const [profileRes, luRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single(),
      supabase
        .from('league_users')
        .select('id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    userProfile = profileRes.data
      ? { full_name: profileRes.data.full_name ?? null, username: profileRes.data.username }
      : null
    alreadyMember = !!luRes.data
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 text-center">
          <h1
            className="font-light tracking-tight text-ink-1"
            style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', letterSpacing: '-0.03em' }}
          >
            <span className="font-semibold">CONTRO</span>
            <span className="serif font-normal text-ink-3">FANTA</span>
          </h1>
        </div>

        {!league ? (
          <div className="rounded-xl border border-hairline bg-glass-1 p-6 text-center">
            <p className="text-[14px] font-semibold text-ink-1">Link non valido</p>
            <p className="mt-1 text-[12px] text-ink-4">
              Questo link di invito è scaduto o è stato revocato. Chiedi all&apos;admin di
              generarne uno nuovo.
            </p>
            <Link
              href={'/login' as Route}
              className="mt-4 inline-block text-[12px] text-indigo-400 hover:text-indigo-300"
            >
              Vai al login
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-glass-1 p-6 space-y-5">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-4">
                Invito alla lega
              </p>
              <p className="mt-2 text-[18px] font-semibold text-ink-1">{league.name}</p>
              <p className="text-[12px] text-ink-4">{league.season_name}</p>
            </div>

            <p className="rounded-lg border border-hairline bg-glass-2 px-3 py-2 text-center text-[12px] text-ink-3">
              Diventerai manager della Lega. Sceglierai poi tu a quali competizioni
              (Serie A, Mondiali, Europei, Nations League) iscriverti.
            </p>

            {alreadyMember ? (
              <div className="space-y-3 text-center">
                <p className="text-[13px] text-ink-2">
                  Sei già membro di questa lega.
                </p>
                <Link
                  href={'/dashboard' as Route}
                  className="inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-indigo-500 transition-colors"
                >
                  Vai alla dashboard
                </Link>
              </div>
            ) : user ? (
              <div className="space-y-3">
                <p className="text-center text-[12px] text-ink-3">
                  Sei loggato come{' '}
                  <span className="text-ink-1 font-medium">
                    {userProfile?.full_name || userProfile?.username || user.email}
                  </span>
                </p>
                <AcceptButton token={token} />
              </div>
            ) : (
              <SignupForm token={token} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
