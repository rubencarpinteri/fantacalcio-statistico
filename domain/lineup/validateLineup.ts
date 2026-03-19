/**
 * Lineup validation — pure function, no I/O, fully testable.
 *
 * Validates a proposed lineup against the formation slots.
 * This function is called:
 *   1. Client-side for immediate feedback during lineup building.
 *   2. Server-side in the submit action before calling the DB RPC.
 *
 * The DB-level UNIQUE constraints (one player per submission,
 * one slot per submission) are the final enforcement layer.
 * This function provides human-readable errors before we reach the DB.
 */

import { playerSatisfiesSlot, type SlotLike, type PlayerLike } from './slotCompatibility'

export interface Assignment {
  playerId: string
  slotId: string
  isBench: boolean
  benchOrder: number | null
  assignedMantraRole: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface ValidateLineupParams {
  slots: SlotLike[]
  players: Map<string, PlayerLike>  // playerId → player
  assignments: Assignment[]
  isDraft: boolean
}

/**
 * Validates a full lineup assignment against the formation's slot requirements.
 *
 * For drafts: only warns about unfilled/incompatible slots (allows partial lineups).
 * For submissions: all starter slots must be filled with compatible players.
 */
export function validateLineup({
  slots,
  players,
  assignments,
  isDraft,
}: ValidateLineupParams): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const starterSlots = slots.filter((s) => !s.is_bench)
  const benchSlots = slots.filter((s) => s.is_bench)

  // Build a map of slotId → assignment for quick lookup
  const assignmentBySlot = new Map(
    assignments.map((a) => [a.slotId, a])
  )

  // Build set of assigned playerIds to detect duplicates
  const assignedPlayerIds = new Set<string>()

  // ---- Check for duplicate players ----
  for (const assignment of assignments) {
    if (assignedPlayerIds.has(assignment.playerId)) {
      const player = players.get(assignment.playerId)
      errors.push(
        `Giocatore duplicato: ${player?.full_name ?? assignment.playerId} è assegnato a più di uno slot.`
      )
    }
    assignedPlayerIds.add(assignment.playerId)
  }

  // ---- Validate starter slots ----
  for (const slot of starterSlots) {
    const assignment = assignmentBySlot.get(slot.id)

    if (!assignment) {
      const msg = `Slot titolare "${slot.slot_name}" non assegnato.`
      isDraft ? warnings.push(msg) : errors.push(msg)
      continue
    }

    const player = players.get(assignment.playerId)

    if (!player) {
      errors.push(`Slot "${slot.slot_name}": giocatore non trovato (ID: ${assignment.playerId}).`)
      continue
    }

    if (!playerSatisfiesSlot(player, slot)) {
      errors.push(
        `Slot "${slot.slot_name}": ${player.full_name} non è compatibile. ` +
          `I suoi ruoli [${player.mantra_roles.join(', ')}] non includono nessuno dei ruoli richiesti ` +
          `[${slot.allowed_mantra_roles.join(', ')}].`
      )
    }
  }

  // ---- Validate bench slots ----
  const benchAssignments = assignments.filter((a) => a.isBench)

  // Bench orders must be unique and sequential starting from 1
  if (benchAssignments.length > 0) {
    const orders = benchAssignments.map((a) => a.benchOrder).filter((o) => o != null)
    const uniqueOrders = new Set(orders)

    if (orders.length !== uniqueOrders.size) {
      errors.push('Ordine panchina: ci sono ordini duplicati. Ogni riserva deve avere un ordine univoco.')
    }

    for (const benchAss of benchAssignments) {
      if (benchAss.benchOrder == null) {
        const player = players.get(benchAss.playerId)
        errors.push(
          `Panchina: ${player?.full_name ?? benchAss.playerId} non ha un ordine di priorità assegnato.`
        )
        continue
      }

      // Validate compatibility for restricted bench slots (if slot exists for this bench position)
      const slot = benchSlots.find((s) => s.id === benchAss.slotId)
      if (slot) {
        const player = players.get(benchAss.playerId)
        if (player && !playerSatisfiesSlot(player, slot)) {
          warnings.push(
            `Panchina posizione ${benchAss.benchOrder}: ${player.full_name} potrebbe non essere compatibile con questo slot.`
          )
        }
      }
    }
  }

  // ---- Warn if bench is empty (not an error for drafts or final submissions) ----
  if (benchSlots.length > 0 && benchAssignments.length === 0) {
    warnings.push('La panchina è vuota. Considera di aggiungere riserve.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
