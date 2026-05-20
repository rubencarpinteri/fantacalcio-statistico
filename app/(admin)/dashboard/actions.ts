'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { Route } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function enrollSelfInFMAction(competitionId: string, fd: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const teamName = ((fd.get('team_name') as string | null) ?? '').trim()
  if (teamName.length < 2) {
    throw new Error('Il nome squadra deve avere almeno 2 caratteri')
  }
  if (teamName.length > 80) {
    throw new Error('Il nome squadra è troppo lungo (max 80 caratteri)')
  }

  const { data: comp } = await supabase
    .from('fm_competition')
    .select('id, status')
    .eq('id', competitionId)
    .single()

  if (!comp) throw new Error('Competizione non trovata')
  if (comp.status === 'archived' || comp.status === 'completed') {
    throw new Error('Le iscrizioni a questa competizione sono chiuse')
  }

  const { data: existing } = await supabase
    .from('fm_fantasy_team')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('manager_id', user.id)
    .maybeSingle()

  if (existing) {
    redirect(`/fantamondiale/${competitionId}` as Route)
  }

  const { error } = await supabase.from('fm_fantasy_team').insert({
    competition_id: competitionId,
    manager_id: user.id,
    name: teamName,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  revalidatePath(`/fantamondiale/${competitionId}/members`)
  redirect(`/fantamondiale/${competitionId}` as Route)
}
