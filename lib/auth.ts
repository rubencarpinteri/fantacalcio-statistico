import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Memoized per request. Multiple callers within a single render pass
// share one Supabase Auth round-trip instead of hitting the server each time.
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
