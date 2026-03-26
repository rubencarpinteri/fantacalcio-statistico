'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'

const MAX_ROSTER_SIZE = 30

export interface AssignPlayerResult {
  error: string | null
  rosterEntryId?: string
  leaguePlayerId?: string
}

export interface ReleasePlayerResult {
  error: string | null
}

// ============================================================
// assignPlayerAction
// Assigns a Serie A pool player to a fantasy team roster.
// Creates or links a league_players entry for this league.
// ============================================================

export async function assignPlayerAction(
  teamId: string,
  serieAPlayerId: string
): Promise<AssignPlayerResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify team belongs to this league
  const { data: team } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!team) {
    return { error: 'Squadra non trovata in questa lega.' }
  }

  // Fetch pool player
  const { data: poolPlayer } = await supabase
    .from('serie_a_players')
    .select('id, full_name, club, mantra_roles, rating_class, sofascore_id, fotmob_id')
    .eq('id', serieAPlayerId)
    .single()

  if (!poolPlayer) {
    return { error: 'Giocatore non trovato nel pool.' }
  }

  // Check player is not already on a team in this league with active roster entry.
  // Two-step query to avoid complex join type issues:
  // 1. Find league_player linked to this pool player in this league
  // 2. Check for active roster entry
  const { data: linkedLP } = await supabase
    .from('league_players')
    .select('id')
    .eq('serie_a_player_id', serieAPlayerId)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  if (linkedLP) {
    // Check for active roster entry for any team in this league
    const { data: activeEntry } = await supabase
      .from('team_roster_entries')
      .select('id, fantasy_teams!inner(league_id)')
      .eq('player_id', linkedLP.id)
      .is('released_at', null)
      .maybeSingle()

    const entryTeam = activeEntry
      ? (activeEntry.fantasy_teams as unknown as { league_id: string } | null)
      : null

    if (entryTeam?.league_id === ctx.league.id) {
      return {
        error: `${poolPlayer.full_name} è già in rosa in questa lega.`,
      }
    }
  }

  // Check current roster size
  const { count: rosterSize } = await supabase
    .from('team_roster_entries')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .is('released_at', null)

  if ((rosterSize ?? 0) >= MAX_ROSTER_SIZE) {
    return {
      error: `La rosa è già al completo (${MAX_ROSTER_SIZE} giocatori). Rilascia un giocatore prima di aggiungerne uno nuovo.`,
    }
  }

  // Get or create league_players entry for this player in this league
  // First try by serie_a_player_id + league_id
  const { data: existingLP } = await supabase
    .from('league_players')
    .select('id')
    .eq('serie_a_player_id', serieAPlayerId)
    .eq('league_id', ctx.league.id)
    .maybeSingle()

  let leaguePlayerId: string

  if (existingLP) {
    leaguePlayerId = existingLP.id
    // Ensure player is marked active
    await supabase
      .from('league_players')
      .update({ is_active: true })
      .eq('id', leaguePlayerId)
  } else {
    // Upsert by (league_id, full_name, club) — handles re-import cases
    const { data: upsertedLP, error: upsertError } = await supabase
      .from('league_players')
      .upsert(
        {
          league_id: ctx.league.id,
          full_name: poolPlayer.full_name,
          club: poolPlayer.club,
          mantra_roles: poolPlayer.mantra_roles as string[],
          primary_mantra_role: (poolPlayer.mantra_roles as string[])[0] ?? null,
          rating_class: poolPlayer.rating_class as 'GK' | 'DEF' | 'MID' | 'ATT',
          serie_a_player_id: serieAPlayerId,
          is_active: true,
        },
        {
          onConflict: 'league_id,full_name,club',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single()

    if (upsertError || !upsertedLP) {
      return {
        error: `Errore durante la creazione del giocatore in lega: ${upsertError?.message ?? 'sconosciuto'}`,
      }
    }

    leaguePlayerId = upsertedLP.id

    // Ensure serie_a_player_id is set if the row already existed without it
    await supabase
      .from('league_players')
      .update({ serie_a_player_id: serieAPlayerId })
      .eq('id', leaguePlayerId)
      .is('serie_a_player_id', null)
  }

  // Insert roster entry
  const { data: rosterEntry, error: rosterError } = await supabase
    .from('team_roster_entries')
    .insert({
      team_id: teamId,
      player_id: leaguePlayerId,
      import_batch_id: null,
    })
    .select('id')
    .single()

  if (rosterError || !rosterEntry) {
    return {
      error: `Errore durante l'assegnazione alla rosa: ${rosterError?.message ?? 'sconosciuto'}`,
    }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'rosa_assign',
    entityType: 'team_roster_entries',
    entityId: rosterEntry.id,
    afterJson: {
      team_id: teamId,
      team_name: team.name,
      player_name: poolPlayer.full_name,
      club: poolPlayer.club,
      league_player_id: leaguePlayerId,
      serie_a_player_id: serieAPlayerId,
    },
  })

  revalidatePath('/roster')

  return { error: null, rosterEntryId: rosterEntry.id, leaguePlayerId }
}

// ============================================================
// renameTeamAction
// ============================================================

export interface RenameTeamResult {
  error: string | null
}

export async function renameTeamAction(
  teamId: string,
  newName: string
): Promise<RenameTeamResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const trimmed = newName.trim()
  if (!trimmed || trimmed.length < 2) {
    return { error: 'Il nome deve avere almeno 2 caratteri.' }
  }
  if (trimmed.length > 60) {
    return { error: 'Il nome non può superare 60 caratteri.' }
  }

  const { error } = await supabase
    .from('fantasy_teams')
    .update({ name: trimmed })
    .eq('id', teamId)
    .eq('league_id', ctx.league.id)

  if (error) return { error: error.message }

  revalidatePath('/roster')
  return { error: null }
}

// ============================================================
// releasePlayerAction
// Soft-releases a player from a team by setting released_at.
// ============================================================

export async function releasePlayerAction(
  rosterEntryId: string
): Promise<ReleasePlayerResult> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Fetch the roster entry with team membership verification
  const { data: entry } = await supabase
    .from('team_roster_entries')
    .select(`
      id,
      team_id,
      player_id,
      released_at,
      fantasy_teams!inner(id, name, league_id),
      league_players!inner(full_name, club)
    `)
    .eq('id', rosterEntryId)
    .single()

  if (!entry) {
    return { error: 'Voce di rosa non trovata.' }
  }

  if (entry.released_at !== null) {
    return { error: 'Questo giocatore è già stato rilasciato.' }
  }

  // Verify team belongs to this league
  const team = entry.fantasy_teams as unknown as { id: string; name: string; league_id: string }
  if (team.league_id !== ctx.league.id) {
    return { error: 'Accesso negato: la squadra non appartiene a questa lega.' }
  }

  const { error: updateError } = await supabase
    .from('team_roster_entries')
    .update({ released_at: new Date().toISOString() })
    .eq('id', rosterEntryId)

  if (updateError) {
    return { error: updateError.message }
  }

  const lp = entry.league_players as unknown as { full_name: string; club: string }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'rosa_release',
    entityType: 'team_roster_entries',
    entityId: rosterEntryId,
    afterJson: {
      team_id: entry.team_id,
      team_name: team.name,
      player_name: lp.full_name,
      club: lp.club,
      player_id: entry.player_id,
    },
  })

  revalidatePath('/roster')

  return { error: null }
}
