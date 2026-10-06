/**
 * The restricted chart description `ui/charts/` consumes (ADR §4.4). Every
 * number is already in display units and every colour is already resolved, so
 * the chart component converts nothing and imports no model.
 *
 * The one exception is a contour's field and its interval ({@link
 * ContourFillTrace}, {@link ContourLineTrace}), which stay in the scanned
 * output's own SI unit: they are never displayed, only compared with each
 * other, so converting them would change nothing but the arithmetic.
 */

/**
 * What the pointer reads on a trace (ADR §4.4). `"off"` never captures the
 * pointer: chrome — the relative-humidity isolines, the zone outlines, a
 * Band's Edges, the slot markers — and the zones themselves, whose fills cannot say where the
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
 * A region of a scalar field: `z[yIndex][xIndex]` is the model's own number at
 * that cell, over the samples `x` and `y`, and the region is the cells whose
 * number lies between `lower` and `upper`, or below `upper` where there is no
 * `lower`. Handing the number over rather than a region index is what lets a
 * boundary fall where the value really crosses it instead of at the nearest
 * grid line, however unevenly the values are spaced (ADR-0002 decision 27).
 *
 * `null` is "the model gave no number here" and lies in no region. The
 * interval is in `z`'s unit (see the note at the top of this file).
 */
interface ContourRegion {
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly (readonly (number | null)[])[];
  readonly upper: number;
  readonly lower?: number;
}

/**
 * A {@link ContourRegion} filled in one colour, with no stroke: a Comfort
 * zone's or a Band's paint (ADR-0002 decision 62). A fill cannot say where
 * the pointer is, so a {@link HoverGridTrace} reads for it.
 */
export interface ContourFillTrace extends ContourRegion {
  readonly kind: "contourFill";
  readonly color: string;
  readonly hover: HoverMode;
  readonly label: string;
}

/**
 * The boundary of a {@link ContourRegion} stroked in one colour at one width,
 * with no fill: where the field crosses `lower` and `upper`, or `upper` alone
 * where there is no `lower`. A Comfort zone's outline, or a Band's Edge
 * (ADR-0002 decision 62).
 */
export interface ContourLineTrace extends ContourRegion {
  readonly kind: "contourLine";
  readonly color: string;
  readonly width: number;
  readonly hover: HoverMode;
  readonly label: string;
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

/** Drawn in order, so the first trace is at the bottom. */
export type Trace = PathTrace | PointTrace | ContourFillTrace | ContourLineTrace | HoverGridTrace;

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
