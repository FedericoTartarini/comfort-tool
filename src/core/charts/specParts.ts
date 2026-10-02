/**
 * The pieces both spec builders assemble: the scan and its paint with the
 * hover grid over it, the slot marker, a Comfort zone, an axis, the samples
 * of a range, what the slots of a request share, a Band list's paint and a
 * readout's lines. Each is written here once, so the psychrometric and the
 * dynamic chart draw them alike.
 */
import { classifyFromBins } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import type { BandList } from "$lib/core/bands";
import type { ComfortZone, Range, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { withEnteredValues, withEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import type { SlotBadge, SlotHue } from "$lib/core/slotBadge";
import { displayUnitFor, labelWithUnit, numberWithUnit, type DisplayUnit } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import type { ChartRequest, ChartedSlot } from "./chartRequest";
import type {
  AxisSpec,
  BandFill,
  BandTrace,
  ContourZoneTrace,
  HoverGridTrace,
  HoverReadout,
  LegendEntry,
  PathTrace,
  PointTrace,
  Trace,
} from "./chartSpec";

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
 * What a chart paints of its slots' scans, written once for both scanned
 * charts (ADR-0002 decision 61): the paint, the hover grid over it, and their
 * legend entries. A builder adds its axes and its chrome around it.
 */
export interface FieldPaint {
  /** The paint, then the hover grid that reads for it, in drawing order. */
  readonly traces: readonly Trace[];
  /** The Band list's legend entries, one per painted band; none without a list. */
  readonly bandLegend: readonly LegendEntry[];
  /** Each slot's Comfort zones' legend entries, largest first, in the request's slot order; none with a list. */
  readonly zoneLegendOfSlot: readonly (readonly LegendEntry[])[];
}

/**
 * The paint of `scans`, one per slot of `request` in its order, each the
 * slot's scan in `frame` ({@link scannedField}); without them every slot is
 * scanned here. Each cell keeps the model's own number, so a drawn boundary
 * falls where the value crosses it rather than half a cell away (ADR-0002
 * decision 27); a cell with no number is painted nowhere.
 *
 * Given a Band list ({@link ChartRequest.bands}), its bands over the first
 * slot's scan, each over its interval of the number in its own colour, a
 * band without one nowhere. Given none, each slot's Comfort zones as
 * contours of its own scan, largest first, in the slot's hue with the
 * opacity rising inwards, a lone slot exactly as each of several (ADR-0002
 * decisions 50 and 58). Never the thermal-sensation palette for a zone: it is
 * diverging, and nested zones are levels of one thing.
 *
 * Either way one hover grid reads both swept values and every slot's number,
 * labelled by its slot while there are several, and with a list the band the
 * library's `classifyFromBins` puts it in on that list, so no Edge and no
 * inclusivity rule is written here. A cell `isMasked` names, by its two swept
 * values in SI, reads "—" and no band, whatever number it carries.
 */
export function fieldPaintFor(
  request: ChartRequest,
  frame: ScanFrame,
  scans: readonly ScannedField[] | undefined,
  isMasked: (x: number, y: number) => boolean = () => false,
): FieldPaint {
  const { bands, unitSystem } = request;
  const fields = scans ?? request.slots.map((charted) => scannedField(frame, charted.slot));
  const outputUnit = displayUnitFor(frame.output, unitSystem);
  const surfaces = fields.map((field) => field.map((row) => row.map((value) => (Number.isNaN(value) ? null : value))));
  const drawn = displayedSamplesOf(frame.x, frame.y, unitSystem);
  const traces: Trace[] = [];
  const bandLegend: LegendEntry[] = [];
  const zoneLegendOfSlot = request.slots.map((): LegendEntry[] => []);

  if (bands) {
    const painted = bandsFor(bands, { ...drawn, z: surfaces[0] });
    traces.push(painted.trace);
    bandLegend.push(...painted.legendEntries);
  } else {
    const zones = contouredZonesOf(frame.model);
    request.slots.forEach((charted, position) => {
      zones.forEach((zone, index) => {
        const contoured = contourZoneFor(
          labelFor(request, charted, copy.zoneLegend(zone)),
          { ...drawn, z: surfaces[position], lower: -zone.limit, upper: zone.limit },
          index,
          zones.length,
          charted.hue,
        );
        traces.push(contoured.trace);
        zoneLegendOfSlot[position].push(contoured.legendEntry);
      });
    });
  }

  traces.push(
    hoverGridFor(frame.x, frame.y, unitSystem, ({ x, y, xIndex, yIndex }) => {
      const masked = isMasked(x, y);
      return request.slots.flatMap((charted, position) => {
        const value = masked ? Number.NaN : fields[position][yIndex][xIndex];
        const lines = [readoutLine(frame.output, outputUnit, value), ...(bands ? bandLabels(value, bands) : [])];
        return lines.map((line) => labelFor(request, charted, line));
      });
    }),
  );
  return { traces, bandLegend, zoneLegendOfSlot };
}

/**
 * The Comfort zones a scanned chart cuts from each slot's scan, largest
 * first: the model's scan's own (`core/comfortZones`), each where |PMV| is
 * inside its limit. None for a model whose scan declares none; a model
 * declaring the psychrometric chart has some, which a registry-wide test holds
 * (`core/modelDeclaration.test.ts`).
 */
function contouredZonesOf(model: RegisteredModel): readonly ComfortZone[] {
  return [...(model.scan?.comfortZones ?? [])].sort((a, b) => b.limit - a.limit);
}

/** One cell of a `GRID × GRID` grid: its two values in SI, and where it sits. */
export interface GridCell {
  readonly x: number;
  readonly y: number;
  readonly xIndex: number;
  readonly yIndex: number;
}

/**
 * A hover grid over the `GRID × GRID` cells of `x` and `y`: each cell reads
 * both values, `Label: value unit` in `unitSystem`, then what `readout` says
 * there. It is read but never seen, so the shapes under it need not report
 * where the pointer is.
 */
export function hoverGridFor(
  x: Sweep,
  y: Sweep,
  unitSystem: UnitSystem,
  readout: (cell: GridCell) => HoverReadout,
): HoverGridTrace {
  const xUnit = displayUnitFor(x.quantity, unitSystem);
  const yUnit = displayUnitFor(y.quantity, unitSystem);
  const xValues = samples(x.range, GRID);
  const yValues = samples(y.range, GRID);
  return {
    kind: "hoverGrid",
    hover: "field",
    ...displayedSamplesOf(x, y, unitSystem),
    hoverText: yValues.map((yValue, yIndex) =>
      xValues.map((xValue, xIndex) => [
        readoutLine(x.quantity, xUnit, xValue),
        readoutLine(y.quantity, yUnit, yValue),
        ...readout({ x: xValue, y: yValue, xIndex, yIndex }),
      ]),
    ),
  };
}

/** The `GRID` samples of `x` and of `y`, each in its display unit in `unitSystem`. */
function displayedSamplesOf(x: Sweep, y: Sweep, unitSystem: UnitSystem): { readonly x: number[]; readonly y: number[] } {
  const displayed = ({ quantity, range }: Sweep) => {
    const unit = displayUnitFor(quantity, unitSystem);
    return samples(range, GRID).map((value) => unit.fromSi(value));
  };
  return { x: displayed(x), y: displayed(y) };
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
