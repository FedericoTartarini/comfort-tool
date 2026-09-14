/**
 * Every physical quantity the app shows, in one table (ADR-0002 decision 2).
 *
 * The fork's `jsthermalcomfort/io` quantities went with the fork; the main
 * repository publishes no such table, so the app owns this one. `key` is a
 * registered model's `ModelInfo` key — the one place a quantity's wire string
 * legitimately appears outside `core/shareLink.ts` — and every other module
 * holds the row itself, compared by identity, never the key.
 *
 * Node strips this file's types natively (`erasableSyntaxOnly`), so
 * `eslint.config.js` imports it directly to build the wire-string lint rule's
 * key list without a build step.
 */
export type QuantityKind =
  | "temperature"
  | "airSpeed"
  | "percentage"
  | "metabolicRate"
  | "clothingInsulation"
  | "thermalSensation"
  | "pressure"
  | "humidityRatio"
  | "category";

export interface Quantity {
  /** The name this quantity has in a model's `ModelInfo`, e.g. `"tdb"`. */
  readonly key: string;
  readonly kind: QuantityKind;
  /** Human-readable name, e.g. `"Dry-bulb air temperature"`. */
  readonly label: string;
}

export const quantities = {
  tdb: { key: "tdb", kind: "temperature", label: "Dry-bulb air temperature" },
  tr: { key: "tr", kind: "temperature", label: "Mean radiant temperature" },
  operative_tmp: { key: "operative_tmp", kind: "temperature", label: "Operative temperature" },
  v: { key: "v", kind: "airSpeed", label: "Air speed" },
  vr: { key: "vr", kind: "airSpeed", label: "Relative air speed" },
  rh: { key: "rh", kind: "percentage", label: "Relative humidity" },
  hr: { key: "hr", kind: "humidityRatio", label: "Humidity ratio" },
  dew_point_tmp: { key: "dew_point_tmp", kind: "temperature", label: "Dew-point temperature" },
  wet_bulb_tmp: { key: "wet_bulb_tmp", kind: "temperature", label: "Wet-bulb temperature" },
  // The ISO `derived` key, not the fork's `p_vap`: `rh / 100 × p_sat(tdb)` is
  // the same quantity as the fork's water vapour partial pressure (ADR-0002
  // decision 2), so it keeps the fork's label.
  pa: { key: "pa", kind: "pressure", label: "Water vapour partial pressure" },
  met: { key: "met", kind: "metabolicRate", label: "Metabolic rate" },
  clo: { key: "clo", kind: "clothingInsulation", label: "Clothing insulation" },
  wme: { key: "wme", kind: "metabolicRate", label: "External work" },
  pmv: { key: "pmv", kind: "thermalSensation", label: "Predicted Mean Vote" },
  ppd: { key: "ppd", kind: "percentage", label: "Predicted Percentage of Dissatisfied" },
  tsv: { key: "tsv", kind: "category", label: "Thermal sensation" },
  hi: { key: "hi", kind: "temperature", label: "Heat index" },
  stress_category: { key: "stress_category", kind: "category", label: "Heat stress category" },
} as const satisfies Record<string, Quantity>;

const byKey: Readonly<Record<string, Quantity>> = quantities;

/**
 * The table's row for a key returned by the library — a `Measure` or an
 * `ApplicabilityLimit` still carries the library's own Quantity object, not
 * this table's, so a caller reconciling the two looks it up by key here and
 * goes back to comparing by identity. `undefined` for a key the table has no
 * row for.
 */
export function quantityFor(key: string): Quantity | undefined {
  return byKey[key];
}
