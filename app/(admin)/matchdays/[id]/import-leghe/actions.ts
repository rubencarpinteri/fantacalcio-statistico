'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/league'
import { writeAuditLog } from '@/lib/audit'
import { computeRoundAction } from '@/app/(admin)/competitions/[id]/actions'
import { normalizeName } from '@/lib/ratings/parse'
import * as XLSX from 'xlsx'

// ─── xlsx → rows parser ───────────────────────────────────────────────────────

const MANTRA_ROLES = ['Por', 'Dc', 'Dd', 'Ds', 'B', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

/** Read an xlsx (or csv) file buffer and return it as an array of string-cell rows */
function fileToRows(buffer: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    raw: false,       // format cells as strings
    cellDates: false, // don't auto-convert to Date objects
  })
  const ws = wb.Sheets[wb.SheetNames[0] ?? '']
  if (!ws) return []
  const data = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  })
  return data.map(row => row.map(cell => String(cell ?? '').trim()))
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

function parseLegheRows(rows: string[][]): ParsedMatchup[] {
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

// ─── Server action: parse xlsx + match teams ─────────────────────────────────

export async function parseLegheCSVAction(
  _: unknown,
  formData: FormData
): Promise<ParseResult> {
  try {
    const ctx = await requireLeagueAdmin()
    const file = formData.get('file') as File | null
    if (!file || file.size === 0) return { ok: false, error: 'Nessun file selezionato.' }

    const buffer = await file.arrayBuffer()
    const rows = fileToRows(buffer)
    const matchups = parseLegheRows(rows)
    if (matchups.length === 0) {
      return { ok: false, error: 'Nessun matchup trovato. Verifica che il file sia quello di Leghe Fantacalcio.' }
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

    // team_lineups: [{teamId, starters: [{name, isNv}], bench: [{name}], ...}]
    const teamLineups = JSON.parse(formData.get('team_lineups') as string) as {
      teamId: string
      starters: { name: string; isNv: boolean }[]
      bench: { name: string }[]
      playersPlayed: number
      nvCount: number
    }[]

    if (teamLineups.length === 0) return { ok: false, error: 'Nessuna squadra da importare.' }

    const supabase = await createClient()

    // ── Find latest v1 (FotMob) run for this matchday ──────────────────────
    const { data: v1Run } = await supabase
      .from('calculation_runs')
      .select('id')
      .eq('matchday_id', matchdayId)
      .eq('engine_version', 'v1')
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!v1Run) {
      return { ok: false, error: 'Nessun calcolo FotMob trovato per questa giornata. Esegui prima il fetch e il calcolo statistico.' }
    }

    const fotmobRunId = v1Run.id

    // ── Fetch player scores + breakdown for this run ─────────────────────────
    const { data: calcs } = await supabase
      .from('player_calculations')
      .select('player_id, fantavoto, voto_base, bonus_malus_breakdown')
      .eq('run_id', fotmobRunId)
      .not('fantavoto', 'is', null)

    const playerIds = (calcs ?? []).map(c => c.player_id).filter(Boolean) as string[]
    const { data: lps } = playerIds.length > 0
      ? await supabase.from('league_players').select('id, full_name').in('id', playerIds)
      : { data: [] }

    type CalcData = { player_id: string; fantavoto: number; voto_base: number | null; bonus_malus_breakdown: unknown }
    // fullname/surname → full calc data
    const nameToCalc = new Map<string, CalcData>()
    const surnameCount = new Map<string, number>()
    const surnameToCalc = new Map<string, CalcData>()

    for (const calc of calcs ?? []) {
      if (calc.fantavoto == null || !calc.player_id) continue
      const lp = (lps ?? []).find(p => p.id === calc.player_id)
      if (!lp) continue
      const data: CalcData = { player_id: calc.player_id, fantavoto: calc.fantavoto, voto_base: calc.voto_base, bonus_malus_breakdown: calc.bonus_malus_breakdown }
      const fullKey = normalizeName(lp.full_name)
      nameToCalc.set(fullKey, data)
      const parts = fullKey.split(' ')
      const surname = parts[parts.length - 1] ?? ''
      if (surname) {
        surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1)
        surnameToCalc.set(surname, data)
      }
    }
    for (const [surname, count] of surnameCount) {
      if (count > 1) surnameToCalc.delete(surname)
    }

    const lookupCalc = (name: string): CalcData | null => {
      const key = normalizeName(name)
      if (nameToCalc.has(key)) return nameToCalc.get(key)!
      const parts = key.split(' ')
      const lastToken = parts[parts.length - 1] ?? ''
      if (lastToken && surnameToCalc.has(lastToken)) return surnameToCalc.get(lastToken)!
      const firstToken = parts[0] ?? ''
      if (firstToken && surnameToCalc.has(firstToken)) return surnameToCalc.get(firstToken)!
      return null
    }
    const lookupFv = (name: string): number | null => lookupCalc(name)?.fantavoto ?? null

    // ── Compute team totals + build lineup data ─────────────────────────────
    type StarterEntry = { name: string; role: string; player_id: string | null; fantavoto: number | null; voto_base: number | null; bonus_malus: unknown; is_nv: boolean; subbed_by: string | null }
    type BenchEntry   = { name: string; role: string; player_id: string | null; fantavoto: number | null; subbed_in_for: string | null }

    const teamScores: { teamId: string; total: number; playersPlayed: number; nvCount: number }[] = []
    const lineupRows: { teamId: string; starters: StarterEntry[]; bench: BenchEntry[] }[] = []

    for (const tl of teamLineups) {
      let total = 0; let playerCount = 0; let nvCount = 0
      const benchQueue = [...tl.bench]
      const starters: StarterEntry[] = []
      const bench: BenchEntry[] = []

      for (const starter of tl.starters) {
        const calc = lookupCalc(starter.name)
        if (calc !== null) {
          total += calc.fantavoto; playerCount++
          starters.push({ name: starter.name, role: '', player_id: calc.player_id, fantavoto: calc.fantavoto, voto_base: calc.voto_base, bonus_malus: calc.bonus_malus_breakdown, is_nv: false, subbed_by: null })
        } else {
          nvCount++
          let subName: string | null = null
          let subCalc: CalcData | null = null
          while (benchQueue.length > 0) {
            const sub = benchQueue.shift()!
            const c = lookupCalc(sub.name)
            if (c !== null) { total += c.fantavoto; playerCount++; subName = sub.name; subCalc = c; break }
          }
          starters.push({ name: starter.name, role: '', player_id: null, fantavoto: null, voto_base: null, bonus_malus: null, is_nv: true, subbed_by: subName })
          if (subCalc && subName) {
            bench.push({ name: subName, role: '', player_id: subCalc.player_id, fantavoto: subCalc.fantavoto, subbed_in_for: starter.name })
          }
        }
      }
      // Remaining bench players (not used as subs)
      for (const b of benchQueue) {
        const c = lookupCalc(b.name)
        bench.push({ name: b.name, role: '', player_id: c?.player_id ?? null, fantavoto: c?.fantavoto ?? null, subbed_in_for: null })
      }

      teamScores.push({ teamId: tl.teamId, total, playersPlayed: playerCount, nvCount })
      lineupRows.push({ teamId: tl.teamId, starters, bench })
    }

    if (teamScores.length === 0) return { ok: false, error: 'Nessuna squadra da importare.' }

    const { data: matchday } = await supabase
      .from('matchdays')
      .select('id, status, round_number')
      .eq('id', matchdayId)
      .eq('league_id', ctx.league.id)
      .single()

    if (!matchday) return { ok: false, error: 'Giornata non trovata.' }
    if (matchday.status === 'archived') return { ok: false, error: 'Giornata archiviata.' }

    const runId = fotmobRunId
    const now = new Date().toISOString()

    // Upsert published_team_scores pointing to the FotMob run
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

    // Upsert matchday_lineups for match detail view
    await supabase.from('matchday_lineups').upsert(
      lineupRows.map(lr => ({
        league_id:   ctx.league.id,
        matchday_id: matchdayId,
        team_id:     lr.teamId,
        run_id:      runId,
        starters:    lr.starters as unknown as import('@/types/database.types').Json,
        bench:       lr.bench   as unknown as import('@/types/database.types').Json,
      })),
      { onConflict: 'matchday_id,team_id,run_id' }
    )

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
        engine_version: 'v1_leghe_lineups',
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
      note: `Formazioni da Leghe xlsx, punteggi da FotMob (run v1)`,
    })

    await writeAuditLog({
      supabase,
      leagueId: ctx.league.id,
      actorUserId: ctx.userId,
      actionType: 'calculation_publish',
      entityType: 'calculation_run',
      entityId: runId,
      afterJson: { source: 'leghe_lineups_fotmob_scores', version_number, team_count: teamScores.length },
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

    return { ok: true, message: `Giornata pubblicata: formazioni da Leghe xlsx, punteggi da FotMob (${teamScores.length} squadre).` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
