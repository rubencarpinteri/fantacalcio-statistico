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
      .limit(1)
      .single(),
  ])

  if (membershipResult.error || !membershipResult.data) {
    // User exists in auth but has no league membership yet
    // Show a holding page rather than a hard redirect
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-[#8888aa]">
        <div className="text-center">
          <p className="text-lg font-semibold text-white">Accesso in attesa</p>
          <p className="mt-2 text-sm">
            Il tuo account non è ancora stato associato a una lega. Contatta l&apos;admin.
          </p>
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
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <AdminSidebar
        isAdmin={isAdmin}
        username={profile?.username ?? user.email ?? 'Utente'}
        leagueName={leagueData?.name ?? 'Fantacalcio'}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
      </main>
    </div>
  )
}
