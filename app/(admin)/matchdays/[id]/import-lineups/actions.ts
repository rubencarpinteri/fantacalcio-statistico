'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { parseLeghiLineupText } from '@/lib/lineups/parseLeghiText'
import { normalizeName, findDbPlayer } from '@/lib/ratings/parse'
import type { DbPlayerEntry } from '@/lib/ratings/parse'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PlayerPreview {
  inputName: string
  playerId: string | null
  dbName: string | null
  mantraRoles: string[]
  /** formation_slots.id — null if no compatible slot found */
  slotId: string | null
  /** The role that was matched to the slot */
  assignedRole: string | null
  /** true = role matched via extended_mantra_roles (−1 penalty in sub) */
  isExtendedSlot: boolean
  isBench: boolean
  benchOrder: number | null
}

export interface TeamLineupPreview {
  inputName: string
  teamId: string | null
  teamDbName: string | null
  formationStr: string
  formationId: string | null
  players: PlayerPreview[]
  /** Errors that prevent import (unmatched team/formation, unmatched player, no slot) */
  errors: string[]
  /** Non-blocking warnings shown to admin */
  warnings: string[]
  /** true = team/formation matched AND all 11 starters have valid slots */
  canImport: boolean
}

export interface ParseAndMatchResult {
  ok: boolean
  error?: string
  teams: TeamLineupPreview[]
  /** Full list of fantasy teams — used by the UI to offer a manual team picker for unmatched teams */
  availableTeams: { id: string; name: string }[]
}

// ─── Slot shape from DB ────────────────────────────────────────────────────────

interface FormationSlot {
  id: string
  slot_name: string
  slot_order: number
  is_bench: boolean
  bench_order: number | null
  allowed_mantra_roles: string[]
  extended_mantra_roles: string[]
}

// ─── Slot auto-assignment ──────────────────────────────────────────────────────
//
// Two-pass greedy:
//   Pass 1 — assign each player to the first available slot where their role
//             is NATIVE (in allowed_mantra_roles).
//   Pass 2 — for remaining players, try EXTENDED matches.
//
// We process players in the order they appear in the Leghe text so that the
// positional order (GK → DEF → MID → ATT) naturally drives the assignment.
//
function assignSlots(
  players: PlayerPreview[],
  slots: FormationSlot[],
  isBench: boolean,
): PlayerPreview[] {
  const available = [...slots]
    .filter((s) => s.is_bench === isBench)
    .sort((a, b) => a.slot_order - b.slot_order)

  const usedSlotIds = new Set<string>()

  // Give each player an attempted slot assignment
  const result: PlayerPreview[] = players.map((p) => ({ ...p }))

  // ── Pass 1: native matches ────────────────────────────────────────────────
  for (const p of result) {
    if (!p.playerId) continue     // unmatched player — skip
    if (p.slotId) continue        // already assigned (shouldn't happen in first pass)

    for (const slot of available) {
      if (usedSlotIds.has(slot.id)) continue
      const native = p.mantraRoles.find((r) => slot.allowed_mantra_roles.includes(r))
      if (native) {
        p.slotId = slot.id
        p.assignedRole = native
        p.isExtendedSlot = false
        usedSlotIds.add(slot.id)
        break
      }
    }
  }

  // ── Pass 2: extended matches for still-unassigned players ─────────────────
  for (const p of result) {
    if (!p.playerId) continue
    if (p.slotId) continue   // already placed in pass 1

    for (const slot of available) {
      if (usedSlotIds.has(slot.id)) continue
      const extended = p.mantraRoles.find((r) => slot.extended_mantra_roles.includes(r))
      if (extended) {
        p.slotId = slot.id
        p.assignedRole = extended
        p.isExtendedSlot = true
        usedSlotIds.add(slot.id)
        break
      }
    }
  }

  return result
}

// ─── parseAndMatchAction ──────────────────────────────────────────────────────
//
// Parses the pasted Leghe text and matches each team/player against the DB.
// Returns a preview for the admin to review before confirming.
//
export async function parseAndMatchAction(
  matchdayId: string,
  text: string,
): Promise<ParseAndMatchResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // ── Verify matchday ───────────────────────────────────────────────────────
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { ok: false, error: 'Giornata non trovata.', teams: [], availableTeams: [] }
  if (!['open', 'locked'].includes(matchday.status)) {
    return {
      ok: false,
      error: `Le formazioni possono essere importate solo quando la giornata è "aperta" o "chiusa". Stato attuale: "${matchday.status}".`,
      teams: [],
      availableTeams: [],
    }
  }

  // ── Parse text ─────────────────────────────────────────────────────────────
  const parsed = parseLeghiLineupText(text.trim())
  if (parsed.length === 0) {
    return { ok: false, error: 'Nessuna formazione trovata nel testo. Controlla il formato.', teams: [], availableTeams: [] }
  }

  // ── Fetch DB data ──────────────────────────────────────────────────────────
  const [
    { data: teamsRaw },
    { data: playersRaw },
    { data: formationsRaw },
  ] = await Promise.all([
    supabase.from('fantasy_teams').select('id, name, leghe_names').eq('league_id', ctx.league.id),
    supabase
      .from('league_players')
      .select('id, full_name, club, mantra_roles, is_active')
      .eq('league_id', ctx.league.id)
      .eq('is_active', true),
    supabase.from('formations').select('id, name').eq('league_id', ctx.league.id),
  ])

  const teams = teamsRaw ?? []
  const players = playersRaw ?? []
  const formations = formationsRaw ?? []

  // ── Fetch active roster entries so we can scope player search per team ────
  const { data: rosterEntriesRaw } = await supabase
    .from('team_roster_entries')
    .select('team_id, player_id')
    .in('team_id', teams.map((t) => t.id))
    .is('released_at', null)

  // Build a Set<playerId> per team
  const rosterByTeam = new Map<string, Set<string>>()
  for (const entry of rosterEntriesRaw ?? []) {
    const s = rosterByTeam.get(entry.team_id) ?? new Set<string>()
    s.add(entry.player_id)
    rosterByTeam.set(entry.team_id, s)
  }

  // Build normalized lookups — each team appears once per name it can be matched by
  // (canonical name + all leghe_names aliases)
  const teamEntries: DbPlayerEntry[] = []
  for (const t of teams) {
    teamEntries.push({ id: t.id, full_name: t.name, club: '', normalized: normalizeName(t.name) })
    for (const alias of t.leghe_names ?? []) {
      teamEntries.push({ id: t.id, full_name: alias, club: '', normalized: normalizeName(alias) })
    }
  }

  const playerEntries: (DbPlayerEntry & { mantraRoles: string[]; dbName: string })[] =
    players.map((p) => ({
      id: p.id,
      full_name: p.full_name,
      club: p.club ?? '',
      normalized: normalizeName(p.full_name),
      mantraRoles: (p.mantra_roles as string[] | null) ?? [],
      dbName: p.full_name,
    }))

  // formation name → { id }
  const formationMap = new Map(
    formations.map((f) => [f.name.trim().toLowerCase(), f.id])
  )

  // ── Fetch all formation slots for formations we might need ─────────────────
  const formationIds = formations.map((f) => f.id)
  const { data: allSlots } = formationIds.length > 0
    ? await supabase
        .from('formation_slots')
        .select('id, formation_id, slot_name, slot_order, is_bench, bench_order, allowed_mantra_roles, extended_mantra_roles')
        .in('formation_id', formationIds)
    : { data: [] }

  const slotsByFormation = new Map<string, FormationSlot[]>()
  for (const slot of allSlots ?? []) {
    const list = slotsByFormation.get(slot.formation_id) ?? []
    list.push(slot as FormationSlot)
    slotsByFormation.set(slot.formation_id, list)
  }

  // ── Match each parsed team ─────────────────────────────────────────────────
  const teamPreviews: TeamLineupPreview[] = []

  for (const parsed_team of parsed) {
    const errors: string[] = []
    const warnings: string[] = []

    // ── Match team name ───────────────────────────────────────────────────
    const teamMatch = findDbPlayer(normalizeName(parsed_team.teamName), teamEntries)
    const teamId = teamMatch?.id ?? null
    const teamDbName = teamMatch ? teams.find((t) => t.id === teamMatch.id)?.name ?? null : null

    if (!teamId) {
      errors.push(`Squadra non trovata: "${parsed_team.teamName}"`)
    }

    // ── Match formation ───────────────────────────────────────────────────
    const formationId = formationMap.get(parsed_team.formationStr.trim().toLowerCase()) ?? null
    if (!formationId) {
      errors.push(`Formazione non trovata: "${parsed_team.formationStr}". Assicurati che esista nella lega.`)
    }

    // ── Match players ─────────────────────────────────────────────────────
    const slots = formationId ? (slotsByFormation.get(formationId) ?? []) : []
    const usedPlayerIds = new Set<string>()

    // Scope player search to this team's roster when the team is known.
    // Fall back to all league players when the team wasn't matched (so the
    // admin can still see which players were found even before fixing the team).
    const rosterIds = teamId ? rosterByTeam.get(teamId) : null
    const scopedPlayers = rosterIds
      ? playerEntries.filter((p) => rosterIds.has(p.id))
      : playerEntries

    const buildPlayerPreviews = (
      names: string[],
      isBench: boolean,
    ): PlayerPreview[] => {
      return names.map((name, idx) => {
        const norm = normalizeName(name)
        // Try team-scoped roster first (avoids ambiguity between players with same surname on
        // different teams). Fall back to all league players for players not in roster entries
        // (e.g. recently imported but not yet assigned via RosaBuilder).
        const match =
          findDbPlayer(norm, scopedPlayers) ??
          (scopedPlayers !== playerEntries ? findDbPlayer(norm, playerEntries) : undefined)

        if (!match) {
          errors.push(`${isBench ? 'Panchina' : 'Titolare'} non trovato: "${name}"`)
          return {
            inputName: name,
            playerId: null,
            dbName: null,
            mantraRoles: [],
            slotId: null,
            assignedRole: null,
            isExtendedSlot: false,
            isBench,
            benchOrder: isBench ? idx + 1 : null,
          }
        }

        if (usedPlayerIds.has(match.id)) {
          errors.push(`Giocatore duplicato: "${name}"`)
          return {
            inputName: name,
            playerId: null,
            dbName: match.dbName,
            mantraRoles: match.mantraRoles,
            slotId: null,
            assignedRole: null,
            isExtendedSlot: false,
            isBench,
            benchOrder: isBench ? idx + 1 : null,
          }
        }

        usedPlayerIds.add(match.id)

        // Warn if name was fuzzy-matched (not exact)
        if (normalizeName(match.dbName) !== norm) {
          warnings.push(`"${name}" abbinato a "${match.dbName}"`)
        }

        return {
          inputName: name,
          playerId: match.id,
          dbName: match.dbName,
          mantraRoles: match.mantraRoles,
          slotId: null,         // filled in by assignSlots below
          assignedRole: null,
          isExtendedSlot: false,
          isBench,
          benchOrder: isBench ? idx + 1 : null,
        }
      })
    }

    let starters = buildPlayerPreviews(parsed_team.starterNames, false)
    let bench    = buildPlayerPreviews(parsed_team.benchNames, true)

    // ── Auto-assign starter slots ─────────────────────────────────────────
    if (formationId && slots.length > 0) {
      starters = assignSlots(starters, slots, false)
      bench    = assignSlots(bench,    slots, true)

      // Warn about extended slot assignments
      for (const p of starters) {
        if (p.isExtendedSlot && p.playerId) {
          warnings.push(`"${p.dbName ?? p.inputName}" in slot esteso (−1 in caso di sostituzione)`)
        }
      }

      // Error for starters that got no slot
      for (const p of starters) {
        if (p.playerId && !p.slotId) {
          errors.push(`Nessuno slot compatibile per "${p.dbName ?? p.inputName}" (ruoli: ${p.mantraRoles.join(', ')})`)
        }
      }
    }

    // Expected 11 starters
    if (parsed_team.starterNames.length !== 11) {
      warnings.push(`Numero titolari inatteso: ${parsed_team.starterNames.length} (attesi 11)`)
    }

    const allPlayers = [...starters, ...bench]

    const canImport =
      errors.length === 0 &&
      !!teamId &&
      !!formationId &&
      starters.length === 11 &&
      starters.every((p) => p.playerId && p.slotId)

    teamPreviews.push({
      inputName: parsed_team.teamName,
      teamId,
      teamDbName,
      formationStr: parsed_team.formationStr,
      formationId,
      players: allPlayers,
      errors,
      warnings,
      canImport,
    })
  }

  const availableTeams = teams.map((t) => ({ id: t.id, name: t.name }))
  return { ok: true, teams: teamPreviews, availableTeams }
}

// ─── confirmLineupImportAction ────────────────────────────────────────────────
//
// Saves confirmed lineups for all importable teams.
// Uses direct DB inserts (not the submit_lineup RPC) to support admin bulk import.
//
export interface ConfirmLineupImportResult {
  ok: boolean
  error?: string
  imported: number
  skipped: number
  details: Array<{ teamName: string; ok: boolean; error?: string }>
}

export interface ConfirmedPlayer {
  playerId: string
  slotId: string
  assignedRole: string | null
  isBench: boolean
  benchOrder: number | null
}

export interface ConfirmedTeamLineup {
  teamId: string
  teamName: string
  formationId: string
  players: ConfirmedPlayer[]
}

export async function confirmLineupImportAction(
  matchdayId: string,
  lineups: ConfirmedTeamLineup[],
): Promise<ConfirmLineupImportResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify matchday
  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) {
    return { ok: false, error: 'Giornata non trovata.', imported: 0, skipped: 0, details: [] }
  }
  if (!['open', 'locked'].includes(matchday.status)) {
    return {
      ok: false,
      error: `Importazione non consentita in stato "${matchday.status}".`,
      imported: 0,
      skipped: 0,
      details: [],
    }
  }

  const now = new Date().toISOString()
  const details: ConfirmLineupImportResult['details'] = []
  let imported = 0
  let skipped = 0

  for (const lineup of lineups) {
    try {
      // Compute next submission_number for this team+matchday
      const { data: maxRow } = await supabase
        .from('lineup_submissions')
        .select('submission_number')
        .eq('matchday_id', matchdayId)
        .eq('team_id', lineup.teamId)
        .order('submission_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const submission_number = (maxRow?.submission_number ?? 0) + 1

      // Insert lineup_submissions
      const { data: submission, error: subErr } = await supabase
        .from('lineup_submissions')
        .insert({
          matchday_id:       matchdayId,
          team_id:           lineup.teamId,
          formation_id:      lineup.formationId,
          actor_user_id:     ctx.userId,
          submission_number,
          status:            'submitted',
          submitted_at:      now,
          source_ip:         null,
        })
        .select('id')
        .single()

      if (subErr || !submission) {
        throw new Error(subErr?.message ?? 'Errore inserimento lineup_submissions')
      }

      // Insert lineup_submission_players
      const playerRows = lineup.players.map((p) => ({
        submission_id:       submission.id,
        player_id:           p.playerId,
        slot_id:             p.slotId,
        is_bench:            p.isBench,
        bench_order:         p.benchOrder,
        assigned_mantra_role: p.assignedRole,
      }))

      const { error: playersErr } = await supabase
        .from('lineup_submission_players')
        .insert(playerRows)

      if (playersErr) {
        throw new Error(playersErr.message)
      }

      // Upsert lineup_current_pointers
      const { error: ptrErr } = await supabase
        .from('lineup_current_pointers')
        .upsert(
          {
            matchday_id:   matchdayId,
            team_id:       lineup.teamId,
            submission_id: submission.id,
            updated_at:    now,
          },
          { onConflict: 'matchday_id,team_id' }
        )

      if (ptrErr) {
        throw new Error(ptrErr.message)
      }

      await writeAuditLog({
        supabase,
        leagueId:    ctx.league.id,
        actorUserId: ctx.userId,
        actionType:  'lineup_submit',
        entityType:  'lineup_submission',
        entityId:    submission.id,
        afterJson:   {
          source:            'leghe_text_import',
          submission_number,
          team_id:           lineup.teamId,
          formation_id:      lineup.formationId,
          player_count:      lineup.players.length,
        },
      })

      details.push({ teamName: lineup.teamName, ok: true })
      imported++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      details.push({ teamName: lineup.teamName, ok: false, error: msg })
      skipped++
    }
  }

  revalidatePath(`/matchdays/${matchdayId}/all-lineups`)
  revalidatePath(`/matchdays/${matchdayId}/lineup`)
  revalidatePath(`/matchdays/${matchdayId}`)

  return { ok: true, imported, skipped, details }
}

// ─── saveTeamLegheAliasAction ─────────────────────────────────────────────────
//
// Appends a new Leghe.it team name alias to fantasy_teams.leghe_names so future
// imports auto-match without requiring a manual override.
// Duplicate aliases are silently ignored.
//
export async function saveTeamLegheAliasAction(
  teamId: string,
  legheName: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const newAlias = legheName.trim()
  if (!newAlias) return { ok: true }

  // Fetch current aliases to avoid duplicates
  const { data: team, error: fetchErr } = await supabase
    .from('fantasy_teams')
    .select('leghe_names')
    .eq('id', teamId)
    .eq('league_id', ctx.league.id)
    .single()

  if (fetchErr || !team) return { ok: false, error: fetchErr?.message ?? 'Team not found' }

  const current: string[] = team.leghe_names ?? []
  if (current.includes(newAlias)) return { ok: true } // already saved

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ leghe_names: [...current, newAlias] })
    .eq('id', teamId)
    .eq('league_id', ctx.league.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
