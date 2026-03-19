'use server'

import { z } from 'zod'
import { parse } from 'csv-parse/sync'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { resolveRatingClass } from '@/domain/roles/resolveRatingClass'
import { ALL_MANTRA_ROLES } from '@/domain/roles/defaultRoleMap'
import type { RatingClass } from '@/types/database.types'

// ---------- Types ----------------------------------------------------------

export interface ParsedRow {
  rowIndex: number
  full_name: string
  club: string
  mantra_roles: string[]
  primary_mantra_role: string | null
  resolved_rating_class: RatingClass | null
  needs_confirmation: boolean
  confirmation_reason: string | null
  parse_error: string | null
}

export interface ParseCsvResult {
  rows: ParsedRow[]
  teams: Array<{ id: string; name: string }>
  error: string | null
}

// ---------- Step 1: Parse CSV (no DB writes) -------------------------------

export async function parseRosterCsvAction(
  formData: FormData
): Promise<ParseCsvResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return { rows: [], teams: [], error: 'Nessun file selezionato.' }
  }

  const text = await (file as File).text()

  let records: Record<string, string>[]
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]
  } catch (e) {
    return {
      rows: [],
      teams: [],
      error: `Errore nel parsing del CSV: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (records.length === 0) {
    return { rows: [], teams: [], error: 'Il file CSV è vuoto.' }
  }

  // Detect column names (case-insensitive fuzzy match)
  const firstRecord = records[0]!
  const rawHeaders = Object.keys(firstRecord)
  const normalize = (s: string) => s.toLowerCase().trim()

  function findCol(candidates: string[]): string | undefined {
    return rawHeaders.find((h) => candidates.includes(normalize(h)))
  }

  const nameKey = findCol(['nome', 'name', 'giocatore', 'player', 'nominativo'])
  const clubKey = findCol(['squadra', 'club', 'team', 'sq', 'squadra reale', 'real team'])
  const roleKey = findCol(['ruolo', 'ruoli', 'role', 'roles', 'r', 'ruoli mantra'])

  if (!nameKey || !clubKey || !roleKey) {
    return {
      rows: [],
      teams: [],
      error: `Intestazioni CSV non riconosciute. Sono richieste le colonne: Nome, Squadra, Ruolo (o equivalenti in inglese). Trovate: ${rawHeaders.join(', ')}`,
    }
  }

  // Fetch league's role classification rules
  const { data: rules } = await supabase
    .from('role_classification_rules')
    .select('mantra_role, default_rating_class')
    .eq('league_id', ctx.league.id)

  const leagueRules: Record<string, RatingClass> = {}
  for (const rule of rules ?? []) {
    leagueRules[rule.mantra_role] = rule.default_rating_class as RatingClass
  }

  // Fetch teams for the assignment step
  const { data: teamsData } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('league_id', ctx.league.id)
    .order('name')

  const rows: ParsedRow[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    const full_name = (record[nameKey] ?? '').trim()
    const club = (record[clubKey] ?? '').trim()
    const rawRoles = (record[roleKey] ?? '').trim()

    if (!full_name) {
      rows.push({
        rowIndex: i,
        full_name: '',
        club,
        mantra_roles: [],
        primary_mantra_role: null,
        resolved_rating_class: null,
        needs_confirmation: false,
        confirmation_reason: null,
        parse_error: `Riga ${i + 2}: nome mancante.`,
      })
      continue
    }

    // Parse roles: accepts "Dc/E", "Dc,E", or "Dc E"
    const mantra_roles = rawRoles
      .split(/[/,;\s]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0)

    if (mantra_roles.length === 0) {
      rows.push({
        rowIndex: i,
        full_name,
        club,
        mantra_roles: [],
        primary_mantra_role: null,
        resolved_rating_class: null,
        needs_confirmation: true,
        confirmation_reason: 'Nessun ruolo specificato.',
        parse_error: `Riga ${i + 2}: ruolo mancante.`,
      })
      continue
    }

    const unknownRoles = mantra_roles.filter((r) => !ALL_MANTRA_ROLES.includes(r))
    const primary_mantra_role = mantra_roles[0] ?? null
    const resolution = resolveRatingClass(mantra_roles, primary_mantra_role, leagueRules)

    rows.push({
      rowIndex: i,
      full_name,
      club,
      mantra_roles,
      primary_mantra_role,
      resolved_rating_class: resolution.resolved ? resolution.ratingClass : null,
      needs_confirmation: !resolution.resolved,
      confirmation_reason: !resolution.resolved
        ? resolution.reason === 'ambiguous'
          ? `Ruolo ambiguo: "${resolution.ambiguousRole}" (DEF o MID?)`
          : `Ruolo sconosciuto: "${resolution.role}"`
        : null,
      parse_error:
        unknownRoles.length > 0
          ? `Ruoli non riconosciuti: ${unknownRoles.join(', ')}`
          : null,
    })
  }

  return { rows, teams: teamsData ?? [], error: null }
}

// ---------- Step 2: Confirm import (writes to DB) --------------------------

const confirmedRowSchema = z.object({
  full_name: z.string().min(1),
  club: z.string().min(1),
  mantra_roles: z.array(z.string()).min(1),
  primary_mantra_role: z.string().nullable(),
  rating_class: z.enum(['GK', 'DEF', 'MID', 'ATT']),
})

const confirmImportSchema = z.object({
  team_id: z.string().uuid().nullable(),
  filename: z.string().min(1),
  rows: z.array(confirmedRowSchema).min(1),
})

export interface ConfirmImportResult {
  error: string | null
  success: boolean
  imported_count: number
  skipped_count: number
  batch_id: string | null
}

export async function confirmImportAction(
  payload: z.infer<typeof confirmImportSchema>
): Promise<ConfirmImportResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const parsed = confirmImportSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      error: 'Dati non validi: ' + parsed.error.errors.map((e) => e.message).join(', '),
      success: false,
      imported_count: 0,
      skipped_count: 0,
      batch_id: null,
    }
  }

  const { team_id, filename, rows } = parsed.data

  // Verify team belongs to the league if provided
  if (team_id) {
    const { data: team } = await supabase
      .from('fantasy_teams')
      .select('id')
      .eq('id', team_id)
      .eq('league_id', ctx.league.id)
      .single()
    if (!team) {
      return {
        error: 'Squadra non trovata nella lega.',
        success: false,
        imported_count: 0,
        skipped_count: 0,
        batch_id: null,
      }
    }
  }

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from('roster_import_batches')
    .insert({
      league_id: ctx.league.id,
      imported_by: ctx.userId,
      filename,
      row_count: rows.length,
      success_count: 0,
      error_count: 0,
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    return {
      error: 'Errore durante la creazione del batch.',
      success: false,
      imported_count: 0,
      skipped_count: 0,
      batch_id: null,
    }
  }

  let successCount = 0
  let skippedCount = 0

  for (const row of rows) {
    // Single upsert using the DB-level UNIQUE(league_id, full_name, club) constraint
    // (migration 005). ON CONFLICT updates roles and rating_class; the player's id
    // is preserved so all historical references (team_roster_entries, player_match_stats)
    // remain valid.
    const { data: upserted, error: upsertError } = await supabase
      .from('league_players')
      .upsert(
        {
          league_id: ctx.league.id,
          full_name: row.full_name,
          club: row.club,
          mantra_roles: row.mantra_roles,
          primary_mantra_role: row.primary_mantra_role,
          rating_class: row.rating_class,
          is_active: true,
        },
        {
          onConflict: 'league_id,full_name,club',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single()

    if (upsertError || !upserted) {
      skippedCount++
      continue
    }

    const playerId = upserted.id

    // Assign to team roster if requested
    if (team_id) {
      // Only insert if not already in this team's active roster
      const { data: rosterEntry } = await supabase
        .from('team_roster_entries')
        .select('id')
        .eq('team_id', team_id)
        .eq('player_id', playerId)
        .is('released_at', null)
        .single()

      if (!rosterEntry) {
        const { error: rosterError } = await supabase
          .from('team_roster_entries')
          .insert({
            team_id,
            player_id: playerId,
            import_batch_id: batch.id,
          })

        if (rosterError) {
          skippedCount++
          continue
        }
      }
    }

    successCount++
  }

  // Update batch summary
  await supabase
    .from('roster_import_batches')
    .update({ success_count: successCount, error_count: skippedCount })
    .eq('id', batch.id)

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'roster_import',
    entityType: 'roster_import_batches',
    entityId: batch.id,
    afterJson: {
      filename,
      row_count: rows.length,
      success_count: successCount,
      skipped_count: skippedCount,
      team_id,
    },
  })

  return {
    error:
      successCount === 0
        ? 'Nessun giocatore importato. Controlla i dati e riprova.'
        : null,
    success: successCount > 0,
    imported_count: successCount,
    skipped_count: skippedCount,
    batch_id: batch.id,
  }
}
