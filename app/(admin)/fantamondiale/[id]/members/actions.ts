'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/fantamondiale/server'

export async function addMemberAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const competitionId = fd.get('competition_id') as string
  const userId = fd.get('user_id') as string
  const teamName = (fd.get('team_name') as string).trim()

  if (!userId || !teamName) throw new Error('Dati mancanti')

  const { error } = await supabase.from('fm_fantasy_team').insert({
    competition_id: competitionId,
    manager_id: userId,
    name: teamName,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/fantamondiale/${competitionId}/members`)
}

export async function removeMemberAction(teamId: string, competitionId: string) {
  await requireSuperAdmin()
  const supabase = await createClient()
  await supabase.from('fm_fantasy_team').delete().eq('id', teamId)
  revalidatePath(`/fantamondiale/${competitionId}/members`)
}
