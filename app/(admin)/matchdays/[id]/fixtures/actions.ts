'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { revalidatePath } from 'next/cache'

const addFixtureSchema = z.object({
  matchdayId: z.string().uuid(),
  fotmob_match_id: z.string().optional(),
  sofascore_event_id: z.string().optional(),
  label: z.string().max(80),
})

export type AddFixtureState = { error?: string; success?: boolean }

export async function addFixtureAction(
  _prev: AddFixtureState,
  formData: FormData,
): Promise<AddFixtureState> {
  try {
    await requireLeagueAdmin()
  } catch {
    return { error: 'Non autorizzato.' }
  }

  const parsed = addFixtureSchema.safeParse({
    matchdayId: formData.get('matchdayId'),
    fotmob_match_id: formData.get('fotmob_match_id') || undefined,
    sofascore_event_id: formData.get('sofascore_event_id') || undefined,
    label: formData.get('label') ?? '',
  })
  if (!parsed.success) return { error: 'Dati non validi.' }

  const { matchdayId, fotmob_match_id, sofascore_event_id, label } = parsed.data

  if (!fotmob_match_id && !sofascore_event_id) {
    return { error: 'Inserisci almeno un ID (FotMob o SofaScore).' }
  }

  const fm = fotmob_match_id ? Number(fotmob_match_id) : null
  const ss = sofascore_event_id ? Number(sofascore_event_id) : null
  if ((fm !== null && isNaN(fm)) || (ss !== null && isNaN(ss))) {
    return { error: 'Gli ID devono essere numeri interi.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('matchday_fixtures').insert({
    matchday_id: matchdayId,
    fotmob_match_id: fm,
    sofascore_event_id: ss,
    label: label,
  })

  if (error) return { error: error.message }

  revalidatePath(`/matchdays/${matchdayId}/fixtures`)
  return { success: true }
}

export async function removeFixtureAction(fixtureId: string, matchdayId: string): Promise<void> {
  await requireLeagueAdmin()
  const supabase = await createClient()
  await supabase.from('matchday_fixtures').delete().eq('id', fixtureId)
  revalidatePath(`/matchdays/${matchdayId}/fixtures`)
}

// ---------------------------------------------------------------------------
// Import confirmed ratings from the fetch preview
// ---------------------------------------------------------------------------

export type ImportMatch = {
  league_player_id: string
  sofascore_rating: number | null
  fotmob_rating: number | null
  minutes_played: number
  goals_scored: number
  assists: number
  own_goals: number
  yellow_cards: number
  red_cards: number
  penalties_scored: number
  penalties_missed: number
  penalties_saved: number
  goals_conceded: number
  saves: number
}

export type ImportRatingsState = { error?: string; imported?: number }

export async function importRatingsAction(
  matchdayId: string,
  matches: ImportMatch[],
): Promise<ImportRatingsState> {
  try {
    await requireLeagueAdmin()
  } catch {
    return { error: 'Non autorizzato.' }
  }

  if (!matches.length) return { error: 'Nessun dato da importare.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorizzato.' }

  // Upsert each player's stats (on conflict matchday+player, update ratings & events)
  // Build insert rows — only the fields we have; DB defaults handle the rest.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = matches.map((m) => ({
    matchday_id: matchdayId,
    player_id: m.league_player_id,
    entered_by: user.id,
    sofascore_rating: m.sofascore_rating,
    fotmob_rating: m.fotmob_rating,
    minutes_played: m.minutes_played,
    goals_scored: m.goals_scored,
    assists: m.assists,
    own_goals: m.own_goals,
    yellow_cards: m.yellow_cards,
    red_cards: m.red_cards,
    penalties_scored: m.penalties_scored,
    penalties_missed: m.penalties_missed,
    penalties_saved: m.penalties_saved,
    goals_conceded: m.goals_conceded,
    saves: m.saves,
  }))

  const { error } = await supabase
    .from('player_match_stats')
    .upsert(rows, {
      onConflict: 'matchday_id,player_id',
      ignoreDuplicates: false,
    })

  if (error) return { error: error.message }

  revalidatePath(`/matchdays/${matchdayId}/stats`)
  return { imported: rows.length }
}
