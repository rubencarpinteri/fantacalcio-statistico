// All 11 standard Mantra formations with correct slot definitions
// Source: Leghe Fantacalcio official rulebook + substitution tables (PDF)
//
// For each slot:
//   allowed_mantra_roles  = roles that fill the slot with NO penalty ("ok" in table)
//   extended_mantra_roles = roles that substitute with -1 penalty ("-1" and "-1*" in table)
//
// Special case — 4-1-4-1:
//   W cannot substitute C/T or T slots (W omitted from extended)
//   T cannot substitute E/W or W slots (T omitted from extended)

export type SlotPreset = {
  slot_name: string
  slot_order: number
  allowed_mantra_roles: string[]
  extended_mantra_roles: string[]
  is_bench: boolean
  bench_order: number | null
}

export type FormationPreset = {
  name: string
  description: string
  slots: SlotPreset[]
}

const ALL_ROLES = ['Por', 'Dc', 'B', 'Dd', 'Ds', 'E', 'M', 'C', 'T', 'W', 'A', 'Pc']

const benchSlots = (): SlotPreset[] =>
  Array.from({ length: 12 }, (_, i) => ({
    slot_name: 'Panchina',
    slot_order: 12 + i + 1,
    allowed_mantra_roles: ALL_ROLES,
    extended_mantra_roles: [],
    is_bench: true,
    bench_order: i + 1,
  }))

// ── Field slot builders ────────────────────────────────────────────────────────

const por  = (o: number): SlotPreset => ({ slot_name: 'Por',   slot_order: o, allowed_mantra_roles: ['Por'],       extended_mantra_roles: [],                                           is_bench: false, bench_order: null })
const dc   = (o: number): SlotPreset => ({ slot_name: 'Dc',    slot_order: o, allowed_mantra_roles: ['Dc'],        extended_mantra_roles: ['Dd', 'Ds', 'B'],                            is_bench: false, bench_order: null })
const dcb  = (o: number): SlotPreset => ({ slot_name: 'Dc/B',  slot_order: o, allowed_mantra_roles: ['Dc', 'B'],   extended_mantra_roles: ['Dd', 'Ds'],                                 is_bench: false, bench_order: null })
const dd   = (o: number): SlotPreset => ({ slot_name: 'Dd',    slot_order: o, allowed_mantra_roles: ['Dd'],        extended_mantra_roles: ['Ds', 'Dc', 'B'],                            is_bench: false, bench_order: null })
const ds   = (o: number): SlotPreset => ({ slot_name: 'Ds',    slot_order: o, allowed_mantra_roles: ['Ds'],        extended_mantra_roles: ['Dd', 'Dc', 'B'],                            is_bench: false, bench_order: null })
const e    = (o: number): SlotPreset => ({ slot_name: 'E',     slot_order: o, allowed_mantra_roles: ['E'],         extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'M'],                 is_bench: false, bench_order: null })
const m    = (o: number): SlotPreset => ({ slot_name: 'M',     slot_order: o, allowed_mantra_roles: ['M'],         extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E'],                 is_bench: false, bench_order: null })
const mc   = (o: number): SlotPreset => ({ slot_name: 'M/C',   slot_order: o, allowed_mantra_roles: ['M', 'C'],    extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E'],                 is_bench: false, bench_order: null })
const c    = (o: number): SlotPreset => ({ slot_name: 'C',     slot_order: o, allowed_mantra_roles: ['C'],         extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'],           is_bench: false, bench_order: null })
const ew   = (o: number): SlotPreset => ({ slot_name: 'E/W',   slot_order: o, allowed_mantra_roles: ['E', 'W'],    extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'M', 'C', 'T'],      is_bench: false, bench_order: null })
const t    = (o: number): SlotPreset => ({ slot_name: 'T',     slot_order: o, allowed_mantra_roles: ['T'],         extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W'], is_bench: false, bench_order: null })
const ta   = (o: number): SlotPreset => ({ slot_name: 'T/A',   slot_order: o, allowed_mantra_roles: ['T', 'A'],    extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W'], is_bench: false, bench_order: null })
const wa   = (o: number): SlotPreset => ({ slot_name: 'W/A',   slot_order: o, allowed_mantra_roles: ['W', 'A'],    extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'T'], is_bench: false, bench_order: null })
const apc  = (o: number): SlotPreset => ({ slot_name: 'A/Pc',  slot_order: o, allowed_mantra_roles: ['A', 'Pc'],   extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'T', 'W'], is_bench: false, bench_order: null })

// Unique slots used only in specific formations
const eWDef3  = (o: number): SlotPreset => ({ slot_name: 'E/W',   slot_order: o, allowed_mantra_roles: ['E', 'W'],  extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'M', 'C', 'T'], is_bench: false, bench_order: null })
const ct      = (o: number): SlotPreset => ({ slot_name: 'C/T',   slot_order: o, allowed_mantra_roles: ['C', 'T'],  extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'],       is_bench: false, bench_order: null }) // 4-1-4-1: W excluded
const tNo4141 = (o: number): SlotPreset => ({ slot_name: 'T',     slot_order: o, allowed_mantra_roles: ['T'],       extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],  is_bench: false, bench_order: null }) // 4-1-4-1: W excluded
const ewNo4141= (o: number): SlotPreset => ({ slot_name: 'E/W',   slot_order: o, allowed_mantra_roles: ['E', 'W'],  extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'M', 'C'],       is_bench: false, bench_order: null }) // 4-1-4-1: T excluded
const w       = (o: number): SlotPreset => ({ slot_name: 'W',     slot_order: o, allowed_mantra_roles: ['W'],       extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],  is_bench: false, bench_order: null }) // 4-1-4-1: T excluded
const tapcSlot= (o: number): SlotPreset => ({ slot_name: 'T/A/Pc',slot_order: o, allowed_mantra_roles: ['T', 'A', 'Pc'], extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W'], is_bench: false, bench_order: null })
const wt      = (o: number): SlotPreset => ({ slot_name: 'W/T',   slot_order: o, allowed_mantra_roles: ['W', 'T'],  extended_mantra_roles: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],  is_bench: false, bench_order: null })

// ── Formation presets ──────────────────────────────────────────────────────────

export const MANTRA_FORMATION_PRESETS: FormationPreset[] = [
  {
    name: '3-4-3',
    description: 'Difesa a 3, centrocampo a 4, tridente offensivo',
    slots: [por(1), dc(2), dc(3), dcb(4), e(5), mc(6), c(7), e(8), wa(9), apc(10), wa(11), ...benchSlots()],
  },
  {
    name: '3-4-1-2',
    description: 'Difesa a 3, centrocampo a 4, trequartista e 2 punte',
    slots: [por(1), dc(2), dc(3), dcb(4), e(5), mc(6), c(7), e(8), t(9), apc(10), apc(11), ...benchSlots()],
  },
  {
    name: '3-4-2-1',
    description: 'Difesa a 3, centrocampo a 4, 2 trequartisti e punta',
    slots: [por(1), dc(2), dc(3), dcb(4), e(5), m(6), mc(7), eWDef3(8), t(9), ta(10), apc(11), ...benchSlots()],
  },
  {
    name: '3-5-2',
    description: 'Difesa a 3, centrocampo a 5, 2 punte',
    slots: [por(1), dc(2), dc(3), dcb(4), e(5), m(6), mc(7), c(8), ew(9), apc(10), apc(11), ...benchSlots()],
  },
  {
    name: '3-5-1-1',
    description: 'Difesa a 3, centrocampo a 5, trequartista e punta',
    slots: [por(1), dc(2), dc(3), dcb(4), ew(5), m(6), m(7), c(8), ew(9), ta(10), apc(11), ...benchSlots()],
  },
  {
    name: '4-3-3',
    description: 'Difesa a 4, centrocampo a 3, tridente offensivo',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), m(6), mc(7), c(8), wa(9), apc(10), wa(11), ...benchSlots()],
  },
  {
    name: '4-3-1-2',
    description: 'Difesa a 4, centrocampo a 3, trequartista e 2 punte',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), m(6), mc(7), c(8), t(9), tapcSlot(10), apc(11), ...benchSlots()],
  },
  {
    name: '4-4-2',
    description: 'Difesa a 4, centrocampo a 4, 2 punte',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), e(6), mc(7), c(8), ew(9), apc(10), apc(11), ...benchSlots()],
  },
  {
    name: '4-1-4-1',
    description: 'Difesa a 4, mediano davanti la difesa, 4 centrocampisti, punta',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), m(6), ct(7), tNo4141(8), ewNo4141(9), w(10), apc(11), ...benchSlots()],
  },
  {
    name: '4-4-1-1',
    description: 'Difesa a 4, centrocampo a 4, trequartista e punta',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), ew(6), m(7), c(8), ew(9), ta(10), apc(11), ...benchSlots()],
  },
  {
    name: '4-2-3-1',
    description: 'Difesa a 4, doppio mediano, trequartisti e punta',
    slots: [por(1), ds(2), dc(3), dc(4), dd(5), m(6), mc(7), wt(8), t(9), wa(10), apc(11), ...benchSlots()],
  },
]
