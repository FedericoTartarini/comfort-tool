/**
 * Every physical quantity the app shows, in one table (ADR-0002 decision 2).
 *
 * The library publishes no such table, so the app owns this one. `key` is the
 * library's name for the quantity, the `ModelInfo` key wherever a model info
 * names it. Outside tests, this table is the one place a quantity's key is
 * written as a string, besides the share link that will carry it; every other
 * module holds the row itself, compared by identity, never the key.
 *
 * `kindBounds`, beside the kinds, holds the range a kind is defined over,
 * whatever the model; the pre-call gate reads it (ADR-0002 decision 46).
 *
 * Node strips this file's types natively (`erasableSyntaxOnly`), so
 * `eslint.config.js` imports it directly, without a build step, for the key
 * list of the lint rule that bans a quantity's key as a string literal.
 */
import type { Bound } from "jsthermalcomfort";

export type QuantityKind =
  | "temperature"
  | "airSpeed"
  | "percentage"
  | "metabolicRate"
  | "clothingInsulation"
  | "thermalSensation"
  | "pressure"
  | "humidityRatio"
  | "category"
  | "yesNo";

/**
 * The range a kind's values are defined over, whatever the model: a
 * percentage is 0 to 100. The library publishes no applicability on relative
 * humidity, so the pre-call gate reads this bound beside the model's own row
 * (ADR-0002 decision 46). A kind with no entry here has no bound of its own.
 */
export const kindBounds: Readonly<Partial<Record<QuantityKind, Bound>>> = {
  percentage: { min: 0, max: 100 },
};

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
  // ISO 7730's `derived` key, and the one vapour-pressure quantity: the
  // entered vapour pressure is `rh / 100 × p_sat(tdb)`, the same quantity as
  // the derived one (ADR-0002 decision 16).
  pa: { key: "pa", kind: "pressure", label: "Water vapour partial pressure" },
  met: { key: "met", kind: "metabolicRate", label: "Metabolic rate" },
  clo: { key: "clo", kind: "clothingInsulation", label: "Clothing insulation" },
  wme: { key: "wme", kind: "metabolicRate", label: "External work" },
  pmv: { key: "pmv", kind: "thermalSensation", label: "Predicted Mean Vote" },
  ppd: { key: "ppd", kind: "percentage", label: "Predicted Percentage of Dissatisfied" },
  tsv: { key: "tsv", kind: "category", label: "Thermal sensation" },
  category: { key: "category", kind: "category", label: "ISO 7730 category" },
  hi: { key: "hi", kind: "temperature", label: "Heat index" },
  stress_category: { key: "stress_category", kind: "category", label: "Thermal stress category" },
  t_running_mean: { key: "t_running_mean", kind: "temperature", label: "Prevailing mean outdoor temperature" },
  tmp_cmf: { key: "tmp_cmf", kind: "temperature", label: "Comfort temperature" },
  tmp_cmf_80_low: { key: "tmp_cmf_80_low", kind: "temperature", label: "80% acceptability lower limit" },
  tmp_cmf_80_up: { key: "tmp_cmf_80_up", kind: "temperature", label: "80% acceptability upper limit" },
  tmp_cmf_90_low: { key: "tmp_cmf_90_low", kind: "temperature", label: "90% acceptability lower limit" },
  tmp_cmf_90_up: { key: "tmp_cmf_90_up", kind: "temperature", label: "90% acceptability upper limit" },
  acceptability_80: { key: "acceptability_80", kind: "yesNo", label: "80% acceptability" },
  acceptability_90: { key: "acceptability_90", kind: "yesNo", label: "90% acceptability" },
  compliance: { key: "compliance", kind: "yesNo", label: "ASHRAE 55 compliance" },
} as const satisfies Record<string, Quantity>;

const byKey: Readonly<Record<string, Quantity>> = quantities;

/**
 * The table's row for a key the library hands over: a model's `_INFO` keys its
 * rows, and a result its `warnings`, by plain string, so a caller reconciling
 * either with this table looks the key up here and goes back to comparing by
 * identity. `undefined` for a key the table has no row for.
 */
export function quantityFor(key: string): Quantity | undefined {
  return byKey[key];
}
