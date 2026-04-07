import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'

/**
 * GET /api/ratings/fixtures?matchdayId=...
 *
 * Returns the sofascore_event_ids configured for a matchday.
 * Used by client components (QuickFetchAndCalculateButton) that need to
 * browser-fetch SofaScore data without knowing the fixture list up front.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireLeagueAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const matchdayId = req.nextUrl.searchParams.get('matchdayId')
  if (!matchdayId) {
    return NextResponse.json({ error: 'matchdayId required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: fixtures } = await supabase
    .from('matchday_fixtures')
    .select('sofascore_event_id')
    .eq('matchday_id', matchdayId)

  const sofascoreEventIds = (fixtures ?? [])
    .map((f) => f.sofascore_event_id)
    .filter((id): id is number => id != null)

  return NextResponse.json({ sofascore_event_ids: sofascoreEventIds })
}
