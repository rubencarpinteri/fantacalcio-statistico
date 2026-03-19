/**
 * Slot compatibility — pure functions, no I/O.
 *
 * A player satisfies a slot if at least one of the player's mantra_roles
 * appears in the slot's allowed_mantra_roles list.
 *
 * This is the only rule enforced by the system. No hardcoded Mantra
 * slot logic exists. All slot definitions come from the database and
 * are configured by the league admin.
 */

export interface SlotLike {
  id: string
  slot_name: string
  allowed_mantra_roles: string[]
  is_bench: boolean
  bench_order: number | null
}

export interface PlayerLike {
  id: string
  full_name: string
  mantra_roles: string[]
}

/**
 * Returns true if the player can play in the given slot.
 */
export function playerSatisfiesSlot(player: PlayerLike, slot: SlotLike): boolean {
  return player.mantra_roles.some((role) => slot.allowed_mantra_roles.includes(role))
}

/**
 * Returns all slots from the formation that the player is compatible with.
 */
export function compatibleSlotsForPlayer(
  player: PlayerLike,
  slots: SlotLike[]
): SlotLike[] {
  return slots.filter((slot) => playerSatisfiesSlot(player, slot))
}

/**
 * Returns all players from the roster that can fill the given slot.
 */
export function compatiblePlayersForSlot(
  slot: SlotLike,
  players: PlayerLike[]
): PlayerLike[] {
  return players.filter((player) => playerSatisfiesSlot(player, slot))
}

/**
 * For each starter slot in the formation, returns the intersection role
 * that the assigned player uses for that slot (the first matching role).
 * Returns null if no match (should not happen after validation).
 */
export function resolveAssignedRole(
  player: PlayerLike,
  slot: SlotLike
): string | null {
  return (
    player.mantra_roles.find((role) => slot.allowed_mantra_roles.includes(role)) ?? null
  )
}
