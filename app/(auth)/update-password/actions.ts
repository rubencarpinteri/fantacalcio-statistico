'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const schema = z.object({
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri'),
  confirm:  z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Le password non coincidono',
  path: ['confirm'],
})

export interface UpdatePasswordState {
  error: string | null
  success: boolean
}

export async function updatePasswordAction(
  _prev: UpdatePasswordState,
  formData: FormData
): Promise<UpdatePasswordState> {
  const parsed = schema.safeParse({
    password: formData.get('password'),
    confirm:  formData.get('confirm'),
  })

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Dati non validi', success: false }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { error: 'Impossibile aggiornare la password. Riprova.', success: false }
  }

  redirect('/dashboard')
}
