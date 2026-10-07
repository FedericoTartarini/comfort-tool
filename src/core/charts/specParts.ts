/**
 * The pieces the spec builders assemble: the scan and its paint with the
 * hover grid over it, the slot marker, a painted region, an axis, the samples
 * of a range, what the slots of a request share, a Band list's paint and a
 * readout's lines. Each is written here once, so the psychrometric, the
 * dynamic and the adaptive chart draw them alike.
 */
import { classifyFromBins } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import type { BandList } from "$lib/core/bands";
import type { ComfortZone, Range, RegisteredModel } from "$lib/core/modelDeclaration";
import { resultNumber, runOn } from "$lib/core/modelRun";
import type { Quantity } from "$lib/core/quantities";
import { withEnteredValues, withEntryModes, type Slot, type ValueEntryModes } from "$lib/core/slot";
import { namesSlots, type SlotBadge } from "$lib/core/slotBadge";
import { displayUnitFor, labelWithUnit, numberWithUnit, type DisplayUnit } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import type { ChartRequest, ChartedSlot } from "./chartRequest";
import type {
  AxisSpec,
  ContourFillTrace,
  ContourLineTrace,
  HoverGridTrace,
  HoverReadout,
  LegendEntry,
  PointTrace,
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
 * charts (ADR-0002 decision 61): the fills, the outlines and the hover grid,
 * kept apart, and their legend entries. A builder lays them in the one
 * drawing order, its chrome between the fills and the outlines (decision 62).
 */
export interface FieldPaint {
  /** Every region's fill: the slots in the request's order, each slot's zones largest first; or the bands in the list's. */
  readonly fills: readonly ContourFillTrace[];
  /** Every region's line, in the fills' order: each zone's outline, or every band's Edge, an unpainted band's too. */
  readonly outlines: readonly ContourLineTrace[];
  /** The one grid that reads every slot's number for the fills. */
  readonly hoverGrid: HoverGridTrace;
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
 * band without one nowhere, and every Edge stroked. Given none, each slot's
 * Comfort zones as contours of its own scan, largest first, in the slot's
 * hue with the opacity rising inwards, a lone slot exactly as each of
 * several (ADR-0002 decisions 50 and 58). Never the thermal-sensation palette
 * for a zone: it is diverging, and nested zones are levels of one thing.
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
  const fills: ContourFillTrace[] = [];
  const outlines: ContourLineTrace[] = [];
  const bandLegend: LegendEntry[] = [];
  const zoneLegendOfSlot = request.slots.map((): LegendEntry[] => []);
  const lay = ({ line, fill }: PaintedRegion, legend: LegendEntry[]) => {
    if (fill) {
      fills.push(fill.trace);
      legend.push(fill.legendEntry);
    }
    outlines.push(line);
  };

  if (bands) {
    bandsFor(bands, { ...drawn, z: surfaces[0] }).forEach((region) => lay(region, bandLegend));
  } else {
    const zones = contouredZonesOf(frame.model);
    request.slots.forEach((charted, position) => {
      zones.forEach((zone, index) => {
        const interval = { lower: -zone.limit, upper: zone.limit };
        const region = paintedRegionFor(labelFor(request, charted, copy.zoneLegend(zone)), { ...drawn, z: surfaces[position] }, {
          fill: { interval, color: chartInk.zoneFill(charted.hue, index, zones.length) },
          line: interval,
          lineColor: charted.hue.zoneLine,
          lineWidth: chartInk.zoneLineWidth,
        });
        lay(region, zoneLegendOfSlot[position]);
      });
    });
  }

  const hoverGrid = hoverGridFor(frame.x, frame.y, unitSystem, ({ x, y, xIndex, yIndex }) => {
    const masked = isMasked(x, y);
    return request.slots.flatMap((charted, position) => {
      const value = masked ? Number.NaN : fields[position][yIndex][xIndex];
      const lines = [readoutLine(frame.output, outputUnit, value), ...(bands ? bandLabels(value, bands) : [])];
      return lines.map((line) => labelFor(request, charted, line));
    });
  });
  return { fills, outlines, hoverGrid, bandLegend, zoneLegendOfSlot };
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
 * `charted`: prefixed with the slot's name where {@link namesSlots} says
 * the request's slots are named, and as it is otherwise.
 */
export function labelFor(request: ChartRequest, charted: ChartedSlot, label: string): string {
  return namesSlots(request.slots.length) ? copy.slotEntry(charted.name, label) : label;
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

/** The axis for `quantity` drawn across `range`: titled with `unit`, and the SI range shown in it. */
export function axisFor(quantity: Quantity, unit: DisplayUnit, range: Range): AxisSpec {
  return { title: labelWithUnit(quantity, unit), range: [unit.fromSi(range.min), unit.fromSi(range.max)] };
}

/** `count` evenly spaced values across `range`, both ends included, in SI. */
export function samples(range: Range, count: number): readonly number[] {
  const step = (range.max - range.min) / (count - 1);
  return Array.from({ length: count }, (_, index) => range.min + index * step);
}

/** A scanned field over two axes' samples, already in display units, its number in its own unit. */
type ContourField = Pick<ContourFillTrace, "x" | "y" | "z">;

/** An interval of a scanned field's number: from `lower` to `upper`, or everything below `upper` without `lower`. */
type FieldInterval = Pick<ContourFillTrace, "upper" | "lower">;

/**
 * How a {@link paintedRegionFor} region is painted: the interval it fills and
 * the fill's colour, if it is filled at all, and the interval it strokes and
 * the line's colour and width.
 */
interface RegionPaint {
  readonly fill?: { readonly interval: FieldInterval; readonly color: string };
  readonly line: FieldInterval;
  readonly lineColor: string;
  readonly lineWidth: number;
}

/** A region's line, and where it is filled its fill and the fill's legend entry. */
interface PaintedRegion {
  readonly line: ContourLineTrace;
  readonly fill?: { readonly trace: ContourFillTrace; readonly legendEntry: LegendEntry };
}

/**
 * A region of the scanned `field` named `label`, painted as `paint` says: a
 * line over one interval and, where `paint` fills it, a fill over another and
 * a legend entry with a fill swatch (ADR-0002 decision 62). A Comfort zone
 * fills and strokes the same interval; a Band strokes its own upper Edge, and
 * one left unpainted is that line alone. Neither trace can say where the
 * pointer is, so neither captures it.
 */
function paintedRegionFor(label: string, field: ContourField, paint: RegionPaint): PaintedRegion {
  const line: ContourLineTrace = { kind: "contourLine", ...field, ...paint.line, color: paint.lineColor, width: paint.lineWidth, hover: "off", label };
  if (!paint.fill) {
    return { line };
  }
  const { interval, color } = paint.fill;
  return {
    line,
    fill: { trace: { kind: "contourFill", ...field, ...interval, color, hover: "off", label }, legendEntry: { label, swatch: "fill", color } },
  };
}

/**
 * `list` painted over the scanned `field`, one region per band in the list's
 * order: a fill and its legend entry for a band with a colour, and a line at
 * its own upper Edge for every band, painted or not, so n bands stroke the n
 * Edges once each (ADR-0002 decision 62). The first band is open below, as
 * every library classifier is; the last Edge is where the list stops
 * answering, and a number past it falls in no band, so that Edge is drawn by
 * interpolation like any other boundary.
 *
 * A band fills from its lower Edge, or from below for the first, up to the
 * top of the painted bands contiguous above it ({@link contiguousTopOf}), and
 * the fills are laid in band order, so each boundary among them is one
 * fill's edge laid over the next fill's interior: two fills meeting edge to
 * edge can show a seam, a fill over an interior cannot. A band left
 * unpainted ends the run, so its interval stays unpainted rather than showing
 * the fill below it.
 */
function bandsFor(list: BandList, field: ContourField): readonly PaintedRegion[] {
  return list.labels.map((label, index) => {
    const color = list.colors[index];
    return paintedRegionFor(label, field, {
      fill: color === undefined
        ? undefined
        : { interval: { lower: index === 0 ? undefined : list.edges[index - 1], upper: contiguousTopOf(list, index) }, color },
      line: { upper: list.edges[index] },
      lineColor: chartInk.bandLine,
      lineWidth: chartInk.bandLineWidth,
    });
  });
}

/** The upper Edge of the last band from band `index` up that is painted with every band between. */
function contiguousTopOf(list: BandList, index: number): number {
  let top = index;
  while (list.colors[top + 1] !== undefined) {
    top += 1;
  }
  return list.edges[top];
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
