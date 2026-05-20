/**
 * Name normalization + player-name matching helpers.
 *
 * Used by the manual-import paths (import-lineups, import-leghe) to match
 * external player names to league_players rows when the external source
 * doesn't expose a stable ID.
 */

// ─── Name normalization ───────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    // Map characters that NFD does NOT decompose to a base letter
    .replace(/[Øø]/g, 'o')
    .replace(/[Ææ]/g, 'ae')
    .replace(/[Łł]/g, 'l')
    .replace(/[Ðð]/g, 'd')
    .replace(/ß/g, 'ss')
    // Turkish dotless i (ı U+0131) and dotted İ (U+0130) — not decomposed by NFD
    .replace(/[ıİ]/g, 'i')
    // Cyrillic і (U+0456) and І (U+0406) — visually identical to Latin i, used in Ukrainian names
    .replace(/[іІ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Player name matching ──────────────────────────────────────────────────────

export type DbPlayerEntry = {
  id: string
  full_name: string
  club: string
  normalized: string
}

/**
 * Multi-strategy player name matching.
 *
 * Strategy order:
 * 1. Exact normalized name match
 * 2. Token-set match (same words, any order) — "V. Milinkovic-Savic" ↔ "Milinkovic-Savic V."
 * 3. Strip single-char initials from both sides — "A. Gudmundsson" ↔ "Gudmundsson A."
 * 4. DB tokens ⊆ external tokens (unique match only) — "Bisseck" ↔ "Yann Bisseck"
 * 5. External tokens ⊆ DB tokens — "N'Dicka" ↔ "Evan N'Dicka"
 * 6. Surname + name-prefix abbreviation — "Thuram K." → "Khéphren Thuram"
 * 7. Multiple abbreviations — "Esposito F. P." → "Esposito Francesco Pio"
 * 8. Apostrophe-concatenation — "N'Dicka" ↔ "Ndicka"
 * 9. Token intersection (last resort) — "Zambo Anguissa" ↔ "Frank Anguissa"
 */
export function findDbPlayer<T extends DbPlayerEntry>(
  statNorm: string,
  dbPlayers: T[],
): T | undefined {
  const candidates = dbPlayers

  const exact = candidates.find(p => p.normalized === statNorm)
  if (exact) return exact

  const statTokens = statNorm.split(' ').filter(Boolean)
  const statSig = statTokens.filter(t => t.length > 1)

  // Token-set: same tokens, any order
  if (statTokens.length > 1) {
    const statSet = new Set(statTokens)
    const ts = candidates.find(p => {
      const pts = p.normalized.split(' ').filter(Boolean)
      if (pts.length !== statTokens.length) return false
      return pts.every(t => statSet.has(t))
    })
    if (ts) return ts
  }

  // Strip initials from both sides
  if (statSig.length > 0) {
    const sigSet = new Set(statSig)
    const sigCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length !== statSig.length) return false
      return psig.every(t => sigSet.has(t))
    })
    if (sigCands.length === 1) return sigCands[0]
  }

  // DB tokens ⊆ external tokens (unique match only)
  if (statSig.length > 0) {
    const sigSet = new Set(statSig)
    const subCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length === 0 || psig.length >= statSig.length) return false
      return psig.every(t => sigSet.has(t))
    })
    if (subCands.length === 1) return subCands[0]
  }

  // External tokens ⊆ DB tokens (unique match only)
  if (statSig.length > 0) {
    const superCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      if (psig.length <= statSig.length) return false
      return statSig.every(t => psig.includes(t))
    })
    if (superCands.length === 1) return superCands[0]
  }

  // Surname + name-prefix abbreviation (Leghe format)
  if (statTokens.length === 2) {
    const shortIdx = statTokens[0]!.length <= 3 ? 0 : statTokens[1]!.length <= 3 ? 1 : -1
    if (shortIdx !== -1) {
      const abbrev    = statTokens[shortIdx]!
      const surnameT  = statTokens[1 - shortIdx]!
      const prefixCands = candidates.filter(p => {
        const pts = p.normalized.split(' ').filter(Boolean)
        if (!pts.includes(surnameT)) return false
        return pts.some(t => t !== surnameT && t.startsWith(abbrev))
      })
      if (prefixCands.length === 1) return prefixCands[0]
    }
  }

  // Multiple abbreviations — "Esposito F. P." → "esposito f p"
  {
    const longTks  = statTokens.filter(t => t.length > 2)
    const shortTks = statTokens.filter(t => t.length <= 2)
    if (longTks.length > 0 && shortTks.length > 0) {
      const multiAbbrevCands = candidates.filter(p => {
        const pts = p.normalized.split(' ').filter(Boolean)
        if (!longTks.every(lt => pts.includes(lt))) return false
        const remaining = pts.filter(t => !longTks.includes(t))
        return shortTks.every(abbr => remaining.some(t => t.startsWith(abbr)))
      })
      if (multiAbbrevCands.length === 1) return multiAbbrevCands[0]
    }
  }

  // Apostrophe-concatenation — "N'Dicka" normalises to "n dicka" but DB
  // may store it as "ndicka" (apostrophe removed at import time).
  for (let i = 0; i < statTokens.length - 1; i++) {
    const tok = statTokens[i]
    if (tok && tok.length <= 2) {
      const altTokens = [
        ...statTokens.slice(0, i),
        tok + statTokens[i + 1]!,
        ...statTokens.slice(i + 2),
      ]
      const altNorm = altTokens.join(' ')
      const altSig  = altTokens.filter(t => t.length > 1)

      const exactAlt = candidates.find(p => p.normalized === altNorm)
      if (exactAlt) return exactAlt

      if (altSig.length > 0) {
        const altSuperCands = candidates.filter(p => {
          const psig = p.normalized.split(' ').filter(t => t.length > 1)
          if (psig.length <= altSig.length) return false
          return altSig.every(t => psig.includes(t))
        })
        if (altSuperCands.length === 1) return altSuperCands[0]
      }
    }
  }

  // Token intersection — "Zambo Anguissa" ↔ "Frank Anguissa"
  if (statSig.length >= 2) {
    const sigSet = new Set(statSig)
    const intersectCands = candidates.filter(p => {
      const psig = p.normalized.split(' ').filter(t => t.length > 1)
      return psig.some(t => sigSet.has(t))
    })
    if (intersectCands.length === 1) return intersectCands[0]
  }

  return undefined
}
