import { copy } from "$lib/text/copy";
import type { ModelResult } from "./modelDeclaration";
import { resultValue } from "./modelRun";
import { formatNumber } from "./numberFormat";
import type { Quantity } from "./quantities";
import { displayUnitFor, valueWithUnit } from "./units";
import type { UnitSystem } from "./unitSystem";

/**
 * What the results table shows for `quantity`: a boolean as "Yes" or "No",
 * the same in both unit systems; a finite number in its display unit; a dash
 * for anything else — a category is read in the Compliance column, not here.
 */
export function formatResultCell(result: ModelResult | null, quantity: Quantity, system: UnitSystem): string {
  const value = result ? resultValue(result, quantity) : undefined;
  if (typeof value === "boolean") {
    return value ? copy.yes : copy.no;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return copy.notAvailable;
  }
  const unit = displayUnitFor(quantity, system);
  return valueWithUnit(formatNumber(unit.fromSi(value)), unit);
}
