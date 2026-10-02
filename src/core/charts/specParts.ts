/**
 * The pieces both spec builders assemble: the scan, the slot marker, a Comfort
 * zone, an axis, the samples of a range, what the slots of a request share, a
 * Band list's paint and a readout's lines. Each is written here once, so the
 * psychrometric and the dynamic chart draw them alike.
 */
import { classifyFromBins } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import type { BandList } from "$lib/core/bands";
import type { Range, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { withEnteredValues, withEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import type { SlotBadge, SlotHue } from "$lib/core/slotBadge";
import { labelWithUnit, numberWithUnit, type DisplayUnit } from "$lib/core/units";
import { copy } from "$lib/text/copy";
import type { ChartRequest, ChartedSlot } from "./chartRequest";
import type { AxisSpec, BandFill, BandTrace, ContourZoneTrace, LegendEntry, PathTrace, PointTrace } from "./chartSpec";

/**
 * One count for every axis, every model and both scanned charts: 51 points are
 * 50 intervals, so the SI steps are round (ADR-0002 decision 28).
 */
export const GRID = 51;

/** A quantity a scan sweeps, and the range, in SI, it is swept across. */
export interface Sweep {
  readonly quantity: Quantity;
  readonly range: Range;
}

/**
 * What every slot's scan on one chart shares (ADR-0002 decision 61): the
 * model and the output it scans, the two quantities swept, the entry modes
 * the slot is converted into, and the atmospheric pressure. A slot's scan is
 * a function of this and the slot alone, so the outputs can keep one per slot
 * and an edit to one slot scans that slot and no other
 * (`state/compute.svelte.ts`). Each chart builds its own frame; the scan is
 * the same for both.
 */
export interface ScanFrame {
  readonly model: RegisteredModel;
  readonly output: Quantity;
  readonly x: Sweep;
  readonly y: Sweep;
  readonly entryModes: ValueEntryModes;
  readonly atmosphericPressure: number;
}

/**
 * One slot's scan: the model's own number for the frame's output at every cell of
 * the `GRID × GRID` field, `[yIndex][xIndex]`, in the output's SI unit.
 */
export type ScannedField = readonly (readonly number[])[];

/**
 * `slot` scanned in `frame`: converted into the frame's entry modes first, by
 * the entry-mode change's own conversion, so a slot entered in another mode
 * is swept on the quantities it would hold after that change; then each cell
 * entered over the two swept quantities, as the person enters a value, and
 * the model run. A swept humidity quantity puts the cell in that humidity's
 * entry mode, so the slot's own conversion gives the cell its relative
 * humidity and the scan converts nothing itself. Every cell is run: one the
 * model has no number for is `NaN`.
 */
export function scannedField(frame: ScanFrame, slot: Slot): ScannedField {
  const { model, output, x, y, atmosphericPressure } = frame;
  const converted = withEntryModes(slot, frame.entryModes, model);
  const xValues = samples(x.range, GRID);
  return samples(y.range, GRID).map((yValue) =>
    xValues.map((xValue) => {
      const cell = withEnteredValues(converted, new Map([
        [x.quantity, xValue],
        [y.quantity, yValue],
      ]));
      return resultNumber(runOn(cell, model, atmosphericPressure), output);
    }),
  );
}

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

/**
 * `list` painted over a scanned field `z` on `x` and `y`, already in display
 * units ({@link BandTrace}), and a legend entry per painted band. Its fills
 * cannot say where the pointer is, so it never captures the pointer.
 */
export function bandsFor(
  list: BandList,
  field: Pick<BandTrace, "x" | "y" | "z">,
): { readonly trace: BandTrace; readonly legendEntries: readonly LegendEntry[] } {
  const fills = bandFillsOf(list);
  return {
    trace: { kind: "bands", hover: "off", ...field, bands: fills },
    legendEntries: fills.map((band) => ({ label: band.label, swatch: "fill", color: band.color })),
  };
}

/**
 * The bands a chart fills from `list`, in the list's order: one per band with
 * a colour, over the interval of the scanned number between its own Edge and
 * the one below; a band without one is painted nowhere. The first band is
 * open below, as every library classifier is; the last Edge is where the list
 * stops answering, and it bounds the last band's fill.
 */
function bandFillsOf(list: BandList): readonly BandFill[] {
  return list.labels.flatMap((label, index) => {
    const color = list.colors[index];
    return color === undefined
      ? []
      : [{ label, color, upper: list.edges[index], lower: index === 0 ? undefined : list.edges[index - 1] }];
  });
}

/**
 * The band the library itself puts `value` in on `list`, so the inclusivity
 * is the list's: one label, or none past the last Edge or without a number.
 */
export function bandLabels(value: number, list: BandList): readonly string[] {
  const band = classifyFromBins(value, list);
  return typeof band === "string" ? [band] : [];
}

/**
 * One line of a hover readout, `Label: value unit`, the SI `value` shown as
 * the results table shows it: in `unit`, formatted, and a dash where there is
 * no number.
 */
export function readoutLine(quantity: Quantity, unit: DisplayUnit, value: number): string {
  return `${quantity.label}: ${numberWithUnit(value, unit)}`;
}
