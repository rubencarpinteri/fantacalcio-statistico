'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { computeRoundAction } from '@/app/(admin)/competitions/[id]/actions'

// ─── CSV parser ──────────────────────────────────────────────────────────────

const MANTRA_ROLES = ['Por', 'Dc', 'Dd', 'Ds', 'B', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

function parseRow(line: string): string[] {
  // Handles quoted fields like "W;A" correctly
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const c of line) {
    if (c === '"') { inQuotes = !inQuotes }
    else if (c === ';' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += c }
  }
  result.push(current.trim())
  return result
}

function isRoleCell(s: string | undefined): boolean {
  if (!s) return false
  return s.split(';').every(r => MANTRA_ROLES.includes(r.trim()))
}

function parseNum(s: string | undefined): number | null {
  if (!s || s === '-') return null
  return parseFloat(s.replace(',', '.')) || null
}

export type ParsedPlayer = {
  name: string
  role: string
  voto: number | null
  fantavoto: number | null
  isStarter: boolean
}

export type ParsedTeamBlock = {
  name: string
  formation: string
  total: number | null
  starters: ParsedPlayer[]
  bench: ParsedPlayer[]
  /** Starters with non-null fantavoto */
  playersPlayed: number
  /** Starters with null fantavoto */
  nvCount: number
  /** Matched fantasy_team.id — populated by parseLegheCSVAction */
  teamId: string | null
}

export type ParsedMatchup = {
  score: string
  team1: ParsedTeamBlock
  team2: ParsedTeamBlock
}

export type ParseResult =
  | { ok: true; matchups: ParsedMatchup[]; allTeams: { id: string; name: string }[] }
  | { ok: false; error: string }

function parseLegheCSV(csv: string): ParsedMatchup[] {
  const lines = csv.split('\n')
  const rows = lines.map(parseRow)
  const matchups: ParsedMatchup[] = []

  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    if (!row) { i++; continue }
    const r0 = row[0] ?? ''; const r5 = row[5] ?? ''; const r6 = row[6] ?? ''
    // Block header: cell[0]=team1, cell[5]=X-Y score, cell[6]=team2
    if (r0 && r5 && /^\d+-\d+$/.test(r5) && r6) {
      const team1: ParsedTeamBlock = { name: r0, formation: '', total: null, starters: [], bench: [], playersPlayed: 0, nvCount: 0, teamId: null }
      const team2: ParsedTeamBlock = { name: r6, formation: '', total: null, starters: [], bench: [], playersPlayed: 0, nvCount: 0, teamId: null }
      const score = r5
      let bench1 = false, bench2 = false
      i++

      while (i < rows.length) {
        const r = rows[i]
        if (!r) { i++; continue }
        const c0 = r[0] ?? ''; const c1 = r[1] ?? ''; const c3 = r[3] ?? ''
        const c4 = r[4] ?? ''; const c5 = r[5] ?? ''; const c6 = r[6] ?? ''
        const c7 = r[7] ?? ''; const c9 = r[9] ?? ''; const c10 = r[10] ?? ''

        // Next block header → end of this block
        if (c0 && c5 && /^\d+-\d+$/.test(c5) && c6) break

        // TOTALE detection (can appear in col 0, col 6, or both)
        if (c0.startsWith('TOTALE:')) {
          const m = c0.match(/TOTALE:\s*([\d,]+)/)
          if (m?.[1]) team1.total = parseFloat(m[1].replace(',', '.'))
        }
        if (c6.startsWith('TOTALE:')) {
          const m = c6.match(/TOTALE:\s*([\d,]+)/)
          if (m?.[1]) team2.total = parseFloat(m[1].replace(',', '.'))
        }

        // Formation row (starts with digit)
        if (c0 && /^\d/.test(c0) && !bench1) {
          team1.formation = c0
          team2.formation = c6
          i++; continue
        }

        // Panchina separator
        if (c0 === 'Panchina') bench1 = true
        if (c6 === 'Panchina') bench2 = true

        // Left team player
        if (isRoleCell(c0) && c1) {
          team1[bench1 ? 'bench' : 'starters'].push({
            name: c1, role: c0,
            voto: parseNum(c3), fantavoto: parseNum(c4),
            isStarter: !bench1,
          })
        }

        // Right team player
        if (isRoleCell(c6) && c7) {
          team2[bench2 ? 'bench' : 'starters'].push({
            name: c7, role: c6,
            voto: parseNum(c9), fantavoto: parseNum(c10),
            isStarter: !bench2,
          })
        }

        i++
      }

      // Compute player stats
      team1.playersPlayed = team1.starters.filter(p => p.fantavoto !== null).length
      team1.nvCount       = team1.starters.filter(p => p.fantavoto === null).length
      team2.playersPlayed = team2.starters.filter(p => p.fantavoto !== null).length
      team2.nvCount       = team2.starters.filter(p => p.fantavoto === null).length

      matchups.push({ score, team1, team2 })
    } else {
      i++
    }
  }

  return matchups
}

// ─── Server action: parse CSV + match teams ───────────────────────────────────

export async function parseLegheCSVAction(
  _: unknown,
  formData: FormData
): Promise<ParseResult> {
  try {
    const ctx = await requireLeagueAdmin()
    const csv = formData.get('csv') as string
    if (!csv?.trim()) return { ok: false, error: 'CSV vuoto.' }

    const matchups = parseLegheCSV(csv)
    if (matchups.length === 0) {
      return { ok: false, error: 'Nessun matchup trovato. Verifica che il CSV sia quello di Leghe Fantacalcio.' }
    }

    const supabase = await createClient()
    const { data: teams } = await supabase
      .from('fantasy_teams')
      .select('id, name')
      .eq('league_id', ctx.league.id)
    const allTeams = teams ?? []

    // Attach team IDs (case-insensitive exact match)
    const find = (name: string) => {
      const norm = name.toLowerCase().trim()
      return allTeams.find(t => t.name.toLowerCase().trim() === norm)?.id ?? null
    }

    for (const mu of matchups) {
      mu.team1.teamId = find(mu.team1.name)
      mu.team2.teamId = find(mu.team2.name)
    }

    return { ok: true, matchups, allTeams }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ─── Server action: confirm import ───────────────────────────────────────────

export type ConfirmState = { ok: boolean; error?: string; message?: string }

export async function confirmLegheImportAction(
  _: ConfirmState,
  formData: FormData
): Promise<ConfirmState> {
  try {
    const ctx = await requireLeagueAdmin()
    const matchdayId = formData.get('matchday_id') as string

    // teamScores: [{teamId, total, playersPlayed, nvCount}]
    const teamScores = JSON.parse(formData.get('team_scores') as string) as {
      teamId: string; total: number; playersPlayed: number; nvCount: number
    }[]

    if (teamScores.length === 0) return { ok: false, error: 'Nessuna squadra da importare.' }

    const supabase = await createClient()

    const { data: matchday } = await supabase
      .from('matchdays')
      .select('id, status, round_number')
      .eq('id', matchdayId)
      .eq('league_id', ctx.league.id)
      .single()

    if (!matchday) return { ok: false, error: 'Giornata non trovata.' }
    if (matchday.status === 'archived') return { ok: false, error: 'Giornata archiviata.' }

    // Next run number
    const { data: maxRun } = await supabase
      .from('calculation_runs')
      .select('run_number')
      .eq('matchday_id', matchdayId)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const run_number = (maxRun?.run_number ?? 0) + 1

    // Create calculation run
    const { data: run, error: runErr } = await supabase
      .from('calculation_runs')
      .insert({
        matchday_id: matchdayId,
        run_number,
        status: 'draft',
        engine_version: 'leghe_csv',
        config_json: { source: 'leghe_csv' },
        triggered_by: ctx.userId,
      })
      .select('id')
      .single()

    if (runErr || !run) return { ok: false, error: runErr?.message ?? 'Errore creazione run.' }

    const runId = run.id
    const now = new Date().toISOString()

    // Mark run published
    await supabase
      .from('calculation_runs')
      .update({ status: 'published', published_at: now, published_by: ctx.userId })
      .eq('id', runId)

    // Update current calculation pointer
    await supabase
      .from('matchday_current_calculation')
      .upsert({ matchday_id: matchdayId, run_id: runId, updated_at: now })

    // Upsert published_team_scores
    const scoreRows = teamScores.map(ts => ({
      league_id:       ctx.league.id,
      matchday_id:     matchdayId,
      team_id:         ts.teamId,
      run_id:          runId,
      total_fantavoto: ts.total,
      player_count:    ts.playersPlayed,
      nv_count:        ts.nvCount,
      published_at:    now,
    }))

    const { error: scoreErr } = await supabase
      .from('published_team_scores')
      .upsert(scoreRows, { onConflict: 'matchday_id,team_id' })

    if (scoreErr) return { ok: false, error: scoreErr.message }

    // Standings snapshot
    const { data: lastSnap } = await supabase
      .from('standings_snapshots')
      .select('version_number')
      .eq('matchday_id', matchdayId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const version_number = (lastSnap?.version_number ?? 0) + 1

    await supabase.from('standings_snapshots').insert({
      league_id: ctx.league.id,
      matchday_id: matchdayId,
      snapshot_json: {
        run_id: runId,
        engine_version: 'leghe_csv',
        team_scores: teamScores.map(ts => ({
          team_id: ts.teamId,
          total_fantavoto: ts.total,
          player_count: ts.playersPlayed,
          nv_count: ts.nvCount,
        })),
      },
      published_at: now,
      version_number,
    })

    // Transition matchday to published
    const oldStatus = matchday.status
    await supabase
      .from('matchdays')
      .update({ status: 'published' })
      .eq('id', matchdayId)

    await supabase.from('matchday_status_log').insert({
      matchday_id: matchdayId,
      old_status:  oldStatus,
      new_status:  'published',
      changed_by:  ctx.userId,
      note: `Importato da CSV Leghe Fantacalcio (run #${run_number})`,
    })

    await writeAuditLog({
      supabase,
      leagueId: ctx.league.id,
      actorUserId: ctx.userId,
      actionType: 'calculation_publish',
      entityType: 'calculation_run',
      entityId: runId,
      afterJson: { source: 'leghe_csv', run_number, version_number, team_count: teamScores.length },
    })

    // Auto-fill competition matchups (non-fatal)
    if (matchday.round_number != null) {
      try {
        const { data: leagueComps } = await supabase
          .from('competitions')
          .select('id')
          .eq('league_id', ctx.league.id)
        const compIds = (leagueComps ?? []).map(c => c.id)
        if (compIds.length > 0) {
          const { data: matchups } = await supabase
            .from('competition_matchups')
            .select('id, home_team_id, away_team_id')
            .in('competition_id', compIds)
            .eq('round_number', matchday.round_number)
          if (matchups?.length) {
            const scoreMap = new Map(teamScores.map(ts => [ts.teamId, ts.total]))
            for (const mu of matchups) {
              const homeFv = scoreMap.get(mu.home_team_id) ?? null
              const awayFv = scoreMap.get(mu.away_team_id) ?? null
              let result: '1' | 'X' | '2' | null = null
              if (homeFv !== null && awayFv !== null) {
                result = homeFv > awayFv ? '1' : homeFv === awayFv ? 'X' : '2'
              }
              await supabase
                .from('competition_matchups')
                .update({ home_fantavoto: homeFv, away_fantavoto: awayFv, result, computed_at: now })
                .eq('id', mu.id)
            }
          }
        }
      } catch { /* non-fatal */ }
    }

    // Competition cascade (non-fatal)
    try {
      const { data: linkedRounds } = await supabase
        .from('competition_rounds')
        .select('id, competitions(id, status, league_id)')
        .eq('matchday_id', matchdayId)
        .neq('status', 'locked')
      for (const round of linkedRounds ?? []) {
        const comp = round.competitions as unknown as { id: string; status: string; league_id: string } | null
        if (!comp || comp.league_id !== ctx.league.id || comp.status !== 'active') continue
        try { await computeRoundAction(round.id) } catch { /* non-fatal */ }
      }
    } catch { /* non-fatal */ }

    revalidatePath(`/matchdays/${matchdayId}`)
    revalidatePath(`/matchdays`)

    return { ok: true, message: `Giornata pubblicata con ${teamScores.length} squadre importate da Leghe.` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
