import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/fantamondiale/server'
import { runRoundEngine } from '@/domain/fantamondiale/engine/index'

export type CalculateRoundResponse = {
  teamsScored: number
  playerScoresWritten: number
  coachScoresWritten: number
  brMatchupsWritten: number
  errors: string[]
}

const empty: CalculateRoundResponse = {
  teamsScored: 0,
  playerScoresWritten: 0,
  coachScoresWritten: 0,
  brMatchupsWritten: 0,
  errors: [],
}

export async function POST(req: NextRequest): Promise<NextResponse<CalculateRoundResponse>> {
  try {
    await requireSuperAdmin()
  } catch {
    return NextResponse.json({ ...empty, errors: ['Unauthorized'] }, { status: 401 })
  }

  const supabase = await createClient()
  const body = (await req.json()) as { roundId?: string }
  const { roundId } = body

  if (!roundId) {
    return NextResponse.json({ ...empty, errors: ['roundId required'] }, { status: 400 })
  }

  try {
    const result = await runRoundEngine(roundId, supabase)

    await supabase.from('fm_audit_log').insert({
      competition_id: null,
      action: 'score_calculate',
      entity_type: 'fm_scoring_round',
      entity_id: roundId,
      payload: { ...result, errors: [] },
    })

    return NextResponse.json({ ...result, errors: [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ...empty, errors: [message] }, { status: 500 })
  }
}
