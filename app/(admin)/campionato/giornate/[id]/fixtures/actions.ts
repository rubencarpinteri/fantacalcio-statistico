'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { revalidatePath } from 'next/cache'

const addFixtureSchema = z.object({
  matchdayId: z.string().uuid(),
  fotmob_match_id: z.string().optional(),
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
    label: formData.get('label') ?? '',
  })
  if (!parsed.success) return { error: 'Dati non validi.' }

  const { matchdayId, fotmob_match_id, label } = parsed.data

  if (!fotmob_match_id) {
    return { error: 'Inserisci l\'ID FotMob.' }
  }

  const fm = Number(fotmob_match_id)
  if (isNaN(fm)) {
    return { error: 'L\'ID FotMob deve essere un numero intero.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('matchday_fixtures').insert({
    matchday_id: matchdayId,
    fotmob_match_id: fm,
    label: label,
  })

  if (error) return { error: error.message }

  revalidatePath(`/campionato/giornate/${matchdayId}/fixtures`)
  return { success: true }
}

export async function removeFixtureAction(fixtureId: string, matchdayId: string): Promise<void> {
  await requireLeagueAdmin()
  const supabase = await createClient()
  await supabase.from('matchday_fixtures').delete().eq('id', fixtureId)
  revalidatePath(`/campionato/giornate/${matchdayId}/fixtures`)
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

  const count = fm.ids.length
  if (count === 0) return { error: 'Inserisci almeno un ID.' }

  const supabase = await createClient()

  // Look up matchday_number to resolve team labels from CSV
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('matchday_number')
    .eq('id', matchdayId)
    .single()

  let roundLabels: string[] = []
  if (matchday?.matchday_number) {
    const { getMatchesForRound } = await import('@/lib/calendar/serieaCalendar')
    const matches = getMatchesForRound(matchday.matchday_number)
    roundLabels = matches.map((m) => m.label)
  }

  // Delete all existing fixtures for this matchday
  const { error: deleteError } = await supabase
    .from('matchday_fixtures')
    .delete()
    .eq('matchday_id', matchdayId)

  if (deleteError) return { error: 'Errore durante la cancellazione delle fixture esistenti.' }

  // Build new rows — label from CSV if available, fallback to "Partita N"
  const rows = Array.from({ length: count }, (_, i) => ({
    matchday_id: matchdayId,
    fotmob_match_id: fm.ids[i] ?? null,
    label: roundLabels[i] ?? `Partita ${i + 1}`,
  }))

  const { error: insertError } = await supabase.from('matchday_fixtures').insert(rows)
  if (insertError) return { error: 'Errore durante il salvataggio delle fixture.' }

  revalidatePath(`/campionato/giornate/${matchdayId}/fixtures`)
  revalidatePath(`/campionato/giornate/${matchdayId}`)
  return { success: true, count }
}

// ---------------------------------------------------------------------------
// Auto-import fixtures from CSV (when IDs are present in the calendar file)
// ---------------------------------------------------------------------------

export type AutoImportFixturesState = { error?: string; success?: boolean; count?: number }

export async function autoImportFixturesFromCsvAction(
  matchdayId: string,
): Promise<AutoImportFixturesState> {
  try {
    await requireLeagueAdmin()
  } catch {
    return { error: 'Non autorizzato.' }
  }

  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('matchday_number')
    .eq('id', matchdayId)
    .single()

  if (!matchday?.matchday_number) {
    return { error: 'Numero giornata non impostato sulla giornata.' }
  }

  const { getMatchesForRound } = await import('@/lib/calendar/serieaCalendar')
  const matches = getMatchesForRound(matchday.matchday_number)

  const usableMatches = matches.filter(
    (m) => m.fotmobMatchId !== null,
  )

  if (usableMatches.length === 0) {
    return { error: 'Nessun ID FotMob trovato nel CSV per questa giornata.' }
  }

  const { error: deleteError } = await supabase
    .from('matchday_fixtures')
    .delete()
    .eq('matchday_id', matchdayId)

  if (deleteError) return { error: 'Errore durante la cancellazione delle fixture esistenti.' }

  const rows = usableMatches.map((m) => ({
    matchday_id: matchdayId,
    fotmob_match_id: m.fotmobMatchId,
    label: m.label,
    kickoff_at: m.kickoffAt,
  }))

  const { error: insertError } = await supabase.from('matchday_fixtures').insert(rows)
  if (insertError) return { error: 'Errore durante il salvataggio delle fixture.' }

  revalidatePath(`/campionato/giornate/${matchdayId}/fixtures`)
  revalidatePath(`/campionato/giornate/${matchdayId}`)
  return { success: true, count: rows.length }
}

