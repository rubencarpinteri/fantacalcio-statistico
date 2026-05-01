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
  /** Goal-converted score (from competition_fixtures) — primary readout. */
  homeGoals: number | null
  awayGoals: number | null
  /** Final fantavoto totals (from competition_matchups) — caption. */
  publishedHomeScore: number | null
  publishedAwayScore: number | null
  /** Live partial fantavoto (only on the current round before publish). */
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
      <div className="rounded-xl border border-hairline bg-glass-1 backdrop-blur-2xl px-6 py-12 text-center text-sm text-ink-4">
        Nessun turno disponibile.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <style>{FADE_SLIDE_CSS}</style>
      {/* Round selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium uppercase tracking-widest text-ink-4">
          Turno
        </label>
        <div className="relative">
          <select
            value={selectedRound}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
            className="appearance-none rounded-lg border border-hairline bg-glass-2 pl-3 pr-8 py-1.5 text-sm text-ink-1 focus:border-indigo-400/60/60 focus:outline-none cursor-pointer hover:border-hairline-strong transition-colors"
          >
            {rounds.map((r) => (
              <option key={r.roundNumber} value={r.roundNumber}>
                {r.roundName}
                {r.isCurrentRound ? ' ← corrente' : ''}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 text-xs">
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
        <div className="rounded-xl border border-hairline bg-glass-1 overflow-hidden">
          {round.matchups.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-ink-4">
              Nessun incontro per questo turno.
            </div>
          ) : (
            <div>
              {round.matchups.map((m, idx) => (
                <MatchupRow
                  key={m.id}
                  matchup={m}
                  myTeamId={myTeamId}
                  competitionId={competitionId}
                  isLast={idx === round.matchups.length - 1}
                />
              ))}
            </div>
          )}

          {/* Draft footnote */}
          {round.matchups.some((m) => !m.result && m.isDraftScore && m.partialHomeScore !== null) && (
            <div className="border-t border-hairline px-4 py-2.5">
              <p className="text-[10px] text-amber-500/50">
                ~ punteggi parziali (calcolo non ancora pubblicato)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MatchupRow({
  matchup: m,
  myTeamId,
  competitionId,
  isLast,
}: {
  matchup: MatchupData
  myTeamId: string | null
  competitionId: string
  isLast: boolean
}) {
  const isHomeMyTeam = m.homeTeamId === myTeamId
  const isAwayMyTeam = m.awayTeamId === myTeamId

  const hasPublished = m.result !== null
  const hasGoals = hasPublished && m.homeGoals !== null && m.awayGoals !== null
  const hasPartial = !hasPublished && (m.partialHomeScore !== null || m.partialAwayScore !== null)

  // Winner determination (goals first, then fantavoto)
  const homeWins = hasGoals
    ? (m.homeGoals as number) > (m.awayGoals as number)
    : hasPublished
    ? m.publishedHomeScore !== null && m.publishedAwayScore !== null && m.publishedHomeScore > m.publishedAwayScore
    : hasPartial
    ? m.partialHomeScore !== null && m.partialAwayScore !== null && m.partialHomeScore > m.partialAwayScore
    : false
  const awayWins = hasGoals
    ? (m.awayGoals as number) > (m.homeGoals as number)
    : hasPublished
    ? m.publishedHomeScore !== null && m.publishedAwayScore !== null && m.publishedAwayScore > m.publishedHomeScore
    : hasPartial
    ? m.partialHomeScore !== null && m.partialAwayScore !== null && m.partialAwayScore > m.partialHomeScore
    : false

  const homeTone =
    awayWins ? 'text-ink-5' : isHomeMyTeam ? 'text-indigo-200' : 'text-ink-1'
  const awayTone =
    homeWins ? 'text-ink-5' : isAwayMyTeam ? 'text-indigo-200' : 'text-ink-1'
  const homeNum = awayWins ? 'text-ink-5' : 'text-ink-1'
  const awayNum = homeWins ? 'text-ink-5' : 'text-ink-1'

  const href = m.matchdayId
    ? `/matchdays/${m.matchdayId}/all-lineups`
    : `/competitions/${competitionId}/match/${m.id}`

  return (
    <a
      href={href}
      className={`grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-4 hover:bg-glass-1 transition-colors ${
        isLast ? '' : 'border-b border-hairline'
      }`}
    >
      <span className={`truncate text-right text-[14px] font-medium tracking-tight ${homeTone}`}>
        {m.homeTeamName}
      </span>

      <div className="flex flex-col items-center min-w-[6rem] tabular-nums">
        {hasGoals ? (
          <>
            <div className="flex items-baseline">
              <span className={`w-7 text-right text-2xl font-light leading-none ${homeNum}`}>{m.homeGoals}</span>
              <span className="px-2 text-xl font-thin text-ink-5 leading-none select-none">–</span>
              <span className={`w-7 text-left text-2xl font-light leading-none ${awayNum}`}>{m.awayGoals}</span>
            </div>
            {m.publishedHomeScore !== null && m.publishedAwayScore !== null && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-4">
                <span>{m.publishedHomeScore.toFixed(1)}</span>
                <span className="text-ink-5">–</span>
                <span>{m.publishedAwayScore.toFixed(1)}</span>
              </div>
            )}
          </>
        ) : hasPublished ? (
          <div className="flex items-baseline">
            <span className={`w-10 text-right text-[15px] font-medium ${homeNum}`}>
              {m.publishedHomeScore !== null ? m.publishedHomeScore.toFixed(1) : '—'}
            </span>
            <span className="px-1.5 text-sm font-thin text-ink-5">–</span>
            <span className={`w-10 text-left text-[15px] font-medium ${awayNum}`}>
              {m.publishedAwayScore !== null ? m.publishedAwayScore.toFixed(1) : '—'}
            </span>
          </div>
        ) : hasPartial ? (
          <div className="flex items-baseline">
            <span className={`w-10 text-right text-[15px] font-medium ${homeNum}`}>
              {m.partialHomeScore !== null ? m.partialHomeScore.toFixed(1) : '—'}
            </span>
            <span className="px-1.5 text-sm font-thin text-ink-5">–</span>
            <span className={`w-10 text-left text-[15px] font-medium ${awayNum}`}>
              {m.partialAwayScore !== null ? m.partialAwayScore.toFixed(1) : '—'}
            </span>
            {m.isDraftScore && <span className="ml-1 text-[9px] text-amber-500/50">~</span>}
          </div>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-ink-5">vs</span>
        )}
      </div>

      <span className={`truncate text-left text-[14px] font-medium tracking-tight ${awayTone}`}>
        {m.awayTeamName}
      </span>
    </a>
  )
}
