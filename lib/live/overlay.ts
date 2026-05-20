// ============================================================
// Live overlay
// ============================================================
// Server-side helper used by lineup/result pages to surface live
// fantavoto and raw stats while a matchday is being played.
//
// The post-match pipeline writes to player_calculations + player_match_stats,
// which is what pages normally read. While a matchday is in 'open' status
// (= currently live in the simplified state machine), those tables are
// usually empty for the round and the live-ratings cron writes provisional
// values into live_player_scores instead.
//
// overlayLiveScores fills in missing entries in the page's calcMap / statsMap
// from live_player_scores, leaving any post-match data untouched.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

type Supabase = SupabaseClient<Database>

export type LiveBonusMalusItem = { label: string; total: number }

export type LiveCalcOverlay = {
  fantavoto: number | null
  voto_base: number | null
  bonusMalus: LiveBonusMalusItem[] | null
  z_rating: number | null
  minutes_factor: number | null
  role_multiplier: number | null
}

export type LiveStatsOverlay = {
  fotmobRating: number | null
  minutesPlayed: number
  goalsScored: number
  assists: number
  yellowCards: number
  redCards: number
  saves: number
  goalsConceded: number
  // Full post-match stats are unavailable live — set to null/0
  cleanSheet: false
  shots: 0
  shotsOnTarget: 0
  bigChanceCreated: 0
  bigChanceMissed: 0
  blockedScoringAttempt: 0
  xg: null
  xa: null
  keyPasses: null
  totalPasses: 0
  accuratePasses: 0
  totalLongBalls: 0
  accurateLongBalls: 0
  totalCrosses: 0
  successfulDribbles: null
  dribbleAttempts: 0
  touches: 0
  ballCarries: 0
  progressiveCarries: 0
  dispossessed: 0
  possessionLostCtrl: 0
  tackles: 0
  totalTackles: 0
  interceptions: 0
  clearances: 0
  blockedShots: 0
  duelWon: 0
  duelLost: 0
  aerialWon: 0
  aerialLost: 0
  ballRecoveries: 0
  foulsCommitted: 0
  wasFouled: 0
  marketValue: null
  height: null
}

/**
 * Returns the freshest refreshed_at timestamp from live_player_scores
 * for this matchday, or null when nothing has been written yet.
 */
export async function fetchLiveOverlay(
  supabase: Supabase,
  matchdayId: string
): Promise<{
  calcOverlay: Map<string, LiveCalcOverlay>
  statsOverlay: Map<string, LiveStatsOverlay>
  liveMatchPlayerIds: Set<string>
  refreshedAt: string | null
}> {
  const { data: rows } = await supabase
    .from('live_player_scores')
    .select(
      `player_id, voto_base, fantavoto,
       rating, minutes_played,
       goals_scored, assists, yellow_cards, red_cards,
       saves, goals_conceded, refreshed_at,
       bonus_malus_breakdown, z_rating,
       minutes_factor, role_multiplier, is_match_live`
    )
    .eq('matchday_id', matchdayId)

  const calcOverlay = new Map<string, LiveCalcOverlay>()
  const statsOverlay = new Map<string, LiveStatsOverlay>()
  const liveMatchPlayerIds = new Set<string>()
  let refreshedAt: string | null = null

  for (const r of rows ?? []) {
    if (r.refreshed_at && (!refreshedAt || r.refreshed_at > refreshedAt)) {
      refreshedAt = r.refreshed_at
    }
    if (r.is_match_live) liveMatchPlayerIds.add(r.player_id)
    const rawBm = r.bonus_malus_breakdown as Array<{ label: string; total: number }> | null
    const bonusMalus = rawBm ? rawBm.filter((b) => b.total !== 0) : null
    calcOverlay.set(r.player_id, {
      fantavoto: r.fantavoto != null ? Number(r.fantavoto) : null,
      voto_base: r.voto_base != null ? Number(r.voto_base) : null,
      bonusMalus: bonusMalus?.length ? bonusMalus : null,
      z_rating:        r.z_rating        != null ? Number(r.z_rating)        : null,
      minutes_factor:  r.minutes_factor  != null ? Number(r.minutes_factor)  : null,
      role_multiplier: r.role_multiplier != null ? Number(r.role_multiplier) : null,
    })
    statsOverlay.set(r.player_id, {
      fotmobRating:    r.rating    != null ? Number(r.rating)    : null,
      minutesPlayed:   r.minutes_played   ?? 0,
      goalsScored:     r.goals_scored     ?? 0,
      assists:         r.assists          ?? 0,
      yellowCards:     r.yellow_cards     ?? 0,
      redCards:        r.red_cards        ?? 0,
      saves:           r.saves            ?? 0,
      goalsConceded:   r.goals_conceded   ?? 0,
      cleanSheet: false,
      shots: 0, shotsOnTarget: 0,
      bigChanceCreated: 0, bigChanceMissed: 0, blockedScoringAttempt: 0,
      xg: null, xa: null, keyPasses: null,
      totalPasses: 0, accuratePasses: 0,
      totalLongBalls: 0, accurateLongBalls: 0, totalCrosses: 0,
      successfulDribbles: null, dribbleAttempts: 0,
      touches: 0, ballCarries: 0, progressiveCarries: 0,
      dispossessed: 0, possessionLostCtrl: 0,
      tackles: 0, totalTackles: 0, interceptions: 0, clearances: 0, blockedShots: 0,
      duelWon: 0, duelLost: 0, aerialWon: 0, aerialLost: 0,
      ballRecoveries: 0, foulsCommitted: 0, wasFouled: 0,
      marketValue: null, height: null,
    })
  }

  return { calcOverlay, statsOverlay, liveMatchPlayerIds, refreshedAt }
}
