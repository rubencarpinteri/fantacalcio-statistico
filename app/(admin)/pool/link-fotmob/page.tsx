import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { LinkFotmobClient } from './LinkFotmobClient'
import type { UnmatchedEntry, LeaguePlayerOption } from './LinkFotmobClient'

export const metadata = { title: 'Collega giocatori FotMob' }

export default async function LinkFotmobPage() {
  const ctx = await requireLeagueAdmin()
  const supabase = await createClient()

  // All matchdays for this league
  const { data: matchdays } = await supabase
    .from('matchdays')
    .select('id, name')
    .eq('league_id', ctx.league.id)

  const matchdayNameMap = new Map((matchdays ?? []).map(m => [m.id, m.name]))
  const matchdayIds = (matchdays ?? []).map(m => m.id)

  // Unmatched FotMob players across all matchdays of this league
  const { data: rawUnmatched } = matchdayIds.length > 0
    ? await supabase
        .from('fotmob_unmatched_players')
        .select('matchday_id, fotmob_player_id, fotmob_name, fotmob_team')
        .in('matchday_id', matchdayIds)
        .order('fotmob_name')
    : { data: [] }

  // Deduplicate by fotmob_player_id — keep latest matchday occurrence
  const seen = new Map<number, UnmatchedEntry>()
  for (const row of rawUnmatched ?? []) {
    seen.set(row.fotmob_player_id, {
      matchday_id: row.matchday_id,
      matchday_name: matchdayNameMap.get(row.matchday_id) ?? row.matchday_id,
      fotmob_player_id: row.fotmob_player_id,
      fotmob_name: row.fotmob_name,
      fotmob_team: row.fotmob_team,
    })
  }
  const unmatched: UnmatchedEntry[] = [...seen.values()].sort((a, b) =>
    a.fotmob_name.localeCompare(b.fotmob_name)
  )

  // All active league players for search
  const { data: rawPlayers } = await supabase
    .from('league_players')
    .select('id, full_name, club, rating_class, fotmob_player_id')
    .eq('league_id', ctx.league.id)
    .eq('is_active', true)
    .order('full_name')

  const leaguePlayers: LeaguePlayerOption[] = (rawPlayers ?? []).map(p => ({
    id: p.id,
    full_name: p.full_name,
    club: p.club,
    rating_class: p.rating_class,
    fotmob_player_id: p.fotmob_player_id ?? null,
  }))

  const linkedCount = leaguePlayers.filter(p => p.fotmob_player_id != null).length

  return (
    <div className="space-y-6">
      <div>
        <a href="/pool" className="text-sm text-[#55556a] hover:text-indigo-400">← Pool giocatori</a>
        <h1 className="mt-1 text-xl font-bold text-white">Collega giocatori FotMob</h1>
        <p className="mt-1 text-sm text-[#55556a]">
          Associa i giocatori non riconosciuti da FotMob ai tuoi giocatori in rosa.
          Una volta collegati, il matching avverrà tramite ID numerico.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="rounded border border-[#3a3a52] bg-[#16162a] px-4 py-3">
          <div className="text-2xl font-bold text-white">{unmatched.length}</div>
          <div className="text-xs text-[#55556a]">non abbinati</div>
        </div>
        <div className="rounded border border-[#3a3a52] bg-[#16162a] px-4 py-3">
          <div className="text-2xl font-bold text-white">{linkedCount}</div>
          <div className="text-xs text-[#55556a]">giocatori con ID FotMob</div>
        </div>
        <div className="rounded border border-[#3a3a52] bg-[#16162a] px-4 py-3">
          <div className="text-2xl font-bold text-white">{leaguePlayers.length - linkedCount}</div>
          <div className="text-xs text-[#55556a]">ancora senza ID</div>
        </div>
      </div>

      {unmatched.length > 0 && (
        <p className="text-xs text-[#55556a]">
          Cerca il giocatore corrispondente e clicca <strong className="text-white">Collega</strong>.
          Se il giocatore non è in rosa (es. avversario), clicca <strong className="text-white">Ignora</strong>.
        </p>
      )}

      <LinkFotmobClient unmatched={unmatched} leaguePlayers={leaguePlayers} />
    </div>
  )
}
