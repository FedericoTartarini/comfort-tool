import { copy } from "$lib/text/copy";
import type { ViolationRow } from "./applicability";
import { colorForBand, letteringOn } from "./bandPalette";
import type { ModelResult, RegisteredModel } from "./modelDeclaration";
import { resultValue } from "./modelRun";
import type { Quantity } from "./quantities";
import { displayUnitFor, numberWithUnit } from "./units";
import type { UnitSystem } from "./unitSystem";

/** A Band badge's fill and the lettering that reads on it. */
interface BandPaint {
  readonly fill: string;
  readonly lettering: string;
}

/**
 * One cell of the results table: text, or a Band badge (GLOSSARY.md) holding
 * its band's label as the library writes it, and its paint, `undefined` for a
 * band its palette leaves unpainted, ISO 7730's "none", which the table
 * outlines.
 */
export type ResultCell =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "band"; readonly label: string; readonly paint: BandPaint | undefined };

/**
 * What the results table shows for `quantity`, one column of `model`'s table:
 * a classified output's category as a Band badge, read against the output's
 * own classifier in the model info and filled from its palette (ADR-0002
 * decision 85, rules 2 and 3); a boolean as "Yes" or "No", the same in both
 * unit systems; a finite number in its display unit; a dash for anything else,
 * a NaN or a category its classifier does not name among them. `violations`
 * are the rows the result shows broken: while there is one, a boolean reads
 * the dash too, as pythermalcomfort's NaN under its own gate (ADR-0002
 * decision 77, rule 2), which the row's limits icon explains (decision 85,
 * rule 5); a Band badge stays.
 */
export function formatResultCell(
  model: RegisteredModel,
  result: ModelResult | null,
  quantity: Quantity,
  system: UnitSystem,
  violations: readonly ViolationRow[],
): ResultCell {
  const value = result ? resultValue(result, quantity) : undefined;
  const classifier = model.info.outputs[quantity.key]?.classifier;
  if (classifier) {
    // `labels` holds strings; a NaN or a boolean is no label, and so the dash.
    if (typeof value !== "string" || !classifier.labels.includes(value)) {
      return textCell(copy.notAvailable);
    }
    const fill = colorForBand(classifier, value);
    return { kind: "band", label: value, paint: fill === undefined ? undefined : { fill, lettering: letteringOn(fill) } };
  }
  if (typeof value === "boolean") {
    if (violations.length > 0) {
      return textCell(copy.notAvailable);
    }
    return textCell(value ? copy.yes : copy.no);
  }
  if (typeof value !== "number") {
    return textCell(copy.notAvailable);
  }
  return textCell(numberWithUnit(value, displayUnitFor(quantity, system)));
}

function textCell(text: string): ResultCell {
  return { kind: "text", text };
}
