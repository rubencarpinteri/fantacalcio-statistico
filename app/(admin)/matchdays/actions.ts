'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import type { MatchdayStatus } from '@/types/database.types'

const matchdaySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio').max(80),
  matchday_number: z.coerce.number().int().min(1).optional().nullable(),
  round_number: z.coerce.number().int().min(1).optional().nullable(),
  opens_at: z.string().datetime({ offset: true }).optional().nullable(),
  locks_at: z.string().datetime({ offset: true }).optional().nullable(),
})

export interface MatchdayActionState {
  error: string | null
  success: boolean
}

export async function createMatchdayAction(
  _prev: MatchdayActionState,
  formData: FormData
): Promise<MatchdayActionState> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const raw = {
    name: formData.get('name'),
    matchday_number: formData.get('matchday_number') || null,
    round_number: formData.get('round_number') || null,
    opens_at: formData.get('opens_at') || null,
    locks_at: formData.get('locks_at') || null,
  }

  const parsed = matchdaySchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  // Validate lock is after open if both provided
  if (parsed.data.opens_at && parsed.data.locks_at) {
    if (new Date(parsed.data.locks_at) <= new Date(parsed.data.opens_at)) {
      return { error: 'La scadenza deve essere successiva all\'apertura.', success: false }
    }
  }

  const { data: matchday, error } = await supabase
    .from('matchdays')
    .insert({
      league_id: ctx.league.id,
      name: parsed.data.name,
      matchday_number: parsed.data.matchday_number ?? null,
      round_number: parsed.data.round_number ?? null,
      opens_at: parsed.data.opens_at ?? null,
      locks_at: parsed.data.locks_at ?? null,
      status: 'draft',
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (error) {
    return { error: 'Impossibile creare la giornata. Riprova.', success: false }
  }

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: 'matchday_create',
    entityType: 'matchday',
    entityId: matchday.id,
    afterJson: {
      name: parsed.data.name,
      opens_at: parsed.data.opens_at,
      locks_at: parsed.data.locks_at,
    },
  })

  revalidatePath('/matchdays')
  redirect(`/matchdays/${matchday.id}`)
}

// Valid transitions enforced at application level.
// Simplified machine: draft → open ↔ closed → archived
// Legacy statuses (locked/scoring/published) can only move to closed.
const ALLOWED_TRANSITIONS: Record<MatchdayStatus, MatchdayStatus[]> = {
  draft:     ['open'],
  open:      ['closed', 'draft'],
  closed:    ['open', 'archived'],
  archived:  [],
  // Legacy — kept for rows that weren't migrated
  locked:    ['closed'],
  scoring:   ['closed'],
  published: ['closed', 'archived'],
}

export async function transitionMatchdayStatusAction(
  matchdayId: string,
  newStatus: MatchdayStatus,
  note: string | null
): Promise<{ error: string | null }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  const { data: matchday } = await supabase
    .from('matchdays')
    .select('id, status, league_id')
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!matchday) return { error: 'Giornata non trovata.' }

  const allowed = ALLOWED_TRANSITIONS[matchday.status] ?? []
  if (!allowed.includes(newStatus)) {
    return {
      error: `Transizione non valida: da "${matchday.status}" a "${newStatus}" non è permessa.`,
    }
  }

  // Guard: only one matchday can be open at a time
  if (newStatus === 'open') {
    const { data: alreadyOpen } = await supabase
      .from('matchdays')
      .select('id, name')
      .eq('league_id', ctx.league.id)
      .eq('status', 'open')
      .neq('id', matchdayId)
      .limit(1)
      .maybeSingle()

    if (alreadyOpen) {
      return {
        error: `Impossibile aprire questa giornata: "${alreadyOpen.name}" è già aperta. Chiudila prima di aprire un'altra giornata.`,
      }
    }
  }

  const { error } = await supabase
    .from('matchdays')
    .update({ status: newStatus })
    .eq('id', matchdayId)
    .eq('league_id', ctx.league.id)

  if (error) return { error: 'Impossibile aggiornare lo stato. Riprova.' }

  // Append to status log (append-only table — no updates)
  await supabase.from('matchday_status_log').insert({
    matchday_id: matchdayId,
    old_status: matchday.status,
    new_status: newStatus,
    changed_by: ctx.userId,
    note: note ?? null,
  })

  await writeAuditLog({
    supabase,
    leagueId: ctx.league.id,
    actorUserId: ctx.userId,
    actionType: newStatus === 'open' && matchday.status === 'locked'
      ? 'matchday_reopen'
      : 'matchday_status_change',
    entityType: 'matchday',
    entityId: matchdayId,
    beforeJson: { status: matchday.status },
    afterJson: { status: newStatus, note },
  })

  // When closing a matchday, auto-open the next draft matchday (by matchday_number)
  // — but only if no other matchday is already open.
  if (newStatus === 'closed') {
    const { data: currentMatchday } = await supabase
      .from('matchdays')
      .select('matchday_number')
      .eq('id', matchdayId)
      .single()

    if (currentMatchday?.matchday_number != null) {
      // Check whether another open matchday already exists
      const { data: existingOpen } = await supabase
        .from('matchdays')
        .select('id')
        .eq('league_id', ctx.league.id)
        .eq('status', 'open')
        .neq('id', matchdayId)
        .limit(1)
        .maybeSingle()

      if (!existingOpen) {
        const { data: nextMatchday } = await supabase
          .from('matchdays')
          .select('id')
          .eq('league_id', ctx.league.id)
          .eq('status', 'draft')
          .gt('matchday_number', currentMatchday.matchday_number)
          .order('matchday_number', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextMatchday) {
          await supabase
            .from('matchdays')
            .update({ status: 'open' })
            .eq('id', nextMatchday.id)

          await supabase.from('matchday_status_log').insert({
            matchday_id: nextMatchday.id,
            old_status: 'draft',
            new_status: 'open',
            changed_by: ctx.userId,
            note: `Apertura automatica alla chiusura della giornata precedente`,
          })

          revalidatePath('/matchdays')
        }
      }
    }
  }

  // When the matchday is closed (was: locked), write a lineup_lock audit entry for every
  // team that has an active submission pointer. This records exactly which
  // submission version was frozen at close time, without touching the
  // append-only lineup_submissions rows.
  if (newStatus === 'closed') {
    const { data: pointers } = await supabase
      .from('lineup_current_pointers')
      .select('team_id, submission_id, lineup_submissions(submission_number, status)')
      .eq('matchday_id', matchdayId)

    for (const pointer of pointers ?? []) {
      const sub = pointer.lineup_submissions as unknown as {
        submission_number: number
        status: string
      } | null
      await writeAuditLog({
        supabase,
        leagueId: ctx.league.id,
        actorUserId: ctx.userId,
        actionType: 'lineup_lock',
        entityType: 'lineup_submission',
        entityId: pointer.submission_id,
        afterJson: {
          team_id: pointer.team_id,
          matchday_id: matchdayId,
          submission_number: sub?.submission_number ?? null,
          lineup_status: sub?.status ?? null,
          locked_by_matchday_transition: true,
        },
      })
    }
  }

  revalidatePath(`/matchdays/${matchdayId}`)
  revalidatePath('/matchdays')
  revalidatePath('/dashboard')

  return { error: null }
}

// ---------------------------------------------------------------------------
// Generate matchdays from competition rounds (campionato only)
// ---------------------------------------------------------------------------

export async function generateMatchdaysAction(
  competitionId: string
): Promise<{ error?: string; created?: number }> {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // Verify competition belongs to this league
  const { data: competition } = await supabase
    .from('competitions')
    .select('id, type, status, league_id')
    .eq('id', competitionId)
    .eq('league_id', ctx.league.id)
    .single()

  if (!competition) return { error: 'Competizione non trovata.' }
  if (competition.type !== 'campionato') return { error: 'Solo le competizioni di tipo Campionato supportano la generazione automatica delle giornate.' }

  // Get all competition rounds
  const { data: rounds, error: roundsError } = await supabase
    .from('competition_rounds')
    .select('id, round_number, name, matchday_id')
    .eq('competition_id', competitionId)
    .order('round_number', { ascending: true })

  if (roundsError || !rounds) return { error: 'Impossibile recuperare i turni della competizione.' }

  let created = 0

  for (const round of rounds) {
    // Skip if already has a matchday
    if (round.matchday_id) continue

    // Insert the matchday
    const { data: matchday, error: insertError } = await supabase
      .from('matchdays')
      .insert({
        league_id: ctx.league.id,
        name: round.name,
        round_number: round.round_number,
        matchday_number: round.round_number,
        opens_at: null,
        locks_at: null,
        status: 'draft',
        is_frozen: false,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (insertError || !matchday) {
      // ON CONFLICT DO NOTHING equivalent: skip duplicates silently
      continue
    }

    // Link the competition round to the new matchday
    await supabase
      .from('competition_rounds')
      .update({ matchday_id: matchday.id })
      .eq('id', round.id)

    await writeAuditLog({
      supabase,
      leagueId: ctx.league.id,
      actorUserId: ctx.userId,
      actionType: 'matchday_create',
      entityType: 'matchday',
      entityId: matchday.id,
      afterJson: {
        name: round.name,
        round_number: round.round_number,
        competition_id: competitionId,
        competition_round_id: round.id,
      },
    })

    created++
  }

  revalidatePath('/matchdays')
  revalidatePath(`/competitions/${competitionId}`)

  return { created }
}
