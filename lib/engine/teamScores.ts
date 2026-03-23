// ============================================================
// Shared bench-substitution + team score computation
// Used by both publishCalculationAction and the live refresh.
// Pure function — no DB calls.
// ============================================================

export type LineupPlayer = {
  submission_id: string
  player_id: string
  slot_id: string | null
  is_bench: boolean
  bench_order: number | null
  assigned_mantra_role: string | null
}

export type SlotRoles = { native: string[]; extended: string[] }

export type TeamScoreResult = {
  team_id: string
  total_fantavoto: number
  player_count: number
  nv_count: number
}

export type PlayerScoreEntry = {
  team_id: string
  player_id: string
  assigned_mantra_role: string | null
  is_bench: boolean
  bench_order: number | null
  sub_status:
    | 'active'
    | 'nv_subbed'
    | 'nv_no_sub'
    | 'bench_used'
    | 'bench_unused'
    | 'bench_nv'
  extended_penalty: number
  /** null = NV with no sub (or bench player who is NV) */
  fantavoto: number | null
}

export function computeTeamScores(params: {
  lineupPlayers: LineupPlayer[]
  submissionTeamMap: Map<string, string>
  slotRolesMap: Map<string, SlotRoles>
  fantaVotoMap: Map<string, number | null>
}): { teamScores: TeamScoreResult[]; playerScores: PlayerScoreEntry[] } {
  const { lineupPlayers, submissionTeamMap, slotRolesMap, fantaVotoMap } = params

  const teamStartersMap = new Map<string, LineupPlayer[]>()
  const teamBenchMap = new Map<string, LineupPlayer[]>()

  for (const lp of lineupPlayers) {
    const teamId = submissionTeamMap.get(lp.submission_id)
    if (!teamId) continue
    if (lp.is_bench) {
      if (!teamBenchMap.has(teamId)) teamBenchMap.set(teamId, [])
      teamBenchMap.get(teamId)!.push(lp)
    } else {
      if (!teamStartersMap.has(teamId)) teamStartersMap.set(teamId, [])
      teamStartersMap.get(teamId)!.push(lp)
    }
  }

  // Sort bench by bench_order (MASTER: bench order is primary)
  for (const bench of teamBenchMap.values()) {
    bench.sort((a, b) => (a.bench_order ?? 99) - (b.bench_order ?? 99))
  }

  const teamScores: TeamScoreResult[] = []
  const playerScores: PlayerScoreEntry[] = []

  for (const [teamId, starters] of teamStartersMap) {
    const bench = teamBenchMap.get(teamId) ?? []
    const usedBenchIds = new Set<string>()
    const needsSubIds = new Set<string>(
      starters
        .filter((s) => (fantaVotoMap.get(s.player_id) ?? null) === null)
        .map((s) => s.player_id)
    )

    const starterSubbedIds = new Set<string>()
    const benchUsedMap = new Map<string, { penalty: number }>()

    let total_fantavoto = 0

    // ── Phase 1: GK priority ──────────────────────────────────────
    for (const nvStarter of starters.filter(
      (s) => s.assigned_mantra_role === 'Por' && needsSubIds.has(s.player_id)
    )) {
      const benchGK = bench.find(
        (b) =>
          !usedBenchIds.has(b.player_id) &&
          b.assigned_mantra_role === 'Por' &&
          (fantaVotoMap.get(b.player_id) ?? null) !== null
      )
      if (benchGK) {
        const fv = fantaVotoMap.get(benchGK.player_id)!
        total_fantavoto += fv
        usedBenchIds.add(benchGK.player_id)
        needsSubIds.delete(nvStarter.player_id)
        starterSubbedIds.add(nvStarter.player_id)
        benchUsedMap.set(benchGK.player_id, { penalty: 0 })
      }
    }

    // ── Phase 2: MASTER field substitution ───────────────────────
    for (const benchPlayer of bench) {
      if (usedBenchIds.has(benchPlayer.player_id)) continue
      if ((fantaVotoMap.get(benchPlayer.player_id) ?? null) === null) continue
      const role = benchPlayer.assigned_mantra_role
      if (!role || role === 'Por') continue

      let bestStarter: LineupPlayer | null = null
      let bestIsExtended = false

      for (const nvStarter of starters) {
        if (!needsSubIds.has(nvStarter.player_id)) continue
        if (nvStarter.assigned_mantra_role === 'Por') continue

        const slotRoles = nvStarter.slot_id
          ? (slotRolesMap.get(nvStarter.slot_id) ?? { native: [], extended: [] })
          : { native: [], extended: [] }

        if (slotRoles.native.includes(role)) {
          bestStarter = nvStarter
          bestIsExtended = false
          break
        }
        if (!bestStarter && slotRoles.extended.includes(role)) {
          bestStarter = nvStarter
          bestIsExtended = true
        }
      }

      if (bestStarter) {
        const penalty = bestIsExtended ? -1 : 0
        const fv = fantaVotoMap.get(benchPlayer.player_id)!
        total_fantavoto += fv + penalty
        usedBenchIds.add(benchPlayer.player_id)
        needsSubIds.delete(bestStarter.player_id)
        starterSubbedIds.add(bestStarter.player_id)
        benchUsedMap.set(benchPlayer.player_id, { penalty })
      }
    }

    // ── Final tally ───────────────────────────────────────────────
    let player_count = 0
    let nv_count = 0

    for (const starter of starters) {
      player_count++
      const fv = fantaVotoMap.get(starter.player_id) ?? null
      if (fv !== null) {
        total_fantavoto += fv
        playerScores.push({
          team_id: teamId,
          player_id: starter.player_id,
          assigned_mantra_role: starter.assigned_mantra_role,
          is_bench: false,
          bench_order: null,
          sub_status: 'active',
          extended_penalty: 0,
          fantavoto: fv,
        })
      } else if (starterSubbedIds.has(starter.player_id)) {
        playerScores.push({
          team_id: teamId,
          player_id: starter.player_id,
          assigned_mantra_role: starter.assigned_mantra_role,
          is_bench: false,
          bench_order: null,
          sub_status: 'nv_subbed',
          extended_penalty: 0,
          fantavoto: null,
        })
      } else {
        nv_count++
        playerScores.push({
          team_id: teamId,
          player_id: starter.player_id,
          assigned_mantra_role: starter.assigned_mantra_role,
          is_bench: false,
          bench_order: null,
          sub_status: 'nv_no_sub',
          extended_penalty: 0,
          fantavoto: null,
        })
      }
    }

    for (const benchPlayer of bench) {
      const fv = fantaVotoMap.get(benchPlayer.player_id) ?? null
      if (benchUsedMap.has(benchPlayer.player_id)) {
        const { penalty } = benchUsedMap.get(benchPlayer.player_id)!
        playerScores.push({
          team_id: teamId,
          player_id: benchPlayer.player_id,
          assigned_mantra_role: benchPlayer.assigned_mantra_role,
          is_bench: true,
          bench_order: benchPlayer.bench_order,
          sub_status: 'bench_used',
          extended_penalty: penalty,
          fantavoto: fv,
        })
      } else if (fv === null) {
        playerScores.push({
          team_id: teamId,
          player_id: benchPlayer.player_id,
          assigned_mantra_role: benchPlayer.assigned_mantra_role,
          is_bench: true,
          bench_order: benchPlayer.bench_order,
          sub_status: 'bench_nv',
          extended_penalty: 0,
          fantavoto: null,
        })
      } else {
        playerScores.push({
          team_id: teamId,
          player_id: benchPlayer.player_id,
          assigned_mantra_role: benchPlayer.assigned_mantra_role,
          is_bench: true,
          bench_order: benchPlayer.bench_order,
          sub_status: 'bench_unused',
          extended_penalty: 0,
          fantavoto: fv,
        })
      }
    }

    teamScores.push({ team_id: teamId, total_fantavoto, player_count, nv_count })
  }

  return { teamScores, playerScores }
}
