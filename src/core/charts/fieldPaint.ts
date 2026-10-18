/**
 * What a scanned chart paints of its slots' scans: each slot's Comfort zones
 * or a Band list's bands as regions of the field, the band a number falls in,
 * and the hover grid over the field, which the adaptive chart lays too.
 */
import { classifyFromBins } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import type { BandList } from "$lib/core/bands";
import { displayUnitFor } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { ContourFillTrace, ContourLineTrace, HoverGridTrace, HoverReadout, LegendEntry, PathPiece, PathTrace } from "./chartSpec";
import { traceRegion, type RegionGrid } from "./regionTracer";
import { comfortZonesOf, GRID, scannedField, type ScanFrame, type ScannedField, type Sweep } from "./scan";
import { labelFor, readoutLine, samples, zoneInkFor, type ZoneInk } from "./specParts";

/**
 * What a chart paints of its slots' scans, written once for both scanned
 * charts (ADR-0002 decision 61): the fills, the outlines and the hover grid,
 * kept apart, and their legend entries. A builder lays them in the one
 * drawing order, its chrome between the fills and the outlines (decision 62).
 */
export interface FieldPaint {
  /** Every region's fill: the slots in the request's order, each slot's zones largest first; or the bands in the list's. */
  readonly fills: readonly (PathTrace | ContourFillTrace)[];
  /** Every region's line, in the regions' order: each zone's outline, or every band's Edge, an unpainted band's too. */
  readonly outlines: readonly (PathTrace | ContourLineTrace)[];
  /** The one grid that reads every slot's number for the regions, whose traces cannot. */
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
 * Comfort zones traced from its own scan ({@link zonePathsFor}), largest
 * first, painted as {@link zoneInkFor} says: filled in the slot's hue with
 * the opacity rising inwards and outlined in it, however many slots are drawn
 * (ADR-0002 decisions 50, 58 and 71). Never the thermal-sensation palette for
 * a zone: it is diverging, and nested zones are levels of one thing. A zone
 * leaves out wherever a run breaks a bound ({@link ScannedField.zones}); a
 * band paints over it (ADR-0002 decision 77, rule 1).
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
  const drawn = displayedSamplesOf(frame.x, frame.y, unitSystem);
  const fills: (PathTrace | ContourFillTrace)[] = [];
  const outlines: (PathTrace | ContourLineTrace)[] = [];
  const bandLegend: LegendEntry[] = [];
  const zoneLegendOfSlot = request.slots.map((): LegendEntry[] => []);
  const lay = ({ line, fill }: { readonly line: PathTrace | ContourLineTrace; readonly fill?: PathTrace | ContourFillTrace }) => {
    if (fill) {
      fills.push(fill);
    }
    outlines.push(line);
  };

  if (bands) {
    for (const region of bandsFor(bands, { ...drawn, z: fields[0].values.map((row) => row.map(contouredNumber)) })) {
      lay(region);
      if (region.fill) {
        bandLegend.push({ label: region.fill.label, swatch: "fill", color: region.fill.color });
      }
    }
  } else {
    const zones = comfortZonesOf(frame.model);
    request.slots.forEach((charted, position) => {
      zones.forEach((zone, index) => {
        const ink = zoneInkFor(charted, copy.zoneLegend(zone), index, zones.length);
        lay(zonePathsFor(fields[position].zones[index], frame, unitSystem, ink));
        zoneLegendOfSlot[position].push(ink.legendEntry);
      });
    });
  }

  const hoverGrid = hoverGridFor(frame.x, frame.y, unitSystem, ({ x, y, xIndex, yIndex }) => {
    const masked = isMasked(x, y);
    return request.slots.flatMap((charted, position) => {
      const value = masked ? Number.NaN : fields[position].values[yIndex][xIndex];
      const lines = [readoutLine(frame.output, outputUnit, value), ...(bands ? bandLabels(value, bands) : [])];
      return lines.map((line) => labelFor(charted, line));
    });
  });
  return { fills, outlines, hoverGrid, bandLegend, zoneLegendOfSlot };
}

/**
 * A Comfort zone of a slot's scan, `region` ({@link ScannedField.zones}),
 * traced (`regionTracer.ts`) and painted in `ink`: its rings filled, and its
 * limit and every bound that ends it stroked, never the plot's frame
 * (ADR-0002 decision 78, rule 4). The tracer works in the scan's SI; each
 * vertex is shown in `unitSystem` as the axes show it, and every axis's
 * conversion is affine, so a straight run stays straight. Neither path can
 * say where the pointer is, so neither captures it.
 */
function zonePathsFor(region: RegionGrid, frame: ScanFrame, unitSystem: UnitSystem, ink: ZoneInk): { readonly line: PathTrace; readonly fill: PathTrace } {
  const xUnit = displayUnitFor(frame.x.quantity, unitSystem);
  const yUnit = displayUnitFor(frame.y.quantity, unitSystem);
  const displayed = (piece: PathPiece): PathPiece => ({ x: piece.x.map((x) => xUnit.fromSi(x)), y: piece.y.map((y) => yUnit.fromSi(y)) });
  const { rings, lines } = traceRegion(region);
  const label = ink.legendEntry.label;
  return {
    fill: { kind: "path", pieces: rings.map(displayed), color: ink.fill, width: 0, fill: ink.fill, hover: "off", label },
    line: { kind: "path", pieces: lines.map(displayed), color: ink.line, width: ink.lineWidth, hover: "off", label },
  };
}

/** A scanned number as a contour reads it: `null`, in no region, where the model gave none. */
function contouredNumber(value: number): number | null {
  return Number.isNaN(value) ? null : value;
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

/** A region's line, and its fill where it is filled. */
interface PaintedRegion {
  readonly line: ContourLineTrace;
  readonly fill?: ContourFillTrace;
}

/**
 * A region of the scanned `field` named `label`, painted as `paint` says: a
 * line over one interval and, where `paint` fills it, a fill over another
 * (ADR-0002 decision 62). A Comfort zone fills and strokes the same interval;
 * a Band strokes its own upper Edge, and one left unpainted is that line
 * alone. Neither trace can say where the pointer is, so neither captures it.
 */
function paintedRegionFor(label: string, field: ContourField, paint: RegionPaint): PaintedRegion {
  const line: ContourLineTrace = { kind: "contourLine", ...field, ...paint.line, color: paint.lineColor, width: paint.lineWidth, hover: "off", label };
  if (!paint.fill) {
    return { line };
  }
  const { interval, color } = paint.fill;
  return { line, fill: { kind: "contourFill", ...field, ...interval, color, hover: "off", label } };
}

/**
 * `list` painted over the scanned `field`, one region per band in the list's
 * order: a fill for a band with a colour, and a line at its own upper Edge
 * for every band, painted or not, so n bands stroke the n Edges once each
 * (ADR-0002 decision 62). The first band is open below, as
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
    return paintedRegionFor(shownBandLabel(label), field, {
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
 * is the list's: one label, as the chart names it ({@link shownBandLabel}),
 * or none past the last Edge or without a number.
 */
export function bandLabels(value: number, list: BandList): readonly string[] {
  const band = classifyFromBins(value, list);
  return typeof band === "string" ? [shownBandLabel(band)] : [];
}

/** A band's `label` as the chart names it: an empty one, as Add leaves it, reads "Unlabelled band". */
function shownBandLabel(label: string): string {
  return label === "" ? copy.unlabelledBand : label;
}
