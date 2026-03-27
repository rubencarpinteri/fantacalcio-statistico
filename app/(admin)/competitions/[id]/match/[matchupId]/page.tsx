import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueContext } from '@/lib/league'

type BonusMalusItem = { label: string; total: number; quantity: number; points_each: number }

type StarterEntry = {
  name: string; player_id: string | null
  fantavoto: number | null; voto_base: number | null
  bonus_malus: BonusMalusItem[] | null
  is_nv: boolean; subbed_by: string | null
}
type BenchEntry = {
  name: string; player_id: string | null
  fantavoto: number | null; subbed_in_for: string | null
}

function BonusMalusCell({ bm }: { bm: BonusMalusItem[] | null }) {
  if (!bm || bm.length === 0) return <span className="text-[#55556a]">—</span>
  const items = bm.filter(item => item.total !== 0)
  if (items.length === 0) return <span className="text-[#55556a]">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={i}
          className={`rounded px-1 py-0.5 text-xs font-medium ${item.total > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
        >
          {item.label} {item.total > 0 ? '+' : ''}{item.total}
        </span>
      ))}
    </span>
  )
}

function TeamLineup({
  teamName, starters, bench, total,
}: {
  teamName: string
  starters: StarterEntry[]
  bench: BenchEntry[]
  total: number | null
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">{teamName}</h2>
        {total !== null && (
          <span className="font-mono text-lg font-bold text-indigo-300">{Number(total).toFixed(2)}</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#2e2e42]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2e2e42] bg-[#0a0a0f]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[#55556a]">Giocatore</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[#55556a]">Base</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[#55556a]">B/M</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[#55556a]">FV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e2e]">
            {starters.map((p, i) => (
              <tr key={i} className={p.is_nv ? 'opacity-50' : 'hover:bg-[#0f0f1a]'}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {p.is_nv && <span className="rounded bg-red-500/20 px-1 text-xs text-red-400">NV</span>}
                    <span className={p.is_nv ? 'text-[#55556a] line-through' : 'text-white'}>{p.name}</span>
                    {p.subbed_by && (
                      <span className="text-xs text-emerald-400">↑ {p.subbed_by}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[#8888aa]">
                  {p.voto_base != null ? p.voto_base.toFixed(2) : '—'}
                </td>
                <td className="px-3 py-2">
                  <BonusMalusCell bm={p.bonus_malus} />
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {p.fantavoto != null
                    ? <span className="text-white">{p.fantavoto.toFixed(2)}</span>
                    : <span className="text-[#55556a]">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bench.filter(b => !b.subbed_in_for).length > 0 && (
        <div className="mt-2">
          <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wider text-[#55556a]">Panchina</p>
          <div className="overflow-hidden rounded-lg border border-[#1e1e2e]">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[#1a1a24]">
                {bench.filter(b => !b.subbed_in_for).map((b, i) => (
                  <tr key={i} className="opacity-60 hover:opacity-100">
                    <td className="px-3 py-1.5 text-[#8888aa]">{b.name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs text-[#55556a]">
                      {b.fantavoto != null ? b.fantavoto.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchupId: string }>
}) {
  const ctx = await requireLeagueContext()
  const { id: competitionId, matchupId } = await params
  const supabase = await createClient()

  const { data: matchup } = await supabase
    .from('competition_matchups')
    .select('*')
    .eq('id', matchupId)
    .eq('competition_id', competitionId)
    .single()

  if (!matchup) notFound()

  // Get matchday_id from competition_rounds via round_number
  const { data: round } = await supabase
    .from('competition_rounds')
    .select('matchday_id, name')
    .eq('competition_id', competitionId)
    .eq('round_number', matchup.round_number)
    .maybeSingle()

  // Get team names
  const { data: teams } = await supabase
    .from('fantasy_teams')
    .select('id, name')
    .in('id', [matchup.home_team_id, matchup.away_team_id])

  const homeTeam = teams?.find(t => t.id === matchup.home_team_id)
  const awayTeam = teams?.find(t => t.id === matchup.away_team_id)

  // Get lineups from matchday_lineups (if available)
  let homeLineup: { starters: StarterEntry[]; bench: BenchEntry[] } | null = null
  let awayLineup: { starters: StarterEntry[]; bench: BenchEntry[] } | null = null

  if (round?.matchday_id) {
    const { data: lineups } = await supabase
      .from('matchday_lineups')
      .select('team_id, starters, bench')
      .eq('matchday_id', round.matchday_id)
      .in('team_id', [matchup.home_team_id, matchup.away_team_id])

    for (const l of lineups ?? []) {
      const lineup = {
        starters: l.starters as unknown as StarterEntry[],
        bench: l.bench as unknown as BenchEntry[],
      }
      if (l.team_id === matchup.home_team_id) homeLineup = lineup
      else awayLineup = lineup
    }
  }

  const resultLabel = matchup.result === '1' ? `${homeTeam?.name ?? '?'} vince`
    : matchup.result === '2' ? `${awayTeam?.name ?? '?'} vince`
    : matchup.result === 'X' ? 'Pareggio'
    : 'Non calcolato'

  return (
    <div className="space-y-6">
      <div>
        <a href={`/competitions/${competitionId}`} className="text-sm text-[#55556a] hover:text-indigo-400">
          ← {round?.name ?? `Giornata ${matchup.round_number}`}
        </a>
        <h1 className="mt-1 text-xl font-bold text-white">
          {homeTeam?.name ?? '?'} — {awayTeam?.name ?? '?'}
        </h1>
        <div className="mt-1 flex items-center gap-4">
          <span className="font-mono text-2xl font-bold text-white">
            {matchup.home_fantavoto != null ? Number(matchup.home_fantavoto).toFixed(2) : '—'}
            <span className="mx-2 text-[#55556a]">vs</span>
            {matchup.away_fantavoto != null ? Number(matchup.away_fantavoto).toFixed(2) : '—'}
          </span>
          {matchup.result && (
            <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${
              matchup.result === '1' ? 'bg-emerald-500/15 text-emerald-400' :
              matchup.result === '2' ? 'bg-red-500/15 text-red-400' :
              'bg-amber-500/15 text-amber-400'
            }`}>{resultLabel}</span>
          )}
        </div>
      </div>

      {!homeLineup && !awayLineup ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          ⚠ Dati formazione non disponibili. Reimporta l&apos;xlsx Leghe per questa giornata per vedere le formazioni.
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {homeLineup
            ? <TeamLineup teamName={homeTeam?.name ?? '?'} starters={homeLineup.starters} bench={homeLineup.bench} total={matchup.home_fantavoto != null ? Number(matchup.home_fantavoto) : null} />
            : <div className="flex-1 text-sm text-[#55556a]">Formazione non disponibile</div>
          }
          <div className="hidden lg:block w-px bg-[#2e2e42]" />
          {awayLineup
            ? <TeamLineup teamName={awayTeam?.name ?? '?'} starters={awayLineup.starters} bench={awayLineup.bench} total={matchup.away_fantavoto != null ? Number(matchup.away_fantavoto) : null} />
            : <div className="flex-1 text-sm text-[#55556a]">Formazione non disponibile</div>
          }
        </div>
      )}
    </div>
  )
}
