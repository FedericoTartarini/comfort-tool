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
import type { ChartedSlot, ChartRequest } from "./chartRequest";
import type { ChartNote, HoverGridTrace, HoverReadout, LegendEntry, PathPiece, PathTrace } from "./chartSpec";
import { traceRegion, type RegionGrid, type TracedRegion } from "./regionTracer";
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
  readonly fills: readonly PathTrace[];
  /** Every region's line, in the regions' order: each zone's outline, or every band's Edge, an unpainted band's too. */
  readonly outlines: readonly PathTrace[];
  /** The one grid that reads every slot's number for the regions, whose traces cannot. */
  readonly hoverGrid: HoverGridTrace;
  /** The Band list's legend entries, one per painted band; none without a list. */
  readonly bandLegend: readonly LegendEntry[];
  /** Each slot's Comfort zones' legend entries, largest first, in the request's slot order; none with a list. */
  readonly zoneLegendOfSlot: readonly (readonly LegendEntry[])[];
  /** A note per slot whose Comfort zones are all empty, in the request's slot order; none with a list. */
  readonly notes: readonly ChartNote[];
}

/**
 * The paint of `scans`, one per slot of `request` in its order, each the
 * slot's scan in `frame` ({@link scannedField}); without them every slot is
 * scanned here. Every region is traced from the scan (`regionTracer.ts`),
 * so a drawn boundary falls where the value crosses it rather than half a
 * cell away (ADR-0002 decisions 27 and 78); a point with no number is
 * painted nowhere.
 *
 * Given a Band list ({@link ChartRequest.bands}), its bands traced over the
 * first slot's scan ({@link bandPathsFor}), each over its interval of the
 * number in its own colour, a band without one nowhere, and every Edge
 * stroked. Given none, each slot's Comfort zones traced from its own scan
 * ({@link zonePathsFor}), largest first, painted as {@link zoneInkFor} says:
 * filled in the slot's hue with the opacity rising inwards and outlined in
 * it, however many slots are drawn (ADR-0002 decisions 50, 58 and 71). Never the thermal-sensation palette for
 * a zone: it is diverging, and nested zones are levels of one thing. A zone
 * leaves out wherever a run breaks a bound ({@link ScannedField.zones}); a
 * band paints over it (ADR-0002 decision 77, rule 1). A slot none of whose
 * zones has a region gets a note saying so ({@link emptyZoneNoteFor}), the
 * axes, its marker and the hover kept (decision 83, rule 1).
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
  const traced = tracedIn(frame, unitSystem);
  const fills: PathTrace[] = [];
  const outlines: PathTrace[] = [];
  const bandLegend: LegendEntry[] = [];
  const zoneLegendOfSlot = request.slots.map((): LegendEntry[] => []);
  const notes: ChartNote[] = [];
  const lay = ({ line, fill }: RegionPaths) => {
    if (fill) {
      fills.push(fill);
    }
    outlines.push(line);
  };

  if (bands) {
    for (const band of bandPathsFor(bands, fields[0], traced)) {
      lay(band);
      if (band.legendEntry) {
        bandLegend.push(band.legendEntry);
      }
    }
  } else {
    const zones = comfortZonesOf(frame.model);
    request.slots.forEach((charted, position) => {
      const regions = fields[position].zones.map((zone) => traced(zone));
      zones.forEach((zone, index) => {
        const ink = zoneInkFor(charted, copy.zoneLegend(zone), index, zones.length);
        lay(zonePathsFor(regions[index], ink));
        zoneLegendOfSlot[position].push(ink.legendEntry);
      });
      // A model that declares no zone has none to empty.
      if (regions.length > 0 && regions.every((region) => region.rings.length === 0)) {
        notes.push(emptyZoneNoteFor(charted));
      }
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
  return { fills, outlines, hoverGrid, bandLegend, zoneLegendOfSlot, notes };
}

/**
 * The note of `charted`, whose Comfort zones are all empty: one sentence,
 * whatever emptied them, named and with the slot's swatch while the slot has
 * a name, as the applicability summary names its lines (ADR-0002 decision 83
 * rule 1, as noted 2026-10-22). The legend keeps the zones' entries.
 */
function emptyZoneNoteFor(charted: ChartedSlot): ChartNote {
  return charted.name === undefined
    ? { text: copy.noComfortZone }
    : { text: copy.slotNote(charted.name, copy.noComfortZone), color: chartInk.marker(charted.hue) };
}

/** A region's line, and its fill where it is filled. */
interface RegionPaths {
  readonly line: PathTrace;
  readonly fill?: PathTrace;
}

/**
 * How a region of `frame`'s scan is drawn: traced (`regionTracer.ts`) in the
 * scan's SI, then each vertex shown in `unitSystem` as the axes show it.
 * Every axis's conversion is affine, so a straight run stays straight.
 */
function tracedIn(frame: ScanFrame, unitSystem: UnitSystem): (region: RegionGrid) => TracedRegion {
  const xUnit = displayUnitFor(frame.x.quantity, unitSystem);
  const yUnit = displayUnitFor(frame.y.quantity, unitSystem);
  const displayed = (piece: PathPiece): PathPiece => ({ x: piece.x.map((x) => xUnit.fromSi(x)), y: piece.y.map((y) => yUnit.fromSi(y)) });
  return (region) => {
    const { rings, lines } = traceRegion(region);
    return { rings: rings.map(displayed), lines: lines.map(displayed) };
  };
}

/**
 * A Comfort zone `traced` from a slot's scan ({@link ScannedField.zones}) and
 * painted in `ink`: its rings filled, and its limit and every bound that ends
 * it stroked, never the plot's frame (ADR-0002 decision 78, rule 4). Neither
 * path can say where the pointer is, so neither captures it.
 */
function zonePathsFor({ rings, lines }: TracedRegion, ink: ZoneInk): Required<RegionPaths> {
  const label = ink.legendEntry.label;
  return {
    fill: { kind: "path", pieces: rings, color: ink.fill, width: 0, fill: ink.fill, hover: "off", label },
    line: { kind: "path", pieces: lines, color: ink.line, width: ink.lineWidth, hover: "off", label },
  };
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

/** A band's line, and its fill and legend entry where it is painted. */
interface BandPaths extends RegionPaths {
  readonly legendEntry?: LegendEntry;
}

/**
 * `list` traced over `field` ({@link ScannedField.regionWithin}), one region
 * per band in the list's order: a fill for a band with a colour, and a line
 * at its own upper Edge for every band, painted or not, so n bands stroke the
 * n Edges once each (ADR-0002 decisions 62 and 78, rule 4). The line is the
 * boundary of the numbers in that band or below it, less the plot's frame.
 * The first band is open below, as every library classifier is; the last
 * Edge is where the list stops answering, and a number past it falls in no
 * band, so that Edge is drawn by interpolation like any other boundary.
 *
 * A band fills from its lower Edge, or from below for the first, up to the
 * top of the painted bands contiguous above it ({@link contiguousTopOf}), and
 * the fills are laid in band order, so each boundary among them is one
 * fill's edge laid over the next fill's interior: two fills meeting edge to
 * edge can show a seam, a fill over an interior cannot. A band left
 * unpainted ends the run, so its interval stays unpainted rather than showing
 * the fill below it. Which band a number is in is the library's answer on the
 * list ({@link bandIndexOf}), so no inclusivity rule is written here. Neither
 * path can say where the pointer is, so neither captures it.
 */
function bandPathsFor(list: BandList, field: ScannedField, traced: (region: RegionGrid) => TracedRegion): readonly BandPaths[] {
  const indexOf = bandIndexOf(list);
  const inBands = (first: number, last: number) => (value: number) => {
    const index = indexOf(value);
    return index !== undefined && first <= index && index <= last;
  };
  return list.labels.map((name, index) => {
    const label = shownBandLabel(name);
    const color = list.colors[index];
    const { lines } = traced(field.regionWithin({ holds: inBands(0, index), upper: list.edges[index] }));
    const line: PathTrace = { kind: "path", pieces: lines, color: chartInk.bandLine, width: chartInk.bandLineWidth, hover: "off", label };
    if (color === undefined) {
      return { line };
    }
    const top = contiguousTopOf(list, index);
    const lower = index === 0 ? undefined : list.edges[index - 1];
    const { rings } = traced(field.regionWithin({ holds: inBands(index, top), lower, upper: list.edges[top] }));
    return {
      line,
      fill: { kind: "path", pieces: rings, color, width: 0, fill: color, hover: "off", label },
      legendEntry: { label, swatch: "fill", color },
    };
  });
}

/** The last band from band `index` up that is painted with every band between, by its index. */
function contiguousTopOf(list: BandList, index: number): number {
  let top = index;
  while (list.colors[top + 1] !== undefined) {
    top += 1;
  }
  return top;
}

/**
 * Which band of `list` the library's `classifyFromBins` puts a number in, by
 * its index, or `undefined` past the last Edge: the list's own Edges and
 * inclusivity, each band labelled by its index.
 */
function bandIndexOf(list: BandList): (value: number) => number | undefined {
  const indexed = { edges: list.edges, labels: list.labels.map((_, index) => String(index)), right: list.right };
  return (value) => {
    const band = classifyFromBins(value, indexed);
    return typeof band === "string" ? Number(band) : undefined;
  };
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
