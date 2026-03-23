'use server'

import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { RatingClass } from '@/types/database.types'

// ============================================================
// Types
// ============================================================

export interface ParsedPlayer {
  full_name: string
  club: string
  mantra_roles: string[]
  rating_class: RatingClass
  sofascore_id: number | null
  fotmob_id: number | null
  needs_roles: boolean
}

export interface ParsePoolStats {
  total: number
  matched_ss: number
  matched_fm: number
  matched_both: number
  needs_roles: number
}

export interface ParsePoolResult {
  preview: ParsedPlayer[]
  stats: ParsePoolStats
  error: string | null
}

export interface ConfirmPoolImportResult {
  imported: number
  updated: number
  error: string | null
}

// ============================================================
// Name normalization for cross-source matching
// ============================================================

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================
// Rating class derivation from mantra roles
// ============================================================

const GK_ROLES = new Set(['P'])
const DEF_ROLES = new Set(['Dc', 'Dd', 'Ds'])
const MID_ROLES = new Set(['M', 'C', 'T', 'W'])
const ATT_ROLES = new Set(['A', 'Pc'])
// 'E' is ambiguous (DEF or MID) — default to MID as safest

function deriveRatingClass(roles: string[]): RatingClass {
  if (roles.length === 0) return 'MID'

  const hasGK = roles.some((r) => GK_ROLES.has(r))
  const hasDEF = roles.some((r) => DEF_ROLES.has(r))
  const hasMID = roles.some((r) => MID_ROLES.has(r) || r === 'E')
  const hasATT = roles.some((r) => ATT_ROLES.has(r))

  if (hasGK && !hasDEF && !hasMID && !hasATT) return 'GK'
  if (hasATT) return 'ATT'
  if (hasMID) return 'MID'
  if (hasDEF) return 'DEF'
  if (hasGK) return 'GK'
  return 'MID'
}

// ============================================================
// SofaScore text parsing
// ============================================================

interface SSEntry {
  normalizedName: string
  full_name: string
  club: string
  sofascore_id: number
}

function parseSofaScoreText(raw: string): SSEntry[] {
  const entries: SSEntry[] = []
  const idRegex = /sofascore\.com\/football\/player\/([^\/\s"]+)\/(\d+)/g
  let match: RegExpExecArray | null

  while ((match = idRegex.exec(raw)) !== null) {
    const slug = match[1] ?? ''
    const id = parseInt(match[2] ?? '0', 10)
    if (!id) continue

    // Convert slug to name: "manuel-locatelli" → "Manuel Locatelli"
    const nameFromSlug = slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    // Try to find team from a nearby team URL in the same text segment
    // team URL pattern: /football/team/team-name/ID
    let club = ''
    // Search for team url near this player url (within 300 chars around match)
    const searchWindow = raw.slice(Math.max(0, match.index - 300), match.index + 300)
    const teamReg = /football\/team\/([^\/\s"]+)\/\d+/g
    let tm: RegExpExecArray | null
    while ((tm = teamReg.exec(searchWindow)) !== null) {
      const teamSlug = tm[1] ?? ''
      club = teamSlug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      break
    }

    entries.push({
      normalizedName: normalizeName(nameFromSlug),
      full_name: nameFromSlug,
      club,
      sofascore_id: id,
    })
  }

  return entries
}

// ============================================================
// FotMob text parsing
// ============================================================

interface FMEntry {
  normalizedName: string
  full_name: string
  fotmob_id: number
}

function parseFotMobText(raw: string): FMEntry[] {
  const entries: FMEntry[] = []
  // Pattern: /players/605224/federico-dimarco  (any locale prefix)
  const idRegex = /\/players\/(\d+)\/([a-z0-9\-]+)/g
  let match: RegExpExecArray | null

  while ((match = idRegex.exec(raw)) !== null) {
    const id = parseInt(match[1] ?? '0', 10)
    const slug = match[2] ?? ''
    if (!id) continue

    const nameFromSlug = slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    entries.push({
      normalizedName: normalizeName(nameFromSlug),
      full_name: nameFromSlug,
      fotmob_id: id,
    })
  }

  return entries
}

// ============================================================
// Leghe Fantacalcio CSV parsing
// ============================================================

interface LegheEntry {
  normalizedName: string
  full_name: string
  club: string
  mantra_roles: string[]
}

function parseLegheCSV(raw: string): LegheEntry[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return []

  const headerLine = lines[0] ?? ''
  const headers = headerLine.split(';').map((h) => h.trim().toLowerCase())

  // Find column indices
  const nameIdx = headers.findIndex((h) =>
    ['nome', 'name', 'giocatore', 'player'].includes(h)
  )
  const clubIdx = headers.findIndex((h) =>
    ['squadra', 'club', 'team', 'sq'].includes(h)
  )
  const roleIdx = headers.findIndex((h) =>
    ['ruolo', 'ruoli', 'role', 'roles', 'r'].includes(h)
  )

  // If no header row found, try positional (no header row)
  const hasHeader = nameIdx !== -1 || clubIdx !== -1 || roleIdx !== -1
  const startLine = hasHeader ? 1 : 0

  const resolvedNameIdx = nameIdx !== -1 ? nameIdx : 1  // 2nd col by default
  const resolvedClubIdx = clubIdx !== -1 ? clubIdx : 2  // 3rd col by default
  const resolvedRoleIdx = roleIdx !== -1 ? roleIdx : 3  // 4th col by default

  const entries: LegheEntry[] = []

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const cols = line.split(';').map((c) => c.trim())

    const rawName = cols[resolvedNameIdx] ?? ''
    const rawClub = cols[resolvedClubIdx] ?? ''
    const rawRole = cols[resolvedRoleIdx] ?? ''

    if (!rawName || rawName.toLowerCase() === 'nome' || rawName.toLowerCase() === 'name') continue

    // Parse roles: "Dc/Dd" → ["Dc", "Dd"]
    const mantra_roles = rawRole
      .split(/[\/,;\s]+/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0)

    entries.push({
      normalizedName: normalizeName(rawName),
      full_name: rawName,
      club: rawClub,
      mantra_roles,
    })
  }

  return entries
}

// ============================================================
// parsePoolDataAction — Step 1 (no DB writes)
// ============================================================

export async function parsePoolDataAction(
  formData: FormData
): Promise<ParsePoolResult> {
  await requireLeagueAdmin()

  const sofascore_raw = (formData.get('sofascore_raw') as string | null) ?? ''
  const fotmob_raw = (formData.get('fotmob_raw') as string | null) ?? ''
  const leghe_csv = (formData.get('leghe_csv') as string | null) ?? ''

  if (!sofascore_raw && !fotmob_raw && !leghe_csv) {
    return {
      preview: [],
      stats: { total: 0, matched_ss: 0, matched_fm: 0, matched_both: 0, needs_roles: 0 },
      error: 'Almeno una fonte dati è richiesta.',
    }
  }

  // Parse each source
  const ssEntries = sofascore_raw ? parseSofaScoreText(sofascore_raw) : []
  const fmEntries = fotmob_raw ? parseFotMobText(fotmob_raw) : []
  const legheEntries = leghe_csv ? parseLegheCSV(leghe_csv) : []

  // Build lookup maps by normalized name
  const ssMap = new Map<string, SSEntry>()
  for (const e of ssEntries) {
    if (!ssMap.has(e.normalizedName)) ssMap.set(e.normalizedName, e)
  }

  const fmMap = new Map<string, FMEntry>()
  for (const e of fmEntries) {
    if (!fmMap.has(e.normalizedName)) fmMap.set(e.normalizedName, e)
  }

  const legheMap = new Map<string, LegheEntry>()
  for (const e of legheEntries) {
    if (!legheMap.has(e.normalizedName)) legheMap.set(e.normalizedName, e)
  }

  // Build merged player map. Canonical name key is normalized name.
  const merged = new Map<
    string,
    {
      full_name: string
      club: string
      mantra_roles: string[]
      sofascore_id: number | null
      fotmob_id: number | null
      needs_roles: boolean
    }
  >()

  // Start from Leghe entries (most reliable for names/clubs/roles)
  for (const [key, entry] of legheMap) {
    const ss = ssMap.get(key)
    const fm = fmMap.get(key)
    merged.set(key, {
      full_name: entry.full_name,
      club: entry.club,
      mantra_roles: entry.mantra_roles,
      sofascore_id: ss?.sofascore_id ?? null,
      fotmob_id: fm?.fotmob_id ?? null,
      needs_roles: entry.mantra_roles.length === 0,
    })
  }

  // Add SS players not in Leghe
  for (const [key, entry] of ssMap) {
    if (!merged.has(key)) {
      const fm = fmMap.get(key)
      merged.set(key, {
        full_name: entry.full_name,
        club: entry.club,
        mantra_roles: [],
        sofascore_id: entry.sofascore_id,
        fotmob_id: fm?.fotmob_id ?? null,
        needs_roles: true,
      })
    } else {
      // Update sofascore_id if Leghe entry exists but lacks it
      const existing = merged.get(key)!
      if (!existing.sofascore_id) {
        existing.sofascore_id = entry.sofascore_id
      }
    }
  }

  // Add FM players not yet in merged
  for (const [key, entry] of fmMap) {
    if (!merged.has(key)) {
      merged.set(key, {
        full_name: entry.full_name,
        club: '',
        mantra_roles: [],
        sofascore_id: null,
        fotmob_id: entry.fotmob_id,
        needs_roles: true,
      })
    } else {
      const existing = merged.get(key)!
      if (!existing.fotmob_id) {
        existing.fotmob_id = entry.fotmob_id
      }
    }
  }

  // Build final preview list
  const preview: ParsedPlayer[] = []
  let matched_ss = 0
  let matched_fm = 0
  let matched_both = 0
  let needs_roles_count = 0

  for (const [, p] of merged) {
    const rating_class = deriveRatingClass(p.mantra_roles)
    const player: ParsedPlayer = {
      full_name: p.full_name,
      club: p.club,
      mantra_roles: p.mantra_roles,
      rating_class,
      sofascore_id: p.sofascore_id,
      fotmob_id: p.fotmob_id,
      needs_roles: p.needs_roles,
    }
    preview.push(player)

    if (p.sofascore_id) matched_ss++
    if (p.fotmob_id) matched_fm++
    if (p.sofascore_id && p.fotmob_id) matched_both++
    if (p.needs_roles) needs_roles_count++
  }

  // Sort by club then name
  preview.sort((a, b) => {
    const clubCmp = a.club.localeCompare(b.club, 'it')
    return clubCmp !== 0 ? clubCmp : a.full_name.localeCompare(b.full_name, 'it')
  })

  return {
    preview,
    stats: {
      total: preview.length,
      matched_ss,
      matched_fm,
      matched_both,
      needs_roles: needs_roles_count,
    },
    error: preview.length === 0 ? 'Nessun giocatore trovato. Controlla i dati incollati.' : null,
  }
}

// ============================================================
// confirmPoolImportAction — Step 2 (writes to DB)
// ============================================================

export async function confirmPoolImportAction(
  players: ParsedPlayer[],
  season: string
): Promise<ConfirmPoolImportResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  if (players.length === 0) {
    return { imported: 0, updated: 0, error: 'Nessun giocatore da importare.' }
  }

  let imported = 0
  let updated = 0

  // Batch upsert in chunks of 100
  const CHUNK = 100
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK)
    const rows = chunk.map((p) => ({
      full_name: p.full_name,
      club: p.club,
      mantra_roles: p.mantra_roles,
      rating_class: p.rating_class,
      sofascore_id: p.sofascore_id ?? undefined,
      fotmob_id: p.fotmob_id ?? undefined,
      season,
      is_active: true,
    }))

    const { data, error } = await supabase
      .from('serie_a_players')
      .upsert(rows, {
        onConflict: 'full_name,club,season',
        ignoreDuplicates: false,
      })
      .select('id')

    if (error) {
      return {
        imported,
        updated,
        error: `Errore durante l'importazione (chunk ${i / CHUNK + 1}): ${error.message}`,
      }
    }

    // We can't distinguish new vs updated in a single upsert without a
    // two-step approach; attribute all to updated for simplicity, then
    // we treat them all as "processed".
    imported += data?.length ?? 0
  }

  // Audit log
  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'pool_import',
    entityType: 'serie_a_players',
    afterJson: {
      season,
      total_players: players.length,
      imported,
    },
  })

  return { imported, updated, error: null }
}
