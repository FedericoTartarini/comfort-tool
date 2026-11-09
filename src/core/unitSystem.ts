/**
 * Display-only choice of unit system. Canonical stored state is always SI and
 * the library is always called in SI (ADR §4.6); this object only decides how
 * `core/units.ts` renders a value.
 */
export interface UnitSystem {
  readonly id: string;
  readonly label: string;
}

export const unitSystem = {
  si: { id: "si", label: "SI" },
  ip: { id: "ip", label: "IP" },
} as const satisfies Record<string, UnitSystem>;
