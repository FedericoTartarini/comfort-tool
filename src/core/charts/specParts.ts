/**
 * The pieces both spec builders assemble: the slot marker, an axis, and the
 * samples of a range. Each is written here once, so the psychrometric and the
 * dynamic chart draw them alike.
 */
import { chartInk } from "$lib/core/bandPalette";
import type { Range } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { labelWithUnit, type DisplayUnit } from "$lib/core/units";
import type { AxisSpec, LegendEntry, PointTrace } from "./chartSpec";

/**
 * A slot's marker at (`x`, `y`), already in display units, and the legend
 * entry that names it. Chrome, so it never captures the pointer.
 */
export function markerFor(
  slotLabel: string,
  x: number,
  y: number,
): { readonly trace: PointTrace; readonly legendEntry: LegendEntry } {
  return {
    trace: { kind: "point", x, y, color: chartInk.marker, hover: "off", label: slotLabel },
    legendEntry: { label: slotLabel, swatch: "marker", color: chartInk.marker },
  };
}

/** The axis for `quantity` drawn across `range`: titled with `unit`, and the SI range shown in it. */
export function axisFor(quantity: Quantity, unit: DisplayUnit, range: Range): AxisSpec {
  return { title: labelWithUnit(quantity, unit), range: [unit.fromSi(range.min), unit.fromSi(range.max)] };
}

/** `count` evenly spaced values across `range`, both ends included, in SI. */
export function samples(range: Range, count: number): readonly number[] {
  const step = (range.max - range.min) / (count - 1);
  return Array.from({ length: count }, (_, index) => range.min + index * step);
}
