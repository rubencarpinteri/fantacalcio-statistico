/**
 * Pure parser for the Leghe.it lineup text format.
 * No server imports — safe to use from both client and server.
 *
 * Expected format per team:
 *   #TEAM NAME# (FORMATION): P1; P2, P3; P4; ... (panchina: B1, B2, ...)
 *
 * Multiple teams in the same paste are separated by --- or simply appear
 * sequentially. The parser finds ALL #...# blocks regardless of separator.
 */

export interface ParsedTeamLineup {
  /** Raw team name extracted from between # characters */
  teamName: string
  /** Formation string as it appears, e.g. "3-4-2-1" */
  formationStr: string
  /** Starter player names in text order (expect 11) */
  starterNames: string[]
  /** Bench player names in text order (expect 12) */
  benchNames: string[]
}

/**
 * Parses a paste containing one or more Leghe lineup blocks.
 * Returns one entry per #TEAM# block found in the text.
 */
export function parseLeghiLineupText(text: string): ParsedTeamLineup[] {
  const results: ParsedTeamLineup[] = []

  // Match: #TEAM# (FORMATION): <starters> (panchina: <bench>)
  // The [^(]+ for starters stops at the first ( — i.e. the panchina opening paren.
  // The s flag (dotAll) isn't needed because there are no newlines inside a block.
  const BLOCK_RE = /#([^#]+)#\s*\(([^)]+)\)\s*:\s*([^(]+)\(panchina:\s*([^)]+)\)/gi

  let match: RegExpExecArray | null
  while ((match = BLOCK_RE.exec(text)) !== null) {
    const teamName    = match[1]!.trim()
    const formationStr = match[2]!.trim()
    const startersRaw  = match[3]!
    const benchRaw     = match[4]!

    // Normalize formation: strip trailing variant suffix like "D", "O", "A", "C"
    // e.g. "4-3-3 D" → "4-3-3", "3-4-2-1 A" → "3-4-2-1"
    const normalizedFormation = formationStr.replace(/\s+[A-Za-z]$/, '').trim()

    // Starters: groups separated by ; with commas within each group
    const starterNames = startersRaw
      .split(/[;,]/)
      .map((s) => s.trim().replace(/\s*[-–—]+\s*$/, '').trim()) // strip trailing dash annotations
      .filter(Boolean)

    // Bench: always comma-separated
    const benchNames = benchRaw
      .split(',')
      .map((s) => s.trim().replace(/\s*[-–—]+\s*$/, '').trim()) // strip trailing dash annotations
      .filter(Boolean)

    results.push({ teamName, formationStr: normalizedFormation, starterNames, benchNames })
  }

  return results
}
