import type { RatingClass } from '@/types/database.types'

/**
 * Default mapping from Mantra role string to rating_class.
 *
 * Roles listed here have an unambiguous mapping and are resolved
 * automatically during roster import if no explicit rating_class is provided.
 *
 * Roles NOT listed here (e.g. 'E') are AMBIGUOUS and require
 * explicit admin confirmation — either via the league's
 * role_classification_rules table (import-time default) or
 * manual selection during player creation.
 *
 * This map is used ONLY at import/creation time, never at runtime
 * during calculation. The rating_class stored on league_players is
 * the authoritative source for the engine.
 */
export const DEFAULT_ROLE_MAP: Readonly<Record<string, RatingClass>> = {
  Por: 'GK',
  Dc:  'DEF',
  Dd:  'DEF',
  Ds:  'DEF',
  // 'E' is intentionally absent — it is ambiguous (DEF or MID)
  M:   'MID',
  C:   'MID',
  W:   'MID',
  T:   'ATT',
  A:   'ATT',
  Pc:  'ATT',
}

/**
 * Roles that require league-level configuration to resolve.
 * These cannot be auto-mapped from DEFAULT_ROLE_MAP alone.
 */
export const AMBIGUOUS_ROLES: ReadonlySet<string> = new Set(['E'])

/**
 * All known Mantra roles in their canonical form.
 * Used for validation and UI dropdowns.
 */
export const ALL_MANTRA_ROLES: ReadonlyArray<string> = [
  'Por',
  'Dc',
  'Dd',
  'Ds',
  'E',
  'M',
  'C',
  'W',
  'T',
  'A',
  'Pc',
]
