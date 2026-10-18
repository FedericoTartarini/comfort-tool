/**
 * What a scanned chart paints of its slots' scans: each slot's Comfort zones
 * or a Band list's bands as regions of the field, the band a number falls in,
 * and the hover grid over the field, which the adaptive chart lays too.
 */
import { classifyFromBins } from "jsthermalcomfort";
import { chartInk } from "$lib/core/bandPalette";
import type { BandList } from "$lib/core/bands";
import type { ComfortZone, RegisteredModel } from "$lib/core/modelDeclaration";
import { displayUnitFor } from "$lib/core/units";
import type { UnitSystem } from "$lib/core/unitSystem";
import { copy } from "$lib/text/copy";
import type { ChartRequest } from "./chartRequest";
import type { ContourFillTrace, ContourLineTrace, HoverGridTrace, HoverReadout, LegendEntry } from "./chartSpec";
import { GRID, scannedField, type ScanFrame, type ScannedField, type Sweep } from "./scan";
import { labelFor, readoutLine, samples, zoneInkFor } from "./specParts";

/**
 * What a chart paints of its slots' scans, written once for both scanned
 * charts (ADR-0002 decision 61): the fills, the outlines and the hover grid,
 * kept apart, and their legend entries. A builder lays them in the one
 * drawing order, its chrome between the fills and the outlines (decision 62).
 */
export interface FieldPaint {
  /** Every region's fill: the slots in the request's order, each slot's zones largest first; or the bands in the list's. */
  readonly fills: readonly ContourFillTrace[];
  /** Every region's line, in the regions' order: each zone's outline, or every band's Edge, an unpainted band's too. */
  readonly outlines: readonly ContourLineTrace[];
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
 * Comfort zones as contours of its own scan, largest first, painted as
 * {@link zoneInkFor} says: filled in the slot's hue with the opacity rising
 * inwards and outlined in it, however many slots are drawn (ADR-0002
 * decisions 50, 58 and 71). Never the thermal-sensation palette for a zone:
 * it is diverging, and nested zones are levels of one thing. A zone leaves
 * out every cell whose run breaks a bound ({@link zoneSurfaceOf}); a band
 * paints over it (ADR-0002 decision 77, rule 1).
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
  const fills: ContourFillTrace[] = [];
  const outlines: ContourLineTrace[] = [];
  const bandLegend: LegendEntry[] = [];
  const zoneLegendOfSlot = request.slots.map((): LegendEntry[] => []);
  const lay = ({ line, fill }: PaintedRegion) => {
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
    const zones = contouredZonesOf(frame.model);
    request.slots.forEach((charted, position) => {
      zones.forEach((zone, index) => {
        // The zone's surface is |number|, so the zone is everything below its limit.
        const interval = { upper: zone.limit };
        const ink = zoneInkFor(charted, copy.zoneLegend(zone), index, zones.length);
        lay(paintedRegionFor(ink.legendEntry.label, { ...drawn, z: zoneSurfaceOf(fields[position], zone.limit) }, {
          fill: { interval, color: ink.fill },
          line: interval,
          lineColor: ink.line,
          lineWidth: ink.lineWidth,
        }));
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
 * The Comfort zones a scanned chart cuts from each slot's scan, largest
 * first: the model's scan's own (`core/comfortZones`), each where |PMV| is
 * inside its limit. None for a model whose scan declares none; a model
 * declaring the psychrometric chart has some, which a registry-wide test holds
 * (`core/modelDeclaration.test.ts`).
 */
function contouredZonesOf(model: RegisteredModel): readonly ComfortZone[] {
  return [...(model.scan?.comfortZones ?? [])].sort((a, b) => b.limit - a.limit);
}

/** A scanned number as a contour reads it: `null`, in no region, where the model gave none. */
function contouredNumber(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

/**
 * `field` as the Comfort zone of |number| ≤ `limit` contours it: each cell's
 * |number|, which crosses the limit where the number crosses ±`limit`, and
 * which leaves out every cell whose run breaks a bound (ADR-0002 decision 77,
 * rule 1). A left cell inside the limit carries its |number| reflected
 * through it, `2 · limit − |number|`: outside the zone by as much as it was
 * inside, so between it and a kept neighbour of about the same number the
 * contour crosses the limit halfway, at most half a cell from the bound the
 * library reported, and the zone's outline closes along the cut. Every left
 * cell lies at or above the limit, so no contour between two of them crosses
 * into the zone. No bound's value is read here.
 */
function zoneSurfaceOf(field: ScannedField, limit: number): (number | null)[][] {
  return field.values.map((row, yIndex) =>
    row.map((value, xIndex) => {
      const magnitude = Math.abs(value);
      return contouredNumber(field.outsideApplicability[yIndex][xIndex] && magnitude <= limit ? 2 * limit - magnitude : magnitude);
    }),
  );
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
