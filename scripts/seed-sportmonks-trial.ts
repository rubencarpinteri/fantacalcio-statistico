/**
 * Scottish Premiership 25/26 trial seed.
 *
 * Idempotently creates:
 *   - 1× fm_competition  (active_sportmonks_league_id = 501)
 *   - 1× fm_competition_config  (defaults)
 *   - 1× fm_phase ("Trial Phase")
 *   - N× fm_national_team    (per team in season)
 *   - N× fm_coach            (per team)
 *   - N× fm_player           (per player in squad)
 *
 * All rows carry sportmonks_* IDs so the cron can resolve them.
 *
 * Usage:
 *   SPORTMONKS_API_TOKEN=… \
 *   NEXT_PUBLIC_SUPABASE_URL=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   pnpm tsx scripts/seed-sportmonks-trial.ts
 *
 * Optional env:
 *   SPORTMONKS_TRIAL_LEAGUE_ID  default 501  (Scottish Prem)
 *   SPORTMONKS_TRIAL_SEASON_ID  default 25598 (25/26)
 */

import { createServiceClient } from '../lib/supabase/service'
import { listTeamsInSeason, fetchTeamSquad, fetchTeamCoach } from '../lib/sportmonks/squad'
import { positionIdToFMRole } from '../lib/sportmonks/positions'
import { DEFAULT_FM_CONFIG } from '../domain/fantamondiale/config/defaults'
import type { Json } from '../types/database.types'

const LEAGUE_ID = Number(process.env.SPORTMONKS_TRIAL_LEAGUE_ID ?? 501)
const SEASON_ID = Number(process.env.SPORTMONKS_TRIAL_SEASON_ID ?? 25598)
const COMPETITION_NAME = 'Scottish Premiership Trial 25/26'
const PHASE_NAME = 'Trial Phase'

async function main() {
  const db = createServiceClient()

  console.log(`▸ Trial seed for SportMonks league ${LEAGUE_ID}, season ${SEASON_ID}`)

  // ---------- 1. Competition ----------
  const { data: existingComp } = await db
    .from('fm_competition')
    .select('id, active_sportmonks_league_id')
    .eq('name', COMPETITION_NAME)
    .maybeSingle()

  let competitionId: string
  if (existingComp) {
    competitionId = existingComp.id
    if (existingComp.active_sportmonks_league_id !== LEAGUE_ID) {
      await db.from('fm_competition').update({ active_sportmonks_league_id: LEAGUE_ID }).eq('id', competitionId)
    }
    console.log(`  competition exists: ${competitionId}`)
  } else {
    const { data: created, error } = await db
      .from('fm_competition')
      .insert({
        name: COMPETITION_NAME,
        edition: 'trial-25-26',
        active_sportmonks_league_id: LEAGUE_ID,
        status: 'draft',
        timezone: 'Europe/Rome',
      })
      .select('id')
      .single()
    if (error) throw new Error(`fm_competition insert: ${error.message}`)
    competitionId = created.id
    console.log(`  competition created: ${competitionId}`)
  }

  // ---------- 2. Competition config ----------
  await db.from('fm_competition_config').upsert(
    {
      competition_id: competitionId,
      config: DEFAULT_FM_CONFIG as unknown as Json,
    },
    { onConflict: 'competition_id' },
  )
  console.log(`  competition_config upserted`)

  // ---------- 3. Phase ----------
  const { data: existingPhase } = await db
    .from('fm_phase')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('name', PHASE_NAME)
    .maybeSingle()
  let phaseId = existingPhase?.id
  if (!phaseId) {
    const { data: created, error } = await db
      .from('fm_phase')
      .insert({
        competition_id: competitionId,
        name: PHASE_NAME,
        kind: 'group_stage',
        display_order: 1,
        status: 'open',
        budget_mode: 'fixed',
      })
      .select('id')
      .single()
    if (error) throw new Error(`fm_phase insert: ${error.message}`)
    phaseId = created.id
    console.log(`  phase created: ${phaseId}`)
  } else {
    console.log(`  phase exists: ${phaseId}`)
  }

  // ---------- 4. Teams ----------
  const teams = await listTeamsInSeason(SEASON_ID)
  console.log(`  ${teams.length} teams in season`)

  const teamUuidByName = new Map<string, string>()
  for (const t of teams) {
    const fifaCode = (t.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TBD').padEnd(3, 'X').slice(0, 3)
    const { data: existing } = await db
      .from('fm_national_team')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('sportmonks_team_id', t.id)
      .maybeSingle()

    let teamUuid = existing?.id
    if (!teamUuid) {
      const { data: created, error } = await db
        .from('fm_national_team')
        .insert({
          competition_id: competitionId,
          name: t.name,
          fifa_code: fifaCode,
          sportmonks_team_id: t.id,
          status: 'active',
        })
        .select('id')
        .single()
      if (error) {
        console.error(`  team ${t.name} insert failed: ${error.message}`)
        continue
      }
      teamUuid = created.id
    }
    teamUuidByName.set(t.name, teamUuid)
  }
  console.log(`  ${teamUuidByName.size} teams upserted`)

  // ---------- 5. Coaches + 6. Players ----------
  let playersUpserted = 0
  let coachesUpserted = 0

  for (const t of teams) {
    const teamUuid = teamUuidByName.get(t.name)
    if (!teamUuid) continue

    // Coach
    try {
      const coach = await fetchTeamCoach(t.id)
      if (coach) {
        const { data: existing } = await db
          .from('fm_coach')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('national_team_id', teamUuid)
          .maybeSingle()
        if (!existing) {
          await db.from('fm_coach').insert({
            competition_id: competitionId,
            national_team_id: teamUuid,
            name: coach.name,
            sportmonks_coach_id: coach.id,
          })
          coachesUpserted += 1
        } else {
          await db.from('fm_coach').update({ sportmonks_coach_id: coach.id }).eq('id', existing.id)
        }
      }
    } catch (e) {
      console.error(`  coach ${t.name} failed:`, e instanceof Error ? e.message : e)
    }

    // Squad
    try {
      const squad = await fetchTeamSquad(t.id)
      for (const entry of squad) {
        const role = positionIdToFMRole(entry.position_id ?? entry.player?.position_id ?? null)
        if (!role) continue

        const playerName = entry.player.display_name ?? entry.player.name ?? `Player ${entry.player_id}`

        const { data: existing } = await db
          .from('fm_player')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('sportmonks_player_id', entry.player_id)
          .maybeSingle()

        if (!existing) {
          const { error } = await db.from('fm_player').insert({
            competition_id: competitionId,
            national_team_id: teamUuid,
            name: playerName,
            role,
            shirt_number: entry.jersey_number,
            sportmonks_player_id: entry.player_id,
          })
          if (!error) playersUpserted += 1
        } else {
          await db.from('fm_player').update({
            national_team_id: teamUuid,
            name: playerName,
            role,
            shirt_number: entry.jersey_number,
          }).eq('id', existing.id)
        }
      }
    } catch (e) {
      console.error(`  squad ${t.name} failed:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`  ${coachesUpserted} new coaches, ${playersUpserted} new players`)
  console.log(`\n✓ Trial seed complete.`)
  console.log(`  competition_id: ${competitionId}`)
  console.log(`  phase_id:       ${phaseId}`)
  console.log(`  league_id:      ${LEAGUE_ID}`)
  console.log(`\nNow trigger the fixtures-sync cron once:`)
  console.log(`  curl -H 'Authorization: Bearer $CRON_SECRET' \\`)
  console.log(`       https://<host>/api/cron/sportmonks-fixtures-sync`)
}

main().catch((e) => {
  console.error('seed failed:', e)
  process.exit(1)
})
