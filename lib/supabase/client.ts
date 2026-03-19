import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/**
 * Creates a Supabase client for use in Client Components.
 * Call once per component tree (e.g. in a context or top-level hook).
 * The instance is safe to reuse — @supabase/ssr handles session internally.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
