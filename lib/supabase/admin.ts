// ============================================================
// Supabase Admin Client
// ============================================================
// Uses the service_role key — server-side ONLY.
// This is a deliberate exception to the @supabase/ssr-only rule:
// @supabase/ssr is for cookie-based user auth; the service role
// client is for Auth Admin API calls (invite users, etc.) that
// have no cookie-based equivalent.
//
// NEVER import this file from client components.
// ============================================================

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Add SUPABASE_SERVICE_ROLE_KEY to your environment variables.'
    )
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
