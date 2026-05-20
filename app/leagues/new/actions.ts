'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'

const createLeagueSchema = z.object({
  name:        z.string().min(2, 'Il nome lega deve avere almeno 2 caratteri').max(80),
  season_name: z.string().min(1, 'La stagione è obbligatoria').max(40),
})

export interface CreateLeagueState {
  error: string | null
}

export async function createLeagueAction(
  _prev: CreateLeagueState,
  formData: FormData
): Promise<CreateLeagueState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const parsed = createLeagueSchema.safeParse({
    name:        formData.get('name'),
    season_name: formData.get('season_name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi' }
  }

  const { data: league, error: lError } = await supabase
    .from('leagues')
    .insert({ name: parsed.data.name, season_name: parsed.data.season_name })
    .select('id')
    .single()

  if (lError || !league) {
    return { error: `Errore creazione lega: ${lError?.message ?? 'sconosciuto'}` }
  }

  const { error: luError } = await supabase
    .from('league_users')
    .insert({ league_id: league.id, user_id: user.id, role: 'league_admin' })

  if (luError) {
    // Best-effort cleanup so we don't leak an orphan league
    await supabase.from('leagues').delete().eq('id', league.id)
    return { error: `Errore assegnazione admin: ${luError.message}` }
  }

  redirect('/league/members' as Route)
}
