/**
 * Display-only choice of unit system. Canonical stored state is always SI and
 * the library is always called in SI (ADR §4.6); this object only decides how
 * `core/units.ts` renders a value.
 */
export interface UnitSystem {
  readonly id: string;
  readonly title: string;
}

export const unitSystem = {
  si: { id: "si", title: "SI" },
  ip: { id: "ip", title: "IP" },
} as const satisfies Record<string, UnitSystem>;
