import type { RatingClass } from '@/types/database.types'
import { DEFAULT_ROLE_MAP, AMBIGUOUS_ROLES } from './defaultRoleMap'

/**
 * Result of attempting to resolve a rating_class from Mantra roles.
 */
export type RatingClassResolution =
  | { resolved: true; ratingClass: RatingClass; source: 'default_map' | 'league_rule' }
  | { resolved: false; reason: 'ambiguous'; ambiguousRole: string }
  | { resolved: false; reason: 'unknown_role'; role: string }

/**
 * Resolves the appropriate rating_class for a player given their Mantra roles
 * and the league's role_classification_rules.
 *
 * This function is used at IMPORT/CREATION TIME ONLY — not at runtime
 * during scoring calculations. The resolved class must be stored explicitly
 * on league_players.rating_class.
 *
 * Resolution order:
 * 1. Check each role against DEFAULT_ROLE_MAP (unambiguous roles).
 * 2. For ambiguous roles (e.g. 'E'), check the league's rules.
 * 3. If still unresolved, return an error requiring admin confirmation.
 *
 * The primary_mantra_role (if provided) is checked first.
 *
 * @param mantraRoles      - Array of Mantra role strings from the player record.
 * @param primaryMantraRole - Optional primary role to prefer in resolution.
 * @param leagueRules       - Map of mantra_role → rating_class from league config.
 */
export function resolveRatingClass(
  mantraRoles: string[],
  primaryMantraRole: string | null | undefined,
  leagueRules: Record<string, RatingClass>
): RatingClassResolution {
  if (mantraRoles.length === 0) {
    return { resolved: false, reason: 'unknown_role', role: '(empty)' }
  }

  // Build ordered list: primary role first, then the rest
  const orderedRoles = primaryMantraRole
    ? [primaryMantraRole, ...mantraRoles.filter((r) => r !== primaryMantraRole)]
    : mantraRoles

  for (const role of orderedRoles) {
    // Unambiguous role — use default map
    const fromDefault = DEFAULT_ROLE_MAP[role]
    if (fromDefault !== undefined) {
      return { resolved: true, ratingClass: fromDefault, source: 'default_map' }
    }

    // Ambiguous role — check league rules
    if (AMBIGUOUS_ROLES.has(role)) {
      const fromRule = leagueRules[role]
      if (fromRule !== undefined) {
        return { resolved: true, ratingClass: fromRule, source: 'league_rule' }
      }
      // Ambiguous and no league rule configured
      return { resolved: false, reason: 'ambiguous', ambiguousRole: role }
    }

    // Role not in any known map
    return { resolved: false, reason: 'unknown_role', role }
  }

  return { resolved: false, reason: 'unknown_role', role: mantraRoles[0] ?? '(empty)' }
}

/**
 * Returns a human-readable description of an unresolved rating_class result.
 */
export function describeResolutionError(result: RatingClassResolution & { resolved: false }): string {
  if (result.reason === 'ambiguous') {
    return `Il ruolo "${result.ambiguousRole}" è ambiguo (DEF o MID). Configura la regola nella sezione Lega → Regole Ruoli, oppure specifica il rating class manualmente.`
  }
  return `Ruolo sconosciuto: "${result.role}". Verifica i ruoli Mantra del giocatore.`
}
