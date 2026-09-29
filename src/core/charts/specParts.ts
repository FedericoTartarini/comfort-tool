/**
 * The pieces both spec builders assemble: the slot marker, a Comfort zone, an
 * axis, and the samples of a range. Each is written here once, so the
 * psychrometric and the dynamic chart draw them alike.
 */
import { chartInk } from "$lib/core/bandPalette";
import type { Range } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import { labelWithUnit, type DisplayUnit } from "$lib/core/units";
import type { AxisSpec, LegendEntry, PathTrace, PointTrace } from "./chartSpec";

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

/**
 * A Comfort zone's polygon through `x` and `y`, already in display units, and
 * the legend entry that names it. Zone `level` of `levels` nested ones, 0 the
 * outermost, is filled by that level and outlined in the zone line. Its fill
 * cannot say where the pointer is inside it, so it never captures the pointer.
 */
export function zoneFor(
  label: string,
  x: readonly number[],
  y: readonly number[],
  level: number,
  levels: number,
): { readonly trace: PathTrace; readonly legendEntry: LegendEntry } {
  const fill = chartInk.zoneFill(level, levels);
  return {
    trace: { kind: "path", x, y, color: chartInk.zoneLine, width: chartInk.zoneLineWidth, fill, hover: "off", label },
    legendEntry: { label, swatch: "fill", color: fill },
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
