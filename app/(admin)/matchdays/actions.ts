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
// The DB stores the transition log; there is no status machine in the schema
// itself (by design — admin can override with confirmation).
const ALLOWED_TRANSITIONS: Record<MatchdayStatus, MatchdayStatus[]> = {
  draft:     ['open'],
  open:      ['locked'],
  locked:    ['scoring', 'open'],    // 'open' = reopen
  scoring:   ['published', 'locked'],
  published: ['archived', 'scoring'],
  archived:  [],
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

  // When the matchday is locked, write a lineup_lock audit entry for every
  // team that has an active submission pointer. This records exactly which
  // submission version was frozen at lock time, without touching the
  // append-only lineup_submissions rows.
  if (newStatus === 'locked') {
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
