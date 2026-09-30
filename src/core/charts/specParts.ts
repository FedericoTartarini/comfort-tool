/**
 * The pieces both spec builders assemble: the slot marker, a Comfort zone, an
 * axis, the samples of a range, and what the slots of a request share. Each is
 * written here once, so the psychrometric and the dynamic chart draw them
 * alike.
 */
import { chartInk } from "$lib/core/bandPalette";
import type { Range } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import type { SlotBadge, SlotHue } from "$lib/core/slotBadge";
import { labelWithUnit, type DisplayUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartRequest, ChartedSlot } from "./chartRequest";
import type { AxisSpec, ContourZoneTrace, LegendEntry, PathTrace, PointTrace } from "./chartSpec";

/**
 * `label`, a legend entry's or a readout line's, as the chart names it for
 * `charted`: prefixed with the slot's name while the request draws more than
 * one slot, so three zones of one kind can be told apart (ADR-0002 decision
 * 50), and as it is while it draws one, so a session whose Compare is off
 * reads as it did.
 */
export function labelFor(request: ChartRequest, charted: ChartedSlot, label: string): string {
  return request.slots.length > 1 ? copy.slotEntry(charted.name, label) : label;
}

/**
 * A slot's marker at (`x`, `y`), already in display units, in the slot's hue,
 * and the legend entry that names it by the slot. Chrome, so it never
 * captures the pointer.
 */
export function markerFor(
  badge: SlotBadge,
  x: number,
  y: number,
): { readonly trace: PointTrace; readonly legendEntry: LegendEntry } {
  const color = badge.hue.marker;
  return {
    trace: { kind: "point", x, y, color, hover: "off", label: badge.name },
    legendEntry: { label: badge.name, swatch: "marker", color },
  };
}

/**
 * A Comfort zone's polygon through `x` and `y`, already in display units, and
 * the legend entry that names it. Zone `level` of `levels` nested ones, 0 the
 * outermost, is filled in `hue` by that level and outlined in the hue's zone
 * line. Its fill cannot say where the pointer is inside it, so it never
 * captures the pointer.
 */
export function zoneFor(
  label: string,
  x: readonly number[],
  y: readonly number[],
  level: number,
  levels: number,
  hue: SlotHue,
): { readonly trace: PathTrace; readonly legendEntry: LegendEntry } {
  const fill = chartInk.zoneFill(hue, level, levels);
  return {
    trace: { kind: "path", x, y, color: hue.zoneLine, width: chartInk.zoneLineWidth, fill, hover: "off", label },
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

/**
 * A Comfort zone cut from a scanned field `z` over `x` and `y`, already in
 * display units: the cells between `lower` and `upper`, in `z`'s own unit.
 * Filled and outlined as {@link zoneFor} fills and outlines a polygon, and
 * like it, it never captures the pointer.
 */
export function contourZoneFor(
  label: string,
  field: Pick<ContourZoneTrace, "x" | "y" | "z" | "lower" | "upper">,
  level: number,
  levels: number,
  hue: SlotHue,
): { readonly trace: ContourZoneTrace; readonly legendEntry: LegendEntry } {
  const fill = chartInk.zoneFill(hue, level, levels);
  return {
    trace: { kind: "contourZone", ...field, color: hue.zoneLine, width: chartInk.zoneLineWidth, fill, hover: "off", label },
    legendEntry: { label, swatch: "fill", color: fill },
  };
}
