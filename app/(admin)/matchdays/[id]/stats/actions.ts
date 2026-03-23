'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { parse as parseCsv } from 'csv-parse/sync'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { RatingClass } from '@/types/database.types'
import { statRowSchema } from './schema'
import type { StatRowInput, StatRow } from './schema'

// Re-export types so existing importers (StatsGrid) keep working
export type { StatRowInput, StatRow }
// Re-export schema so any direct importers keep working
export { statRowSchema }

// ============================================================
// upsertStatsAction
// Bulk upserts a batch of stat rows for a single matchday.
// Each row uses UNIQUE(matchday_id, player_id) for conflict resolution.
// ============================================================

const upsertSchema = z.object({
  matchday_id: z.string().uuid(),
  rows: z.array(statRowSchema).min(1),
})

export interface UpsertStatsResult {
  error: string | null
  success: boolean
  upserted_count: number
}

export async function upsertStatsAction(
  payload: z.input<typeof upsertSchema>
): Promise<UpsertStatsResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = upsertSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      error: 'Dati non validi: ' + parsed.error.errors.map((e) => e.message).join('; '),
      success: false,
      upserted_count: 0,
    }
  }

  const { matchday_id, rows } = parsed.data

  // Verify matchday belongs to this league
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchday_id)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.', success: false, upserted_count: 0 }

  // scoring = editable; published = read-only (revert to scoring to edit); archived = read-only
  if (['published', 'archived'].includes(matchday.status)) {
    const label = matchday.status === 'published' ? 'pubblicata' : 'archiviata'
    return {
      error: `Non è possibile modificare le statistiche di una giornata ${label}.`,
      success: false,
      upserted_count: 0,
    }
  }

  // Verify all player_ids belong to this league
  const playerIds = rows.map((r) => r.player_id)
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id')
    .eq('league_id', ctx.league.id)
    .in('id', playerIds)

  const validPlayerIds = new Set((leaguePlayers ?? []).map((p) => p.id))
  const foreignPlayers = playerIds.filter((id) => !validPlayerIds.has(id))
  if (foreignPlayers.length > 0) {
    return {
      error: `${foreignPlayers.length} giocatori non appartengono a questa lega.`,
      success: false,
      upserted_count: 0,
    }
  }

  // Upsert all rows in one call
  const upsertRows = rows.map((row) => ({
    matchday_id,
    entered_by: ctx.userId,
    ...row,
  }))

  const { error: upsertError } = await supabase
    .from('player_match_stats')
    .upsert(upsertRows, { onConflict: 'matchday_id,player_id' })

  if (upsertError) {
    return {
      error: `Errore durante il salvataggio: ${upsertError.message}`,
      success: false,
      upserted_count: 0,
    }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'stats_edit',
    entityType: 'matchday',
    entityId: matchday_id,
    afterJson: { row_count: rows.length, matchday_id },
  })

  revalidatePath(`/matchdays/${matchday_id}/stats`)
  revalidatePath(`/matchdays/${matchday_id}`)

  return { error: null, success: true, upserted_count: rows.length }
}

// ============================================================
// toggleProvisionalAction
// Marks one or more stat rows as provisional or final.
// ============================================================

export async function toggleProvisionalAction(
  matchdayId: string,
  playerIds: string[],
  isProvisional: boolean
): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.' }

  if (['published', 'archived'].includes(matchday.status)) {
    const label = matchday.status === 'published' ? 'pubblicata' : 'archiviata'
    return { error: `Non è possibile modificare le statistiche di una giornata ${label}.` }
  }

  const { error } = await supabase
    .from('player_match_stats')
    .update({ is_provisional: isProvisional })
    .eq('matchday_id', matchdayId)
    .in('player_id', playerIds)

  if (error) return { error: error.message }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'stats_edit',
    entityType: 'matchday',
    entityId: matchdayId,
    afterJson: { action: 'toggle_provisional', is_provisional: isProvisional, player_count: playerIds.length },
  })

  revalidatePath(`/matchdays/${matchdayId}/stats`)
  return { error: null }
}

// ============================================================
// importStatsCsvAction
// Parses a CSV of stats and returns preview rows.
// Matches players by full_name (case-insensitive, trimmed).
// No DB writes — use upsertStatsAction to commit.
// ============================================================

export interface StatCsvPreviewRow {
  rowIndex: number
  player_id: string | null
  full_name: string
  matched: boolean
  match_ambiguous: boolean   // true if name matched more than one player
  data: Partial<StatRow>
  parse_error: string | null
}

export interface ImportStatsCsvResult {
  rows: StatCsvPreviewRow[]
  error: string | null
}

// Column aliases: CSV header → stat field name or sentinel 'full_name' / 'club'
const CSV_COLUMN_ALIASES: Record<string, keyof StatRow | 'full_name' | 'club'> = {
  nome: 'full_name', name: 'full_name', giocatore: 'full_name', player: 'full_name',
  // Club / team column — used for composite identity matching
  squadra: 'club', club: 'club', team: 'club', società: 'club', societa: 'club',
  min: 'minutes_played', minuti: 'minutes_played', minutes: 'minutes_played',
  sofascore: 'sofascore_rating', sofa: 'sofascore_rating',
  fotmob: 'fotmob_rating',
  gol: 'goals_scored', goal: 'goals_scored', goals: 'goals_scored',
  assist: 'assists',
  'gol_subiti': 'goals_conceded', 'gol subiti': 'goals_conceded', goals_conceded: 'goals_conceded',
  cs: 'clean_sheet', clean_sheet: 'clean_sheet', 'porta_inviolata': 'clean_sheet',
  giallo: 'yellow_cards', gialli: 'yellow_cards', yellow: 'yellow_cards',
  rosso: 'red_cards', rossi: 'red_cards', red: 'red_cards',
  autogol: 'own_goals', own_goals: 'own_goals',
  rigori_segnati: 'penalties_scored', penalties_scored: 'penalties_scored',
  rigori_sbagliati: 'penalties_missed', penalties_missed: 'penalties_missed',
  rigori_parati: 'penalties_saved', penalties_saved: 'penalties_saved',
  parate: 'saves', saves: 'saves',
  tackle: 'tackles_won', tackles: 'tackles_won', tackles_won: 'tackles_won',
  interceptions: 'interceptions', intercettamenti: 'interceptions',
  clearances: 'clearances', rinvii: 'clearances',
  blocks: 'blocks', blocchi: 'blocks',
  duelli_aerei: 'aerial_duels_won', aerial_duels_won: 'aerial_duels_won',
  dribbled_past: 'dribbled_past', saltato: 'dribbled_past',
  errori: 'error_leading_to_goal', error_leading_to_goal: 'error_leading_to_goal',
  provvisorio: 'is_provisional', provisional: 'is_provisional',
}

type LeaguePlayerRow = { id: string; full_name: string; club: string; rating_class: string }

export async function importStatsCsvAction(formData: FormData): Promise<ImportStatsCsvResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const matchdayId = formData.get('matchday_id')
  const file = formData.get('file')
  if (!file || typeof file === 'string' || typeof matchdayId !== 'string') {
    return { rows: [], error: 'File o giornata mancanti.' }
  }

  const text = await (file as File).text()
  let records: Record<string, string>[]
  try {
    records = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[]
  } catch (e) {
    return { rows: [], error: `Errore parsing CSV: ${e instanceof Error ? e.message : String(e)}` }
  }

  if (records.length === 0) return { rows: [], error: 'File CSV vuoto.' }

  // Normalize column headers
  const rawHeaders = Object.keys(records[0]!)
  const headerMap = new Map<string, keyof StatRow | 'full_name' | 'club'>()
  for (const h of rawHeaders) {
    const alias = CSV_COLUMN_ALIASES[h.toLowerCase().trim()]
    if (alias) headerMap.set(h, alias)
  }

  const mappedFields = Array.from(headerMap.values())
  if (!mappedFields.includes('full_name')) {
    return {
      rows: [],
      error: `Colonna nome non trovata. Aggiungi una colonna "Nome" o "Giocatore". Trovate: ${rawHeaders.join(', ')}`,
    }
  }
  const hasClubColumn = mappedFields.includes('club')

  // Fetch all active league players for matching
  const { data: leaguePlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, rating_class')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)

  // Build lookup indexes
  // 1. composite key "(name|club)" → player[]  — used when club column is present
  const compositeIndex = new Map<string, LeaguePlayerRow[]>()
  // 2. name-only key → player[]  — fallback when no club column
  const nameIndex = new Map<string, LeaguePlayerRow[]>()

  for (const p of leaguePlayers ?? []) {
    const nameLower = p.full_name.toLowerCase().trim()
    const compositeKey = `${nameLower}|||${p.club.toLowerCase().trim()}`

    // Composite index
    const cExisting = compositeIndex.get(compositeKey) ?? []
    cExisting.push(p)
    compositeIndex.set(compositeKey, cExisting)

    // Name-only index
    const nExisting = nameIndex.get(nameLower) ?? []
    nExisting.push(p)
    nameIndex.set(nameLower, nExisting)
  }

  const previewRows: StatCsvPreviewRow[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    let fullName = ''
    let clubRaw = ''
    const data: Record<string, unknown> = {}
    let parseError: string | null = null

    for (const [rawHeader, fieldName] of headerMap) {
      const rawVal = record[rawHeader] ?? ''
      if (fieldName === 'full_name') {
        fullName = rawVal.trim()
      } else if (fieldName === 'club') {
        clubRaw = rawVal.trim()
      } else if (fieldName === 'clean_sheet' || fieldName === 'is_provisional') {
        data[fieldName] = ['1', 'true', 'yes', 'si', 'sì'].includes(rawVal.toLowerCase().trim())
      } else if (rawVal.trim() !== '') {
        const num = Number(rawVal.trim().replace(',', '.'))
        if (isNaN(num)) {
          parseError = `Riga ${i + 2}: valore non numerico in "${rawHeader}": "${rawVal}"`
        } else {
          data[fieldName] = num
        }
      }
    }

    if (!fullName) {
      previewRows.push({
        rowIndex: i, player_id: null, full_name: '', matched: false,
        match_ambiguous: false, data: {}, parse_error: `Riga ${i + 2}: nome mancante.`,
      })
      continue
    }

    const nameLower = fullName.toLowerCase().trim()
    let matches: LeaguePlayerRow[]

    if (hasClubColumn && clubRaw) {
      // Prefer composite (name + club) match when both are available
      const compositeKey = `${nameLower}|||${clubRaw.toLowerCase().trim()}`
      matches = compositeIndex.get(compositeKey) ?? []
      // If composite gives zero results, fall through to name-only with ambiguity guard
      if (matches.length === 0) {
        const nameMatches = nameIndex.get(nameLower) ?? []
        // Name matched uniquely despite club mismatch — use it but flag as not ambiguous
        matches = nameMatches.length === 1 ? nameMatches : []
        if (nameMatches.length > 1) {
          previewRows.push({
            rowIndex: i,
            full_name: fullName,
            player_id: null,
            matched: false,
            match_ambiguous: true,
            data: data as Partial<StatRow>,
            parse_error: parseError ?? `Riga ${i + 2}: nome ambiguo (${nameMatches.length} giocatori) e squadra non corrispondente ("${clubRaw}").`,
          })
          continue
        }
      }
    } else {
      // No club column — match by name only
      matches = nameIndex.get(nameLower) ?? []
    }

    previewRows.push({
      rowIndex: i,
      full_name: fullName,
      player_id: matches.length === 1 ? matches[0]!.id : null,
      matched: matches.length === 1,
      match_ambiguous: matches.length > 1,
      data: data as Partial<StatRow>,
      parse_error: parseError ?? (matches.length > 1
        ? `Riga ${i + 2}: nome ambiguo — ${matches.length} giocatori con questo nome.`
        : null),
    })
  }

  return { rows: previewRows, error: null }
}

// ============================================================
// exportStatsCsvAction
// Returns the current stats for a matchday as a CSV string.
// ============================================================

export async function exportStatsCsvAction(matchdayId: string): Promise<string> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('*, league_players(full_name, club, rating_class)')
    .eq('matchday_id', matchdayId)
    .order('league_players(full_name)')

  if (!stats || stats.length === 0) return ''

  const headers = [
    'Nome', 'Squadra', 'Classe', 'Min',
    'SofaScore', 'FotMob',
    'Gol', 'Assist', 'Autogol', 'GolSubiti', 'PortaInviolata',
    'Giallo', 'Rosso', 'RigoriSegnati', 'RigoriSbagliati', 'RigoriParati',
    'Parate', 'Tackle', 'Interceptions', 'Rinvii', 'Blocchi', 'DuelliAerei',
    'Saltato', 'Errori', 'Provvisorio',
  ]

  const rows = stats.map((s) => {
    // Join result: Relationships: never[] means the query-parser can't infer
    // the joined shape; we assert only the fields used in the CSV export.
    const player = s.league_players as unknown as { full_name: string; club: string; rating_class: string } | null
    return [
      player?.full_name ?? '',
      player?.club ?? '',
      s.rating_class_override ?? player?.rating_class ?? '',
      s.minutes_played,
      s.sofascore_rating ?? '',
      s.fotmob_rating ?? '',
      s.goals_scored, s.assists, s.own_goals,
      s.goals_conceded, s.clean_sheet ? '1' : '0',
      s.yellow_cards, s.red_cards,
      s.penalties_scored, s.penalties_missed, s.penalties_saved,
      s.saves, s.tackles_won, s.interceptions,
      s.clearances, s.blocks, s.aerial_duels_won,
      s.dribbled_past, s.error_leading_to_goal,
      s.is_provisional ? '1' : '0',
    ]
  })

  const csvLines = [
    headers.join(','),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ]

  return csvLines.join('\n')
}
