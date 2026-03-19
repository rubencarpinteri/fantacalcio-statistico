import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Reads and writes session cookies per-request.
 *
 * Usage: const supabase = await createClient()
 */
export async function createClient() {
  const cookieStore = await cookies()

  // Cast to SupabaseClient<Database> so TypeScript resolves
  // SchemaName = "public" (string) and Schema = Database["public"] via
  // the class's own defaults — rather than inheriting the broken
  // three-arg form from createServerClient which places the schema
  // object in the SchemaName position.
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // Explicit type required: @supabase/ssr's SetAllCookies callback is
        // not contextually inferred because two createServerClient overloads
        // match (getAll+setAll vs deprecated get+set+remove), preventing TS
        // from narrowing the parameter. The shape matches SetAllCookies at
        // runtime; options is re-cast to the Next.js cookieStore type below.
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // options is structurally CookieOptions; cast needed because the
              // annotated type above uses Record<string, unknown> to avoid
              // importing @supabase/ssr's internal CookieOptions type.
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            })
          } catch {
            // Called from a Server Component — cookies can only be set from
            // middleware or Server Actions. Safe to ignore here; the middleware
            // handles session refresh.
          }
        },
      },
    }
    // @supabase/ssr's createServerClient<D, SN, S>() returns
    // SupabaseClient<D, SN, S> with 3 explicit type args. SupabaseClient has
    // 5 params (Database, SchemaNameOrClientOptions, SchemaName, Schema,
    // ClientOptions), so the schema object lands in the SchemaName position
    // (3rd) instead of Schema (4th), making Schema = Database[SchemaObject] =
    // never. Casting to the 1-arg form lets TS re-resolve defaults:
    // SchemaName = "public" (string), Schema = Database["public"] (correct).
    // This is a version-compatibility shim for @supabase/ssr vs supabase-js.
  ) as unknown as SupabaseClient<Database>
}
