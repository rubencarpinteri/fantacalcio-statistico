import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/nav/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Resolve profile and league membership
  const [profileResult, membershipResult] = await Promise.all([
    supabase.from('profiles').select('username, full_name, is_super_admin').eq('id', user.id).single(),
    supabase
      .from('league_users')
      .select('role, league_id, leagues(name)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (membershipResult.error || !membershipResult.data) {
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
  const membership = membershipResult.data
  const isAdmin =
    membership.role === 'league_admin' || (profile?.is_super_admin ?? false)

  const leagueData = membership.leagues as unknown as { name: string } | null

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        isAdmin={isAdmin}
        username={profile?.username ?? user.email ?? 'Utente'}
        leagueName={leagueData?.name ?? 'Fantacalcio'}
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
