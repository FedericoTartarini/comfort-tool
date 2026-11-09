/**
 * Every physical quantity the app shows, in one table (ADR-0002 decision 2).
 *
 * The library publishes no such table, so the app owns this one. `key` is the
 * library's name for the quantity, the `ModelInfo` key wherever a model info
 * names it. Outside tests, this table is the one place a quantity's key is
 * written as a string, besides the share link that will carry it; every other
 * module holds the row itself, compared by identity, never the key.
 *
 * `kindBounds`, beside the kinds, holds the bound a kind is defined over,
 * whatever the model; the pre-call gate reads it (ADR-0002 decision 46).
 * `DEFAULT_ATMOSPHERIC_PRESSURE` is `p_atm`'s value until the user enters
 * another, written once here (ADR-0002 decision 49).
 *
 * Node strips this file's types natively (`erasableSyntaxOnly`), so
 * `eslint.config.js` imports it directly, without a build step, for the key
 * list of the lint rule that bans a quantity's key as a string literal.
 */
import type { Bound } from "jsthermalcomfort";

/**
 * The kind of value a quantity holds, which picks its units and its kind
 * bound. The last two are the library's `OutputField.kind` words: `label`, an
 * output whose value is a band's label (`tsv`'s "Neutral"), and `flag`, a
 * yes-or-no output.
 */
export type QuantityKind =
  | "temperature"
  | "temperatureDifference"
  | "airSpeed"
  | "percentage"
  | "metabolicRate"
  | "clothingInsulation"
  | "thermalSensation"
  | "pressure"
  | "atmosphericPressure"
  | "humidityRatio"
  | "angle"
  | "irradiance"
  | "fraction"
  | "label"
  | "flag";

/**
 * The bound a kind's values are defined over, whatever the model: a
 * percentage is 0 to 100. The library publishes no applicability on relative
 * humidity, so the pre-call gate reads this bound beside the model's own row
 * (ADR-0002 decision 46). A kind with no entry here has no bound of its own.
 */
export const kindBounds: Readonly<Partial<Record<QuantityKind, Bound>>> = {
  percentage: { min: 0, max: 100 },
  // No speed is below 0, and the switch back to air speed entry can give one
  // (ADR-0002 decision 54). A PMV model's info bounds `vr`, not an entered `v`,
  // and this bound alone holds the entered `v` (decision 84's note of
  // 2026-10-28, rule 2).
  airSpeed: { min: 0 },
  // No garment insulates below 0. A PMV model's info bounds the dynamic
  // clothing insulation it is given, not an entered `clo`, which this bound
  // alone holds, as the air speed's holds an entered `v`.
  clothingInsulation: { min: 0 },
  // Neither the library nor pythermalcomfort bounds `p_atm`; this is the
  // deployed tool's bound, one for every model (ADR-0002 decision 49).
  atmosphericPressure: { min: 30000, max: 110000 },
  // A share of a whole, 0 to 1 by definition: `SOLAR_GAIN_INFO` bounds no
  // transmittance or view fraction, and bounds the absorptivity inside it.
  fraction: { min: 0, max: 1 },
};

/**
 * The atmospheric pressure a session holds until the user enters another, in
 * Pa, the value the library defaults `p_atm` to. The library exports no
 * constant for it (ADR-0002 decision 49).
 */
export const DEFAULT_ATMOSPHERIC_PRESSURE = 101325;

export interface Quantity {
  /**
   * The name this quantity has in a model's `ModelInfo`, e.g. `"tdb"`, or,
   * for one no model info names, in the library's functions that take it,
   * e.g. `"hr"`, `hr_to_rh`'s.
   */
  readonly key: string;
  readonly kind: QuantityKind;
  /** Its text on screen, e.g. `"Dry-bulb air temperature"`. */
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
  // The session's atmospheric pressure, not a slot's: no entry mode names it
  // (ADR-0002 decision 49). Six of the library's model infos name it, none a
  // registered model's.
  p_atm: { key: "p_atm", kind: "atmosphericPressure", label: "Atmospheric pressure" },
  met: { key: "met", kind: "metabolicRate", label: "Metabolic rate" },
  clo: { key: "clo", kind: "clothingInsulation", label: "Clothing insulation" },
  // The clothing insulation corrected for the occupant's activity, which a
  // person enters under dynamic clothing entry (ADR-0002 decision 54). The
  // app's: a model info names `clo` alone, the key the entered clothing
  // insulation keeps, as every declaration's inputs and the presets name it.
  clo_dynamic: { key: "clo_dynamic", kind: "clothingInsulation", label: "Dynamic clothing insulation" },
  wme: { key: "wme", kind: "metabolicRate", label: "External work" },
  pmv: { key: "pmv", kind: "thermalSensation", label: "PMV" },
  ppd: { key: "ppd", kind: "percentage", label: "PPD" },
  tsv: { key: "tsv", kind: "label", label: "Thermal sensation" },
  category: { key: "category", kind: "label", label: "Category" },
  hi: { key: "hi", kind: "temperature", label: "Heat index" },
  utci: { key: "utci", kind: "temperature", label: "Universal Thermal Climate Index" },
  // UTCI's `derived` key: the library bounds `tr` by its difference from `tdb`.
  "tr - tdb": { key: "tr - tdb", kind: "temperatureDifference", label: "Mean radiant minus dry-bulb air temperature" },
  stress_category: { key: "stress_category", kind: "label", label: "Thermal stress category" },
  t_running_mean: { key: "t_running_mean", kind: "temperature", label: "Prevailing mean outdoor temperature" },
  tmp_cmf: { key: "tmp_cmf", kind: "temperature", label: "Comfort temperature" },
  tmp_cmf_80_low: { key: "tmp_cmf_80_low", kind: "temperature", label: "80% acceptability lower limit" },
  tmp_cmf_80_up: { key: "tmp_cmf_80_up", kind: "temperature", label: "80% acceptability upper limit" },
  tmp_cmf_90_low: { key: "tmp_cmf_90_low", kind: "temperature", label: "90% acceptability lower limit" },
  tmp_cmf_90_up: { key: "tmp_cmf_90_up", kind: "temperature", label: "90% acceptability upper limit" },
  acceptability_80: { key: "acceptability_80", kind: "flag", label: "80% acceptability" },
  acceptability_90: { key: "acceptability_90", kind: "flag", label: "90% acceptability" },
  compliance: { key: "compliance", kind: "flag", label: "Compliance" },
  // The input calculators' quantities, named by `CLO_TOUT_INFO` and
  // `SOLAR_GAIN_INFO` (ADR-0002 decision 75). The labels are the deployed
  // tool's words less their bounds and symbols, SHARP kept as the standard's
  // acronym (decision 75's note of 2026-10-15).
  tout: { key: "tout", kind: "temperature", label: "Outdoor air temperature at 6 a.m." },
  sol_altitude: { key: "sol_altitude", kind: "angle", label: "Solar altitude above horizon" },
  sharp: { key: "sharp", kind: "angle", label: "Solar horizontal angle relative to front of person (SHARP)" },
  sol_radiation_dir: { key: "sol_radiation_dir", kind: "irradiance", label: "Direct beam (normal) solar radiation" },
  sol_transmittance: { key: "sol_transmittance", kind: "fraction", label: "Total solar transmittance" },
  f_svv: { key: "f_svv", kind: "fraction", label: "Sky vault view fraction" },
  f_bes: { key: "f_bes", kind: "fraction", label: "Fraction of body exposed to sun" },
  asw: { key: "asw", kind: "fraction", label: "Average shortwave absorptivity" },
  erf: { key: "erf", kind: "irradiance", label: "ERF" },
  delta_mrt: { key: "delta_mrt", kind: "temperatureDifference", label: "Mean radiant temperature delta" },
} as const satisfies Record<string, Quantity>;

const byKey: Readonly<Record<string, Quantity>> = quantities;

/**
 * The table's row for a key the library hands over: a model's `_INFO` keys its
 * rows, and a run's outputs their `warnings`, by plain string, so a caller
 * reconciling either with this table looks the key up here and goes back to
 * comparing by identity. `undefined` for a key the table has no row for.
 */
export function quantityFor(key: string): Quantity | undefined {
  return byKey[key];
}
