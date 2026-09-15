import { clo_typical_ensembles_table, met_typical_tasks } from "jsthermalcomfort";
import { formatNumber } from "./numberFormat";
import { quantities, type Quantity } from "./quantities";

/**
 * A named point on a quantity's scale, read off one of the library's
 * reference tables (ADR-0002 decision 20). SI value: `met` and `clo` are
 * dimensionless, so SI and IP show the same number.
 */
export interface Preset {
  readonly label: string;
  readonly value: number;
}

function presetsFromTable(table: Readonly<Record<string, number>>): readonly Preset[] {
  return Object.entries(table).map(([label, value]) => ({ label, value }));
}

const presetsByQuantity = new Map<Quantity, readonly Preset[]>([
  [quantities.met, presetsFromTable(met_typical_tasks)],
  [quantities.clo, presetsFromTable(clo_typical_ensembles_table)],
]);

/** The presets for a quantity, in the library's order, or `undefined` if it has none. */
export function presetsFor(quantity: Quantity): readonly Preset[] | undefined {
  return presetsByQuantity.get(quantity);
}

/**
 * The preset whose value formats to the same text as `value` (ADR §4.6) —
 * the comparison the user sees, not a tolerance constant.
 */
export function matchingPreset(quantity: Quantity, value: number): Preset | undefined {
  const formatted = formatNumber(value);
  return presetsFor(quantity)?.find((preset) => formatNumber(preset.value) === formatted);
}
