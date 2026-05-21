import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Use ONLY in server-side code that needs to run without a user session
 * (cron endpoints) or that calls the Auth Admin API (`inviteUserByEmail`
 * etc., which has no cookie-based equivalent).
 *
 * NEVER import this file from client components.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.'
    )
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
