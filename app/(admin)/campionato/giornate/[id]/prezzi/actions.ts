'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

// ---- CSV parsing -----------------------------------------------------------

interface ParsedRow {
  line: number
  full_name: string
  club: string
  price: number
  raw: string
}

interface MatchedRow extends ParsedRow {
  player_id: string
}

interface UnmatchedRow extends ParsedRow {
  reason: 'no-match' | 'ambiguous'
}

export interface PriceUploadResult {
  error: string | null
  parsed_count: number
  matched: number
  unmatched: number
  inserted: number
  updated: number
  matched_rows?: MatchedRow[]
  unmatched_rows?: UnmatchedRow[]
}

const fail = (error: string): PriceUploadResult => ({
  error,
  parsed_count: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0,
})

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function parseCSV(text: string): { rows: ParsedRow[]; error: string | null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], error: 'CSV vuoto.' }

  // Detect header: if first line looks like "full_name,club,price" (any order) we skip it.
  const headerCandidate = lines[0]!.toLowerCase()
  const hasHeader =
    headerCandidate.includes('name') ||
    headerCandidate.includes('nome') ||
    headerCandidate.includes('giocatore') ||
    headerCandidate.includes('price') ||
    headerCandidate.includes('prezzo')

  const startIdx = hasHeader ? 1 : 0
  const rows: ParsedRow[] = []

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i]!
    const cells = raw.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cells.length < 3) {
      return { rows: [], error: `Riga ${i + 1}: servono 3 colonne (nome, squadra, prezzo). Trovate: ${cells.length}.` }
    }
    const [name, club, priceRaw] = cells as [string, string, string]
    if (!name || !club || !priceRaw) {
      return { rows: [], error: `Riga ${i + 1}: una colonna è vuota.` }
    }
    const price = Number(priceRaw.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) {
      return { rows: [], error: `Riga ${i + 1}: prezzo non valido "${priceRaw}".` }
    }
    rows.push({ line: i + 1, full_name: name, club, price: Math.round(price), raw })
  }
  return { rows, error: null }
}

// ---- Dry-run preview -------------------------------------------------------

export async function previewPricesUploadAction(
  matchdayId: string,
  csvText: string
): Promise<PriceUploadResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  if (!z.string().uuid().safeParse(matchdayId).success) return fail('ID giornata non valido.')

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, league_id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()
  if (!matchday) return fail('Giornata non trovata.')

  const { rows, error } = parseCSV(csvText)
  if (error) return fail(error)
  if (rows.length === 0) return fail('Nessuna riga utile nel CSV.')

  // Load the league's active player pool.
  const { data: pool } = await supabase
    .from('league_players')
    .select('id, full_name, club')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)

  // Build a (normalized name + normalized club) → [ids] map for matching.
  const keyMap = new Map<string, string[]>()
  for (const p of pool ?? []) {
    const key = `${normalize(p.full_name)}|${normalize(p.club)}`
    const arr = keyMap.get(key) ?? []
    arr.push(p.id)
    keyMap.set(key, arr)
  }

  const matched: MatchedRow[] = []
  const unmatched: UnmatchedRow[] = []
  for (const r of rows) {
    const key = `${normalize(r.full_name)}|${normalize(r.club)}`
    const ids = keyMap.get(key)
    if (!ids || ids.length === 0) {
      unmatched.push({ ...r, reason: 'no-match' })
    } else if (ids.length > 1) {
      unmatched.push({ ...r, reason: 'ambiguous' })
    } else {
      matched.push({ ...r, player_id: ids[0]! })
    }
  }

  return {
    error: null,
    parsed_count: rows.length,
    matched: matched.length,
    unmatched: unmatched.length,
    inserted: 0,
    updated: 0,
    matched_rows: matched,
    unmatched_rows: unmatched,
  }
}

// ---- Confirm upload --------------------------------------------------------

export async function applyPricesUploadAction(
  matchdayId: string,
  csvText: string
): Promise<PriceUploadResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  if (!z.string().uuid().safeParse(matchdayId).success) return fail('ID giornata non valido.')

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, league_id, status, name')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()
  if (!matchday) return fail('Giornata non trovata.')

  // Reject upload if matchday is open or beyond — prices must be set BEFORE
  // the lineup window opens so users can't pick under different prices.
  if (matchday.status !== 'draft') {
    return fail('I prezzi possono essere caricati solo quando la giornata è in stato "draft".')
  }

  const preview = await previewPricesUploadAction(matchdayId, csvText)
  if (preview.error) return preview

  const matchedRows = preview.matched_rows ?? []
  if (matchedRows.length === 0) {
    return fail('Nessun giocatore abbinato. Controlla nomi e squadre nel CSV.')
  }

  // Diff against existing rows to count insert vs update.
  const playerIds = matchedRows.map((r) => r.player_id)
  const { data: existing } = await supabase
    .from('matchday_player_prices')
    .select('player_id, price')
    .eq('matchday_id', matchdayId)
    .in('player_id', playerIds)
  const existingMap = new Map((existing ?? []).map((e) => [e.player_id, e.price]))

  let inserted = 0
  let updated  = 0
  for (const r of matchedRows) {
    if (!existingMap.has(r.player_id)) inserted++
    else if (existingMap.get(r.player_id) !== r.price) updated++
  }

  // Upsert all matched rows in one shot.
  const upsertRows = matchedRows.map((r) => ({
    matchday_id: matchdayId,
    player_id:   r.player_id,
    price:       r.price,
  }))

  const { error: upsertErr } = await supabase
    .from('matchday_player_prices')
    .upsert(upsertRows, { onConflict: 'matchday_id,player_id' })

  if (upsertErr) return fail(`Errore upsert: ${upsertErr.message}`)

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'league_settings_change',
    entityType: 'matchday',
    entityId: matchdayId,
    afterJson: {
      action: 'prices_upload',
      matchday_id: matchdayId,
      matchday_name: matchday.name,
      matched: matchedRows.length,
      inserted, updated,
      unmatched_count: preview.unmatched,
    },
  })

  revalidatePath(`/campionato/giornate/${matchdayId}/prezzi`)
  revalidatePath(`/campionato/giornate/${matchdayId}`)

  return {
    ...preview,
    inserted, updated,
  }
}
