import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import { getLeagueContext } from '@/lib/league'
import { AdminSidebar } from '@/components/nav/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) {
    redirect('/login')
  }

  const supabase = await createClient()

  // Profile + league context in parallel. getLeagueContext is memoized via
  // React cache(), so child pages reading it again pay zero extra round-trips.
  const [profileResult, ctx] = await Promise.all([
    supabase.from('profiles').select('username, full_name, is_super_admin').eq('id', user.id).single(),
    getLeagueContext(),
  ])

  if (!ctx) {
    // User exists in auth but has no league membership yet
    // Show a holding page rather than a hard redirect
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-4">
        <div className="glass max-w-sm px-8 py-7 text-center">
          <p className="text-[15px] font-semibold tracking-tight text-ink-1">Nessuna lega</p>
          <p className="mt-2 text-[13px] leading-[1.55] text-ink-3">
            Il tuo account non è ancora associato a una lega. Crea la tua, oppure
            chiedi a un admin di invitarti.
          </p>
          <a
            href="/leagues/new"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Crea una nuova lega
          </a>
        </div>
      </div>
    )
  }

  const profile = profileResult.data
  const isAdmin =
    ctx.role === 'league_admin' || (profile?.is_super_admin ?? false)

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        isAdmin={isAdmin}
        username={profile?.username ?? user.email ?? 'Utente'}
        leagueName={ctx.league.name ?? 'Fantacalcio'}
      />
      <main className="flex-1 overflow-y-auto">
        {/* pb-24 on mobile reserves space above the fixed bottom nav bar */}
        <div className="mx-auto max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-8">
          {children}
        </div>
      </main>
    </div>
  )
}
