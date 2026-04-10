'use client'

import { useState } from 'react'
import { MatchdayStatusBadge } from '@/components/ui/badge'

const FADE_SLIDE_CSS = `
@keyframes calRoundIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`

export type MatchupData = {
  id: string
  homeTeamId: string
  homeTeamName: string
  awayTeamId: string
  awayTeamName: string
  result: '1' | 'X' | '2' | null
  publishedHomeScore: number | null
  publishedAwayScore: number | null
  partialHomeScore: number | null
  partialAwayScore: number | null
  isDraftScore: boolean
  matchdayId: string | null
}

export type RoundData = {
  roundNumber: number
  roundName: string
  matchdayId: string | null
  matchdayStatus: string | null
  isCurrentRound: boolean
  matchups: MatchupData[]
}

interface Props {
  rounds: RoundData[]
  defaultRound: number
  myTeamId: string | null
  competitionId: string
}

export function CalendarioClient({ rounds, defaultRound, myTeamId, competitionId }: Props) {
  const [selectedRound, setSelectedRound] = useState(defaultRound)

  const round = rounds.find((r) => r.roundNumber === selectedRound) ?? rounds[0]

  if (!round) {
    return (
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] px-6 py-12 text-center text-sm text-[#55556a]">
        Nessun turno disponibile.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <style>{FADE_SLIDE_CSS}</style>
      {/* Round selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-widest text-[#55556a]">
          Turno
        </label>
        <div className="relative">
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
            className="appearance-none rounded-lg border border-[#2e2e42] bg-[#111120] pl-3 pr-8 py-1.5 text-sm text-white focus:border-indigo-500/60 focus:outline-none cursor-pointer hover:border-[#3e3e52] transition-colors"
          >
            {rounds.map((r) => (
              <option key={r.roundNumber} value={r.roundNumber}>
                {r.roundName}
                {r.isCurrentRound ? ' ← corrente' : ''}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#55556a] text-xs">
            ▾
          </span>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5">
          {round.matchdayStatus && (
            <MatchdayStatusBadge status={round.matchdayStatus} />
          )}
          {round.isCurrentRound && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-500/15 text-indigo-400">
              In corso
            </span>
          )}
        </div>
      </div>

      {/* Matchups for selected round */}
      <div key={selectedRound} style={{ animation: 'calRoundIn 200ms ease' }}>
      <div className="rounded-xl border border-[#2e2e42] bg-[#0d0d1a] overflow-hidden">
        {round.matchups.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[#55556a]">
            Nessun incontro per questo turno.
          </div>
        ) : (
          <div className="divide-y divide-[#1e1e2e]">
            {round.matchups.map((m) => {
              const isHomeMyTeam = m.homeTeamId === myTeamId
              const isAwayMyTeam = m.awayTeamId === myTeamId

              // Determine which scores to display
              const hasPublished = m.result !== null
              const hasPartial = !hasPublished && (m.partialHomeScore !== null || m.partialAwayScore !== null)

              const homeScore = hasPublished
                ? m.publishedHomeScore
                : hasPartial
                ? m.partialHomeScore
                : null
              const awayScore = hasPublished
                ? m.publishedAwayScore
                : hasPartial
                ? m.partialAwayScore
                : null

              const homeWins = homeScore !== null && awayScore !== null && homeScore > awayScore
              const awayWins = homeScore !== null && awayScore !== null && awayScore > homeScore

              const href = m.matchdayId
                ? `/matchdays/${m.matchdayId}/all-lineups`
                : `/competitions/${competitionId}/match/${m.id}`

              return (
                <a
                  key={m.id}
                  href={href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#131320] transition-colors"
                >
                  {/* Home */}
                  <div className="flex-1 min-w-0 overflow-hidden text-right">
                    <span className={`block truncate text-sm font-semibold ${
                      homeWins ? 'text-white'
                        : awayWins ? 'text-[#3a3a52]'
                        : isHomeMyTeam ? 'text-indigo-200'
                        : 'text-[#c0c0d8]'
                    }`}>
                      {m.homeTeamName}
                    </span>
                  </div>

                  {/* Score */}
                  <div className="shrink-0 w-44 flex items-center justify-center gap-2 tabular-nums">
                    <span className={`text-base font-bold ${homeWins ? 'text-white' : 'text-[#55556a]'}`}>
                      {homeScore !== null ? homeScore.toFixed(1) : '—'}
                    </span>
                    {hasPublished && m.result ? (
                      <ResultBadge result={m.result as '1' | 'X' | '2'} />
                    ) : (
                      <span className="text-[#3a3a52] text-sm font-normal">–</span>
                    )}
                    <span className={`text-base font-bold ${awayWins ? 'text-white' : 'text-[#55556a]'}`}>
                      {awayScore !== null ? awayScore.toFixed(1) : '—'}
                    </span>
                    {hasPartial && m.isDraftScore && (
                      <span className="text-[9px] text-amber-500/50">~</span>
                    )}
                  </div>

                  {/* Away */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className={`block truncate text-sm font-semibold ${
                      awayWins ? 'text-white'
                        : homeWins ? 'text-[#3a3a52]'
                        : isAwayMyTeam ? 'text-indigo-200'
                        : 'text-[#c0c0d8]'
                    }`}>
                      {m.awayTeamName}
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* Draft footnote */}
        {round.matchups.some((m) => !m.result && m.isDraftScore && m.partialHomeScore !== null) && (
          <div className="border-t border-[#1e1e2e] px-4 py-2">
            <p className="text-[11px] text-amber-500/60">
              ~ punteggi parziali (calcolo non ancora pubblicato)
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function ResultBadge({ result }: { result: '1' | 'X' | '2' }) {
  const color =
    result === '1'
      ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      : result === 'X'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  return (
    <span className={`rounded border px-1 py-0.5 text-[10px] font-bold ${color}`}>
      {result}
    </span>
  )
}
