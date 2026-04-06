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
// Bulk paste-based fixture save
// ---------------------------------------------------------------------------

export type SaveFixturesBulkState = { error?: string; success?: boolean; count?: number }

export async function saveFixturesBulkAction(
  _prev: SaveFixturesBulkState,
  formData: FormData,
): Promise<SaveFixturesBulkState> {
  try {
    await requireLeagueAdmin()
  } catch {
    return { error: 'Non autorizzato.' }
  }

  const matchdayId = (formData.get('matchdayId') as string | null) ?? ''
  if (!matchdayId) return { error: 'ID giornata mancante.' }

  const fotmobRaw = (formData.get('fotmobIds') as string | null) ?? ''
  const sofascoreRaw = (formData.get('sofascoreIds') as string | null) ?? ''

  const parseIds = (raw: string): { ids: number[]; error?: string } => {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    const ids: number[] = []
    for (const line of lines) {
      const n = parseInt(line, 10)
      if (isNaN(n) || String(n) !== line) {
        return { ids: [], error: `"${line}" non è un numero intero valido.` }
      }
      ids.push(n)
    }
    return { ids }
  }

  const fm = parseIds(fotmobRaw)
  if (fm.error) return { error: `ID FotMob non valido: ${fm.error}` }

  const ss = parseIds(sofascoreRaw)
  if (ss.error) return { error: `ID SofaScore non valido: ${ss.error}` }

  // Both lists must have the same length, unless one is entirely empty
  if (fm.ids.length > 0 && ss.ids.length > 0 && fm.ids.length !== ss.ids.length) {
    return {
      error: `Il numero di ID FotMob (${fm.ids.length}) e SofaScore (${ss.ids.length}) deve essere uguale.`,
    }
  }

  const count = Math.max(fm.ids.length, ss.ids.length)
  if (count === 0) return { error: 'Inserisci almeno un ID.' }

  const supabase = await createClient()

  // Delete all existing fixtures for this matchday
  const { error: deleteError } = await supabase
    .from('matchday_fixtures')
    .delete()
    .eq('matchday_id', matchdayId)

  if (deleteError) return { error: 'Errore durante la cancellazione delle fixture esistenti.' }

  // Build new rows
  const rows = Array.from({ length: count }, (_, i) => ({
    matchday_id: matchdayId,
    fotmob_match_id: fm.ids[i] ?? null,
    sofascore_event_id: ss.ids[i] ?? null,
    label: `Partita ${i + 1}`,
  }))

  const { error: insertError } = await supabase.from('matchday_fixtures').insert(rows)
  if (insertError) return { error: 'Errore durante il salvataggio delle fixture.' }

  revalidatePath(`/matchdays/${matchdayId}/fixtures`)
  revalidatePath(`/matchdays/${matchdayId}`)
  return { success: true, count }
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

  // Deduplicate by player_id — same player can appear twice if they show up
  // in multiple fixtures (e.g. duplicate match IDs). Last entry wins.
  const byPlayerId = new Map<string, ImportMatch>()
  for (const m of matches) byPlayerId.set(m.league_player_id, m)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [...byPlayerId.values()].map((m) => ({
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

  // Zero out stale rows — players who were imported in a previous fetch but are
  // NOT in the current batch (e.g. Leão with 0 minutes filtered out).
  // We cannot DELETE because player_calculations.stats_id is NOT NULL FK.
  // Setting minutes_played = 0 + ratings = null causes the engine to NV-skip them.
  const batchIds = new Set([...byPlayerId.keys()])
  const { data: existing } = await supabase
    .from('player_match_stats')
    .select('player_id')
    .eq('matchday_id', matchdayId)
  const staleIds = (existing ?? []).map(r => r.player_id).filter(id => !batchIds.has(id))
  if (staleIds.length > 0) {
    await supabase
      .from('player_match_stats')
      .update({
        minutes_played: 0, fotmob_rating: null, sofascore_rating: null,
        goals_scored: 0, assists: 0, own_goals: 0, yellow_cards: 0,
        red_cards: 0, penalties_scored: 0, penalties_missed: 0,
        penalties_saved: 0, goals_conceded: 0, saves: 0,
      })
      .eq('matchday_id', matchdayId)
      .in('player_id', staleIds)
  }

  // Upsert the fresh batch (covers both new players and re-imports of existing ones).
  const { error } = await supabase
    .from('player_match_stats')
    .upsert(rows, { onConflict: 'matchday_id,player_id', ignoreDuplicates: false })
  if (error) return { error: error.message }

  revalidatePath(`/matchdays/${matchdayId}/stats`)
  return { imported: rows.length }
}
