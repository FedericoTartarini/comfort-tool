/**
 * The small pieces every spec builder assembles: the slot marker, a label as
 * its slot names it, a Comfort zone's ink, an axis, the samples of a range and
 * a readout's lines. Each is written here once, so the
 * psychrometric, the dynamic and the adaptive chart draw them alike; the scan
 * is `scan.ts`'s and its paint `fieldPaint.ts`'s.
 */
import { chartInk } from "$lib/core/bandPalette";
import type { Range } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import type { SlotBadge } from "$lib/core/slotBadge";
import { labelWithUnit, numberWithUnit, type DisplayUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartedSlot } from "./chartRequest";
import type { AxisSpec, LegendEntry, PointTrace } from "./chartSpec";

/**
 * `label`, a legend entry's or a readout line's, as the chart names it for
 * `charted`: prefixed with the slot's name where the slot has one, and as it
 * is otherwise.
 */
export function labelFor(charted: ChartedSlot, label: string): string {
  return charted.name === undefined ? label : copy.slotEntry(charted.name, label);
}

/** A Comfort zone's paint: its fill's colour, its line's colour and width, and its legend entry. */
export interface ZoneInk {
  readonly fill: string;
  readonly line: string;
  readonly lineWidth: number;
  readonly legendEntry: LegendEntry;
}

/**
 * How a chart paints a Comfort zone of `charted` whose own
 * label is `zoneLabel`, level `level` of `levels` nested zones, 0 the
 * outermost (ADR-0002 decision 71); the legend names it as {@link labelFor}
 * does. However many slots the chart draws, the zone is filled in the slot's
 * hue, the opacity rising inwards, outlined in the hue at the zone line
 * width, and named with a fill swatch. Where several slots' fills overlap the
 * colour is the compositing's, which the legend does not name; every
 * boundary keeps its slot's hue.
 */
export function zoneInkFor(charted: ChartedSlot, zoneLabel: string, level: number, levels: number): ZoneInk {
  const label = labelFor(charted, zoneLabel);
  const fill = chartInk.zoneFill(charted.hue, level, levels);
  return {
    fill,
    line: chartInk.zoneLine(charted.hue),
    lineWidth: chartInk.zoneLineWidth,
    legendEntry: { label, swatch: "fill", color: fill },
  };
}

/**
 * A slot's marker at (`x`, `y`), already in display units, in the slot's hue,
 * and the legend entry that names it by the slot, or as the one input where
 * the slot has no name. Chrome, so it never captures the pointer.
 */
export function markerFor(
  badge: SlotBadge,
  x: number,
  y: number,
): { readonly trace: PointTrace; readonly legendEntry: LegendEntry } {
  const color = chartInk.marker(badge.hue);
  const label = badge.name ?? copy.unnamedMarker;
  return {
    trace: { kind: "point", x, y, color, hover: "off", label },
    legendEntry: { label, swatch: "marker", color },
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
 * One line of a hover readout, `Label: value unit`, the SI `value` shown as
 * the results table shows it: in `unit`, formatted, and a dash where there is
 * no number.
 */
export function readoutLine(quantity: Quantity, unit: DisplayUnit, value: number): string {
  return `${quantity.label}: ${numberWithUnit(value, unit)}`;
}
