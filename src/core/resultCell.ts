import { copy } from "$lib/text/copy";
import { colorForBand } from "./bandPalette";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import { resultValue } from "./modelRun";
import { quantityFor, type Quantity } from "./quantities";
import { displayUnitFor, numberWithUnit } from "./units";
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
  if (typeof value !== "number") {
    return copy.notAvailable;
  }
  return numberWithUnit(value, displayUnitFor(quantity, system));
}

/** One entry of the Compliance column: a classified output's category and its band's fill. */
export interface ClassifiedOutput {
  readonly quantity: Quantity;
  readonly category: string | number;
  /** As {@link colorForBand} gives it; `undefined` shows no swatch. */
  readonly color: string | undefined;
}

/**
 * The outputs `model`'s info classifies, in the info's order, each with the
 * category `result` carries and that category's colour from the output's own
 * classifier's palette (ADR-0002 decisions 8 and 60). Empty before the first run.
 */
export function classifiedOutputs(model: RegisteredModel, result: ModelResult | null): readonly ClassifiedOutput[] {
  if (!result) {
    return [];
  }
  return Object.entries(model.info.outputs).flatMap(([key, variable]) => {
    const classifier = variable.classifier;
    const quantity = classifier ? quantityFor(key) : undefined;
    if (!classifier || !quantity) {
      return [];
    }
    const category = resultValue(result, quantity);
    // Narrows the type: a classified output carries a category, never a boolean.
    if (category === undefined || typeof category === "boolean") {
      return [];
    }
    return [{ quantity, category, color: colorForBand(classifier, category) }];
  });
}
