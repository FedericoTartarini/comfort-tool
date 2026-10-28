import { copy } from "$lib/text/copy";
import type { ViolationRow } from "./applicability";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import { resultValue } from "./modelRun";
import type { Quantity } from "./quantities";
import { displayUnitFor, numberWithUnit } from "./units";
import type { UnitSystem } from "./unitSystem";

/**
 * What the results table shows for `quantity`, one column of `model`'s table:
 * a classified output's category as its band's label, read against the
 * output's own classifier in the model info (ADR-0002 decision 85, rule 1); a
 * boolean as "Yes" or "No", the same in both unit systems; a finite number in
 * its display unit; a dash for anything else, a NaN or a category its
 * classifier does not name among them. `violations` are the rows the result
 * shows broken: while there is one, a boolean reads the dash too, as
 * pythermalcomfort's NaN under its own gate (ADR-0002 decision 77, rule 2),
 * which the row's limits button explains (decision 84, rule 8); a category
 * stays.
 */
export function formatResultCell(
  model: RegisteredModel,
  result: ModelResult | null,
  quantity: Quantity,
  system: UnitSystem,
  violations: readonly ViolationRow[],
): string {
  const value = result ? resultValue(result, quantity) : undefined;
  const classifier = model.info.outputs[quantity.key]?.classifier;
  if (classifier) {
    // `labels` holds strings; a NaN or a boolean is no label, and so the dash.
    return typeof value === "string" && classifier.labels.includes(value) ? value : copy.notAvailable;
  }
  if (typeof value === "boolean") {
    if (violations.length > 0) {
      return copy.notAvailable;
    }
    return value ? copy.yes : copy.no;
  }
  if (typeof value !== "number") {
    return copy.notAvailable;
  }
  return numberWithUnit(value, displayUnitFor(quantity, system));
}
