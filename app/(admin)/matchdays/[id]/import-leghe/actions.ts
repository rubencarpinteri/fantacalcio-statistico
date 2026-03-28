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

    // Attach team IDs — layered fuzzy matching
    // (Leghe names are often longer/different, e.g. "Cronache di Ninuzzo -3" → "Ninuzzo")
    // normalizeName strips accents, dashes, non-breaking spaces, non-ASCII — all common xlsx artefacts
    const find = (lgheName: string): string | null => {
      const norm = normalizeName(lgheName)           // e.g. "cronache di ninuzzo 3"
      const normWords = norm.split(' ').filter(w => w.length >= 3)

      // 1. Exact match on normalized form
      const exact = allTeams.find(t => normalizeName(t.name) === norm)
      if (exact) return exact.id

      // 2. Registered name (normalized) is a contiguous substring of the Leghe name
      const subCandidates = allTeams.filter(t => {
        const tn = normalizeName(t.name)
        return tn.length >= 3 && norm.includes(tn)
      })
      if (subCandidates.length === 1) return subCandidates[0]!.id
      if (subCandidates.length > 1) {
        subCandidates.sort((a, b) => normalizeName(b.name).length - normalizeName(a.name).length)
        return subCandidates[0]!.id
      }

      // 3. Every significant word of the registered name appears somewhere in the Leghe name
      //    e.g. registered "Off!" → normalized "off" → word "off" in "off something"
      const wordCandidates = allTeams.filter(t => {
        const tnWords = normalizeName(t.name).split(' ').filter(w => w.length >= 3)
        return tnWords.length > 0 && tnWords.every(w => normWords.includes(w))
      })
      if (wordCandidates.length === 1) return wordCandidates[0]!.id
      if (wordCandidates.length > 1) {
        wordCandidates.sort((a, b) => normalizeName(b.name).length - normalizeName(a.name).length)
        return wordCandidates[0]!.id
      }

      // 4. Any significant word of the registered name appears as a word in the Leghe name
      //    e.g. registered "Isamu FC" has word "isamu" present in "isamu martire"
      const partialCandidates = allTeams.filter(t => {
        const tnWords = normalizeName(t.name).split(' ').filter(w => w.length >= 4)
        return tnWords.some(w => normWords.includes(w))
      })
      if (partialCandidates.length === 1) return partialCandidates[0]!.id

      return null
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

// ─── Shared types + lookup helper ─────────────────────────────────────────────

type CalcData = {
  player_id: string
  fantavoto: number
  voto_base: number | null
  bonus_malus_breakdown: unknown
}

/** The shape of team_lineups JSON sent from the client for both preview and confirm */
type TeamLineupInput = {
  teamId: string
  name: string                 // Leghe team name (display only)
  starters: { name: string; isNv: boolean; role: string; legheFantavoto: number | null }[]
  bench: { name: string; role: string }[]
  subAssignments: Record<string, string>   // nvStarterName → benchPlayerName ('' = none)
  playersPlayed: number
  nvCount: number
  legheTotal: number | null
}

/**
 * Load the latest v1 calculation run for a matchday and build a name→score lookup.
 * Returns { lookupCalc, runId } on success, { error } on failure.
 */
async function buildCalcLookup(
  matchdayId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ lookupCalc: (name: string) => CalcData | null; runId: string } | { error: string }> {
  const { data: v1Run } = await supabase
    .from('calculation_runs')
    .select('id')
    .eq('matchday_id', matchdayId)
    .eq('engine_version', 'v1')
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!v1Run) {
    return { error: 'Nessun calcolo FotMob trovato per questa giornata. Esegui prima il fetch e il calcolo statistico.' }
  }

  const { data: calcs } = await supabase
    .from('player_calculations')
    .select('player_id, fantavoto, voto_base, bonus_malus_breakdown')
    .eq('run_id', v1Run.id)
    .not('fantavoto', 'is', null)

  const playerIds = (calcs ?? []).map(c => c.player_id).filter(Boolean) as string[]
  const { data: lps } = playerIds.length > 0
    ? await supabase.from('league_players').select('id, full_name').in('id', playerIds)
    : { data: [] }

  const nameToCalc = new Map<string, CalcData>()
  const surnameCount = new Map<string, number>()
  const surnameToCalc = new Map<string, CalcData>()

  for (const calc of calcs ?? []) {
    if (calc.fantavoto == null || !calc.player_id) continue
    const lp = (lps ?? []).find(p => p.id === calc.player_id)
    if (!lp) continue
    const data: CalcData = {
      player_id: calc.player_id,
      fantavoto: calc.fantavoto,
      voto_base: calc.voto_base,
      bonus_malus_breakdown: calc.bonus_malus_breakdown,
    }
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

  return { lookupCalc, runId: v1Run.id }
}

// ─── Preview types + action ────────────────────────────────────────────────────

export type PreviewPlayerRow = {
  name: string
  role: string
  isNv: boolean
  /** Bench player that replaced a NV starter — their score is counted */
  isActiveSub: boolean
  subbedForNv: string | null
  finalScore: number | null
  source: 'fotmob' | 'leghe' | 'none'
}

export type PreviewTeamResult = {
  teamId: string
  legheName: string
  total: number
  legheTotal: number | null
  players: PreviewPlayerRow[]
  warnings: string[]
}

export type PreviewScoresState =
  | { ok: false; error?: string }
  | { ok: true; teams: PreviewTeamResult[] }

export async function previewScoresAction(
  _: PreviewScoresState,
  formData: FormData
): Promise<PreviewScoresState> {
  try {
    await requireLeagueAdmin()
    const matchdayId = formData.get('matchday_id') as string
    const teamLineups = JSON.parse(formData.get('team_lineups') as string) as TeamLineupInput[]

    const supabase = await createClient()
    const lookupResult = await buildCalcLookup(matchdayId, supabase)
    if ('error' in lookupResult) return { ok: false, error: lookupResult.error }
    const { lookupCalc } = lookupResult

    const teams: PreviewTeamResult[] = []

    for (const tl of teamLineups) {
      const players: PreviewPlayerRow[] = []
      const warnings: string[] = []
      let total = 0
      const usedBench = new Set<string>()

      for (const starter of tl.starters) {
        if (!starter.isNv) {
          const calc = lookupCalc(starter.name)
          if (calc !== null) {
            total += calc.fantavoto
            players.push({ name: starter.name, role: starter.role, isNv: false, isActiveSub: false, subbedForNv: null, finalScore: calc.fantavoto, source: 'fotmob' })
          } else if (starter.legheFantavoto !== null) {
            total += starter.legheFantavoto
            warnings.push(`${starter.name}: voto FotMob non trovato — usato voto Leghe (${starter.legheFantavoto.toFixed(2)})`)
            players.push({ name: starter.name, role: starter.role, isNv: false, isActiveSub: false, subbedForNv: null, finalScore: starter.legheFantavoto, source: 'leghe' })
          } else {
            warnings.push(`${starter.name}: nessun voto disponibile`)
            players.push({ name: starter.name, role: starter.role, isNv: false, isActiveSub: false, subbedForNv: null, finalScore: null, source: 'none' })
          }
        } else {
          players.push({ name: starter.name, role: starter.role, isNv: true, isActiveSub: false, subbedForNv: null, finalScore: null, source: 'none' })
          const assignedSubName = tl.subAssignments[starter.name] ?? ''
          if (assignedSubName) {
            usedBench.add(assignedSubName)
            const c = lookupCalc(assignedSubName)
            const benchRole = tl.bench.find(b => b.name === assignedSubName)?.role ?? ''
            if (c !== null) {
              total += c.fantavoto
              players.push({ name: assignedSubName, role: benchRole, isNv: false, isActiveSub: true, subbedForNv: starter.name, finalScore: c.fantavoto, source: 'fotmob' })
            } else {
              warnings.push(`Sostituto ${assignedSubName} (per ${starter.name}): voto FotMob non trovato`)
              players.push({ name: assignedSubName, role: benchRole, isNv: false, isActiveSub: true, subbedForNv: starter.name, finalScore: null, source: 'none' })
            }
          }
        }
      }

      teams.push({ teamId: tl.teamId, legheName: tl.name, total, legheTotal: tl.legheTotal, players, warnings })
    }

    return { ok: true, teams }
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

    const teamLineups = JSON.parse(formData.get('team_lineups') as string) as TeamLineupInput[]

    if (teamLineups.length === 0) return { ok: false, error: 'Nessuna squadra da importare.' }

    const supabase = await createClient()

    const lookupResult = await buildCalcLookup(matchdayId, supabase)
    if ('error' in lookupResult) return { ok: false, error: lookupResult.error }
    const { lookupCalc, runId } = lookupResult

    // ── Compute team totals + build lineup data ─────────────────────────────
    type StarterEntry = { name: string; role: string; player_id: string | null; fantavoto: number | null; voto_base: number | null; bonus_malus: unknown; is_nv: boolean; subbed_by: string | null }
    type BenchEntry   = { name: string; role: string; player_id: string | null; fantavoto: number | null; subbed_in_for: string | null }

    const teamScores: { teamId: string; total: number; playersPlayed: number; nvCount: number }[] = []
    const lineupRows: { teamId: string; starters: StarterEntry[]; bench: BenchEntry[] }[] = []

    for (const tl of teamLineups) {
      let total = 0; let playerCount = 0; let nvCount = 0
      const starters: StarterEntry[] = []
      const bench: BenchEntry[] = []

      // Use the explicit sub assignments from the client (admin-verified, not auto-guessed)
      const usedBench = new Set<string>()

      for (const starter of tl.starters) {
        if (!starter.isNv) {
          // Leghe says this player played — get their engine score.
          // Name-lookup failures do NOT make a player NV; they count as 0 (data gap).
          const calc = lookupCalc(starter.name)
          if (calc !== null) {
            // FotMob score found — use it
            total += calc.fantavoto; playerCount++
            starters.push({ name: starter.name, role: starter.role, player_id: calc.player_id, fantavoto: calc.fantavoto, voto_base: calc.voto_base, bonus_malus: calc.bonus_malus_breakdown, is_nv: false, subbed_by: null })
          } else if (starter.legheFantavoto !== null) {
            // FotMob lookup failed (name mismatch or missing stats) — fall back to Leghe score
            total += starter.legheFantavoto; playerCount++
            starters.push({ name: starter.name, role: starter.role, player_id: null, fantavoto: starter.legheFantavoto, voto_base: null, bonus_malus: null, is_nv: false, subbed_by: null })
          } else {
            // Played per Leghe but no score anywhere — count as played, 0 contribution
            playerCount++
            starters.push({ name: starter.name, role: starter.role, player_id: null, fantavoto: null, voto_base: null, bonus_malus: null, is_nv: false, subbed_by: null })
          }
        } else {
          // NV per Leghe — use the sub chosen by the admin (empty string = no sub)
          nvCount++
          const assignedSubName = tl.subAssignments[starter.name] ?? ''
          let subName: string | null = null
          let subCalc: CalcData | null = null

          if (assignedSubName) {
            const c = lookupCalc(assignedSubName)
            if (c !== null) {
              usedBench.add(assignedSubName)
              total += c.fantavoto; playerCount++
              subName = assignedSubName; subCalc = c
            }
          }

          starters.push({ name: starter.name, role: starter.role, player_id: null, fantavoto: null, voto_base: null, bonus_malus: null, is_nv: true, subbed_by: subName })
          if (subCalc && subName) {
            bench.push({ name: subName, role: tl.bench.find(b => b.name === subName)?.role ?? '', player_id: subCalc.player_id, fantavoto: subCalc.fantavoto, subbed_in_for: starter.name })
          }
        }
      }

      // Remaining bench players (not used as subs)
      for (const b of tl.bench) {
        if (!usedBench.has(b.name)) {
          const c = lookupCalc(b.name)
          bench.push({ name: b.name, role: b.role, player_id: c?.player_id ?? null, fantavoto: c?.fantavoto ?? null, subbed_in_for: null })
        }
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
