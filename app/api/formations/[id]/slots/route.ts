import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: formationId } = await params

  try {
    const ctx = await requireLeagueContext()
    const supabase = await createClient()

    // Verify formation belongs to the user's league
    const { data: formation } = await supabase
      .from('formations')
      .select('id, league_id')
      .eq('id', formationId)
      .eq('league_id', ctx.league.id)
      .single()

    if (!formation) {
      return NextResponse.json({ error: 'Formation not found' }, { status: 404 })
    }

    const { data: slots, error } = await supabase
      .from('formation_slots')
      .select('id, formation_id, slot_name, slot_order, allowed_mantra_roles, is_bench, bench_order')
      .eq('formation_id', formationId)
      .order('slot_order')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(slots ?? [])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
