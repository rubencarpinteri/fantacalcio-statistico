import { createClient } from '@/lib/supabase/server'
import type { League, LeagueRole } from '@/types/database.types'

export interface LeagueContext {
  league: League
  role: LeagueRole
  userId: string
}

/**
 * Resolves the current user's league context.
 * In v1, each user belongs to exactly one league.
 * Returns null if the user has no league membership.
 *
 * Use in server components and server actions to get the scoped league.
 */
export async function getLeagueContext(): Promise<LeagueContext | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('league_users')
    .select('league_id, role, leagues(*)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (error || !data) return null

  // The Supabase select-query-parser cannot resolve the `leagues(*)` join
  // because our manually-written types carry `Relationships: never[]` (no FK
  // metadata). The actual runtime shape is correct; we widen to an explicit
  // structural type and then narrow each field to the domain type.
  const d = data as { league_id: string; role: LeagueRole; leagues: unknown }
  return {
    // leagues(*) join: shape is correct at runtime but typed as `unknown`
    // because our types carry Relationships: never[] (no FK metadata).
    league: d.leagues as unknown as League,
    role: d.role,
    userId: user.id,
  }
}

/**
 * Resolves the current user's league context or throws a redirect.
 * Use in layouts/pages that require league membership.
 */
export async function requireLeagueContext(): Promise<LeagueContext> {
  const ctx = await getLeagueContext()
  if (!ctx) {
    const { redirect } = await import('next/navigation')
    redirect('/login')
  }
  return ctx as LeagueContext
}

/**
 * Resolves the current user's league context and asserts league_admin role.
 * Throws a redirect if the user is not a league_admin.
 */
export async function requireLeagueAdmin(): Promise<LeagueContext> {
  const ctx = await requireLeagueContext()
  if (ctx.role !== 'league_admin') {
    // Check super_admin status
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', ctx.userId)
      .single()

    if (!profile?.is_super_admin) {
      const { redirect } = await import('next/navigation')
      redirect('/dashboard')
    }
  }
  return ctx
}
