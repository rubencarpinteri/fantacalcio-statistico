'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/league'
import { fmCompetitionConfigSchema } from '@/domain/fantamondiale/config/schema'
import type { Json } from '@/types/database.types'

export async function saveConfigAction(fd: FormData) {
  await requireSuperAdmin()
  const supabase = await createClient()

  const competitionId = fd.get('competition_id') as string
  const rawJson = fd.get('config_json') as string

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('JSON non valido')
  }

  const validated = fmCompetitionConfigSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'))
  }

  await supabase
    .from('fm_competition_config')
    .upsert(
      { competition_id: competitionId, config: validated.data as unknown as Json },
      { onConflict: 'competition_id' }
    )

  revalidatePath(`/fantamondiale/${competitionId}/config`)
}
