'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function resolveLeagueByToken(token: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('invite_token', token)
    .maybeSingle()
  return data
}

async function latestFMCompetition() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fm_competition')
    .select('id, status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function joinLeagueAndFM(opts: {
  userId: string
  leagueId: string
  teamName: string
}) {
  const supabase = await createClient()
  const { userId, leagueId, teamName } = opts

  // 1. League membership (idempotent: skip if already a member)
  const { data: existingLU } = await supabase
    .from('league_users')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existingLU) {
    const { error: luError } = await supabase
      .from('league_users')
      .insert({ league_id: leagueId, user_id: userId, role: 'manager' })
    if (luError) throw new Error(`league_users: ${luError.message}`)
  }

  // 2. Serie A fantasy team (create only if the user has none in this league)
  const { data: existingFT } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('league_id', leagueId)
    .eq('manager_id', userId)
    .maybeSingle()

  if (!existingFT) {
    const { error: ftError } = await supabase
      .from('fantasy_teams')
      .insert({ league_id: leagueId, manager_id: userId, name: teamName })
    if (ftError) throw new Error(`fantasy_teams: ${ftError.message}`)
  }

  // 3. FantaMondiale auto-enrollment (only if a non-archived comp exists and
  //    the user isn't already enrolled in it).
  const comp = await latestFMCompetition()
  if (comp && comp.status !== 'archived' && comp.status !== 'completed') {
    const { data: existingFM } = await supabase
      .from('fm_fantasy_team')
      .select('id')
      .eq('competition_id', comp.id)
      .eq('manager_id', userId)
      .maybeSingle()

    if (!existingFM) {
      const { error: fmError } = await supabase
        .from('fm_fantasy_team')
        .insert({ competition_id: comp.id, manager_id: userId, name: teamName })
      if (fmError) throw new Error(`fm_fantasy_team: ${fmError.message}`)
    }
  }
}

// ─── Signup + join (unauthenticated user) ────────────────────────────────────

const signupSchema = z.object({
  email:     z.string().email('Email non valida'),
  password:  z.string().min(6, 'Password troppo corta (min 6 caratteri)'),
  full_name: z.string().min(2, 'Il nome deve avere almeno 2 caratteri').max(60),
  username:  z.string()
    .min(2, 'Lo username deve avere almeno 2 caratteri')
    .max(30)
    .regex(/^[a-z0-9._-]+$/, 'Solo lettere minuscole, numeri, punti, trattini e underscore'),
})

export interface SignupAndJoinState {
  error: string | null
  awaitingEmail: boolean
}

export async function signUpAndJoinAction(
  token: string,
  _prev: SignupAndJoinState,
  formData: FormData
): Promise<SignupAndJoinState> {
  const parsed = signupSchema.safeParse({
    email:     formData.get('email'),
    password:  formData.get('password'),
    full_name: formData.get('full_name'),
    username:  formData.get('username'),
  })
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', awaitingEmail: false }
  }
  const { email, password, full_name, username } = parsed.data

  const league = await resolveLeagueByToken(token)
  if (!league) {
    return { error: 'Link di invito non valido o revocato.', awaitingEmail: false }
  }

  const supabase = await createClient()

  // Username uniqueness pre-check (same as the admin invite flow)
  const { data: existingUsername } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existingUsername) {
    return { error: `Lo username "${username}" è già in uso.`, awaitingEmail: false }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantacalcio-statistico.vercel.app'

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name },
      emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard`,
    },
  })

  if (error || !data.user) {
    const msg = error?.message ?? 'Errore sconosciuto'
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
      return { error: 'Questa email è già registrata. Accedi e riapri il link di invito.', awaitingEmail: false }
    }
    return { error: `Iscrizione fallita: ${msg}`, awaitingEmail: false }
  }

  // Profile is created by the on_auth_user_created trigger from raw_user_meta_data.
  // Pre-attach the user to the league + FM so that when they confirm their email
  // they land already enrolled.
  try {
    await joinLeagueAndFM({
      userId: data.user.id,
      leagueId: league.id,
      teamName: full_name,
    })
  } catch (err) {
    return {
      error: `Account creato ma iscrizione lega fallita: ${err instanceof Error ? err.message : 'errore'}. Contatta l'admin.`,
      awaitingEmail: false,
    }
  }

  // Email confirmation is on by default in Supabase: signUp returns a user
  // but no session. If confirmation is off, a session is set immediately —
  // in that case we can redirect straight to the dashboard.
  if (data.session) {
    redirect('/dashboard' as Route)
  }

  return { error: null, awaitingEmail: true }
}

// ─── Accept (authenticated user) ─────────────────────────────────────────────

export async function acceptJoinAction(token: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const league = await resolveLeagueByToken(token)
  if (!league) throw new Error('Link di invito non valido o revocato.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .single()

  const teamName =
    (profile?.full_name && profile.full_name.trim()) ||
    profile?.username ||
    'Squadra'

  await joinLeagueAndFM({
    userId: user.id,
    leagueId: league.id,
    teamName,
  })

  redirect('/dashboard' as Route)
}
