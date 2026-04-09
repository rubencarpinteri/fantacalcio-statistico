'use client'

import { useState } from 'react'
import { importRatingsAction } from '@/app/(admin)/matchdays/[id]/fixtures/actions'
import { triggerCalculationAction, publishCalculationAction } from '@/app/(admin)/matchdays/[id]/calculate/actions'
import type { FetchRatingsResponse } from '@/app/api/ratings/fetch/route'
import type { ImportMatch } from '@/app/(admin)/matchdays/[id]/fixtures/actions'
import { loadSsStats } from '@/components/ui/SofaScoreManualImport'

type Phase =
  | 'idle'
  | 'fetching'
  | 'importing'
  | 'calculating'
  | 'publishing'
  | 'done'
  | 'error'

interface Props {
  matchdayId: string
  compact?: boolean
}

export function QuickFetchAndCalculateButton({ matchdayId, compact }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [ssStatus, setSsStatus] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ imported: number; scored: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setPhase('fetching')
    setError(null)
    setSsStatus(null)
    setSummary(null)

    // Read manually-pasted SofaScore stats from localStorage
    const sofascoreByPlayerId = loadSsStats(matchdayId)
    const ssCount = sofascoreByPlayerId ? Object.keys(sofascoreByPlayerId).length : 0
    setSsStatus(ssCount > 0
      ? `SofaScore: ${ssCount} giocatori`
      : 'SofaScore: nessun dato — usa "Salva dati SofaScore" prima'
    )

    let fetchData: FetchRatingsResponse
    try {
      const res = await fetch('/api/ratings/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchdayId,
          sofascoreByPlayerId: sofascoreByPlayerId ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`Fetch fallito (HTTP ${res.status})`)
      fetchData = (await res.json()) as FetchRatingsResponse
    } catch (e) {
      setPhase('error')
      setError(String(e))
      return
    }

    if (fetchData.matched.length === 0) {
      setPhase('error')
      setError('Nessun giocatore abbinato.')
      return
    }

    // ── Step 4: import stats ───────────────────────────────────────────────
    setPhase('importing')
    const toImport: ImportMatch[] = fetchData.matched.map((m) => ({
      league_player_id: m.league_player_id,
      sofascore_rating: m.stat.sofascore_rating,
      fotmob_rating: m.stat.fotmob_rating,
      minutes_played: m.stat.minutes_played,
      goals_scored: m.stat.goals_scored,
      assists: m.stat.assists,
      own_goals: m.stat.own_goals,
      yellow_cards: m.stat.yellow_cards,
      red_cards: m.stat.red_cards,
      penalties_scored: m.stat.penalties_scored,
      penalties_missed: m.stat.penalties_missed,
      penalties_saved: m.stat.penalties_saved,
      goals_conceded: m.stat.goals_conceded,
      saves: m.stat.saves,
      clean_sheet: m.stat.clean_sheet,
      ss_shots:                    m.stat.ss_shots,
      ss_shots_on_target:          m.stat.ss_shots_on_target,
      ss_big_chance_created:       m.stat.ss_big_chance_created,
      ss_big_chance_missed:        m.stat.ss_big_chance_missed,
      ss_blocked_scoring_attempt:  m.stat.ss_blocked_scoring_attempt,
      ss_xg:                       m.stat.ss_xg,
      ss_xa:                       m.stat.ss_xa,
      ss_key_passes:               m.stat.ss_key_passes,
      ss_total_passes:             m.stat.ss_total_passes,
      ss_accurate_passes:          m.stat.ss_accurate_passes,
      ss_total_long_balls:         m.stat.ss_total_long_balls,
      ss_accurate_long_balls:      m.stat.ss_accurate_long_balls,
      ss_total_crosses:            m.stat.ss_total_crosses,
      ss_successful_dribbles:      m.stat.ss_successful_dribbles,
      ss_dribble_attempts:         m.stat.ss_dribble_attempts,
      ss_touches:                  m.stat.ss_touches,
      ss_ball_carries:             m.stat.ss_ball_carries,
      ss_progressive_carries:      m.stat.ss_progressive_carries,
      ss_dispossessed:             m.stat.ss_dispossessed,
      ss_possession_lost_ctrl:     m.stat.ss_possession_lost_ctrl,
      ss_tackles:                  m.stat.ss_tackles,
      ss_total_tackles:            m.stat.ss_total_tackles,
      ss_interceptions:            m.stat.ss_interceptions,
      ss_clearances:               m.stat.ss_clearances,
      ss_blocked_shots:            m.stat.ss_blocked_shots,
      ss_duel_won:                 m.stat.ss_duel_won,
      ss_duel_lost:                m.stat.ss_duel_lost,
      ss_aerial_won:               m.stat.ss_aerial_won,
      ss_aerial_lost:              m.stat.ss_aerial_lost,
      ss_ball_recoveries:          m.stat.ss_ball_recoveries,
      ss_fouls_committed:          m.stat.ss_fouls_committed,
      ss_was_fouled:               m.stat.ss_was_fouled,
      ss_market_value:             m.stat.ss_market_value,
      ss_height:                   m.stat.ss_height,
    }))

    const importResult = await importRatingsAction(matchdayId, toImport)
    if (importResult.error) { setPhase('error'); setError(importResult.error); return }

    // ── Step 5: calculate ──────────────────────────────────────────────────
    setPhase('calculating')
    const calcResult = await triggerCalculationAction(matchdayId)
    if (calcResult.error) { setPhase('error'); setError(calcResult.error); return }

    // ── Step 6: publish ────────────────────────────────────────────────────
    setPhase('publishing')
    const publishResult = await publishCalculationAction(matchdayId, calcResult.run_id!)
    if (publishResult.error) { setPhase('error'); setError(publishResult.error); return }

    setSummary({ imported: importResult.imported ?? toImport.length, scored: calcResult.scored_count })
    setPhase('done')
    setTimeout(() => window.location.reload(), 1500)
  }

  if (phase === 'done' && summary) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-emerald-400 font-medium">
          ✓ {summary.imported} importati · {summary.scored} calcolati · pubblicato
        </span>
        {ssStatus && <span className="text-xs text-[#55556a]">{ssStatus}</span>}
        <button onClick={() => { setPhase('idle'); setSummary(null) }} className="text-xs text-[#55556a] hover:text-indigo-400">↺</button>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-red-400">{error}</span>
        {ssStatus && <span className="text-xs text-amber-400">{ssStatus}</span>}
        <button onClick={() => { setPhase('idle'); setError(null) }} className="text-xs text-[#55556a] hover:text-indigo-400">↺ Riprova</button>
      </div>
    )
  }

  const busy = phase !== 'idle'
  const label = phase === 'fetching' ? 'Scaricando voti…'
    : phase === 'importing' ? 'Importando…'
    : phase === 'calculating' ? 'Calcolando…'
    : phase === 'publishing' ? 'Pubblicando…'
    : compact ? '⚡' : '⚡ Aggiorna e pubblica'

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <button
          disabled={busy}
          onClick={run}
          title="Scarica voti da FotMob + SofaScore, calcola e pubblica"
          className={[
            'flex items-center gap-1.5 rounded-lg border font-medium transition-colors px-2 py-1 text-xs',
            busy
              ? 'cursor-wait border-[#2e2e42] bg-[#0d0d1a] text-[#55556a]'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50',
          ].join(' ')}
        >
          {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />}
          {label}
        </button>
        {ssStatus && <span className="text-xs text-[#55556a]">{ssStatus}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <button
        disabled={busy}
        onClick={run}
        title="Scarica voti da FotMob + SofaScore, calcola e pubblica in un click"
        className={[
          'flex w-full items-center justify-center gap-2 rounded-xl border-2 py-4 text-base font-bold transition-all',
          busy
            ? 'cursor-wait border-[#2e2e42] bg-[#0d0d1a] text-[#55556a]'
            : 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 active:scale-[0.98]',
        ].join(' ')}
      >
        {busy ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>{label}</span>
          </>
        ) : (
          <span>⚡ Aggiorna e pubblica</span>
        )}
      </button>
      {ssStatus && <span className="text-xs text-center text-[#55556a]">{ssStatus}</span>}
    </div>
  )
}
