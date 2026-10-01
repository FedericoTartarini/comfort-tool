/**
 * The restricted chart description `ui/charts/` consumes (ADR §4.4). Every
 * number is already in display units and every colour is already resolved, so
 * the chart component converts nothing and imports no model.
 *
 * The one exception is {@link BandTrace}'s surface and the Edges beside it,
 * which stay in the scanned output's own SI unit: they are never displayed,
 * only compared with each other, so converting them would change nothing but
 * the arithmetic.
 */

/**
 * What the pointer reads on a trace (ADR §4.4). `"off"` never captures the
 * pointer: chrome — the relative-humidity isolines, the zone outlines, the
 * slot markers — and the zones themselves, whose fills cannot say where the
 * pointer is, so a {@link HoverGridTrace} reads for them. `"field"` reports
 * whatever is under the cursor without snapping to a drawn datum. Snapping is
 * reserved for the line charts added later, where the drawn point *is* the
 * reading.
 */
export type HoverMode = "off" | "field";

/**
 * What the pointer reads at one cell of a field, one line per entry, already
 * formatted: each axis value as `Label: value unit`, then whatever that chart
 * reads there. The chart component only lays the lines out.
 */
export type HoverReadout = readonly string[];

/** How a legend entry is drawn. */
export type Swatch = "fill" | "line" | "marker";

export interface LegendEntry {
  readonly label: string;
  readonly swatch: Swatch;
  readonly color: string;
}

export interface AxisSpec {
  /** Already includes the unit symbol; the name itself comes from `Quantity.label`. */
  readonly title: string;
  readonly range: readonly [number, number];
}

/** A polyline, closed and filled when `fill` is set. */
export interface PathTrace {
  readonly kind: "path";
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly color: string;
  readonly width: number;
  readonly fill?: string;
  readonly hover: HoverMode;
  /**
   * The path's name (a zone's or an isoline's), handed to Plotly as its trace
   * name; no path takes the pointer today, so nothing shows it.
   */
  readonly label?: string;
}

/** A single point — one slot's current inputs. */
export interface PointTrace {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly hover: HoverMode;
  readonly label: string;
}

/**
 * One band of a {@link BandTrace}: the paint, and the interval of the surface
 * it covers. `upper` is the band's own Edge; `lower` is the Edge below it,
 * absent on the first band, which is open below in every library classifier.
 * Both are in the surface's unit (see the note at the top of this file).
 */
export interface BandFill {
  readonly label: string;
  readonly color: string;
  readonly upper: number;
  readonly lower?: number;
}

/**
 * A scalar field cut into bands: `z[yIndex][xIndex]` is the model's own number
 * at that cell, and each entry of `bands` says which interval of it that band
 * fills. Handing the number over rather than a band index is what lets a
 * boundary fall where the value really crosses its Edge instead of at the
 * nearest grid line, however unevenly the Edges are spaced (ADR-0002 decision
 * 27).
 *
 * `null` is "the model gave no number here" and stays unpainted. A number past
 * the last band's `upper` is kept and simply falls outside every band's
 * interval, so that last Edge is drawn by interpolation like any other
 * boundary.
 *
 * Only painted bands are listed, so two neighbours need not meet: a band with
 * no colour leaves its interval unpainted between them. The fills cannot say
 * where the pointer is, so a {@link HoverGridTrace} reads for them, the band
 * included, which is the library's classifier's to decide.
 */
export interface BandTrace {
  readonly kind: "bands";
  readonly hover: HoverMode;
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly (readonly (number | null)[])[];
  readonly bands: readonly BandFill[];
}

/**
 * A field that is read but never seen: `hoverText[yIndex][xIndex]` is what
 * the pointer reads at that cell, for a chart whose drawn shapes cannot report
 * where the pointer is — filled zones and bands.
 */
export interface HoverGridTrace {
  readonly kind: "hoverGrid";
  readonly hover: HoverMode;
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly hoverText: readonly (readonly HoverReadout[])[];
}

/**
 * A Comfort zone cut from a scanned field: the cells whose number lies between
 * `lower` and `upper`, filled and outlined. On the dynamic chart a slot's zone
 * is a contour of its own scan (ADR-0002 decision 50), so it is handed over as
 * the field and the interval rather than traced as a polygon. `z` is as a
 * {@link BandTrace}'s, and the interval is in its unit.
 */
export interface ContourZoneTrace {
  readonly kind: "contourZone";
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly (readonly (number | null)[])[];
  readonly lower: number;
  readonly upper: number;
  readonly color: string;
  readonly width: number;
  readonly fill: string;
  readonly hover: HoverMode;
  readonly label: string;
}

/** Drawn in order, so the first trace is at the bottom. */
export type Trace = PathTrace | PointTrace | BandTrace | HoverGridTrace | ContourZoneTrace;

/** Text placed at a point of the plot — the isoline labels, and nothing else so far. */
export interface Annotation {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface ChartSpec {
  readonly traces: readonly Trace[];
  readonly layout: { readonly x: AxisSpec; readonly y: AxisSpec };
  /** The chart's one legend (ADR §4.4). Plotly's own is switched off. */
  readonly legend: readonly LegendEntry[];
  readonly annotations: readonly Annotation[];
}
