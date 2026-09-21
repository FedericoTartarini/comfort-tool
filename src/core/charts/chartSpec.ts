import type { SlotInputs } from "$lib/core/libraryInputs";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { Quantity } from "$lib/core/quantities";
import type { UnitSystem } from "$lib/core/unitSystem";

/**
 * The restricted chart description `ui/charts/` consumes (ADR §4.4). Every
 * number is already in display units and every colour is already resolved, so
 * the chart component converts nothing and imports no model.
 */

/**
 * What the pointer reads on a trace (ADR §4.4). `"off"` is chrome — the
 * relative-humidity isolines, the zone outline, the slot markers — which never
 * capture the pointer; `"field"` reports whatever is under the cursor without
 * snapping to a drawn datum. Snapping is reserved for the line charts added
 * later, where the drawn point *is* the reading.
 */
export type HoverMode = "off" | "field";

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
  /** A d3 tick format, for axes the default renders unreadably (humidity ratio). */
  readonly tickFormat?: string;
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
  /** Legend and hover text. */
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
 * The bottom of the band-position scale, and so the bottom of the first band,
 * which is open below in every library classifier. A value far under the first
 * Edge is held here rather than running off the scale the colours are mapped
 * over. Flattening that region moves no boundary: everything within a band's
 * width of the first Edge is still placed by interpolation, and the whole
 * region below is one colour either way.
 */
export const BAND_SCALE_FLOOR = -1;

/**
 * A banded surface, in band-position space: `z[yIndex][xIndex]` is a position
 * on the band scale rather than an index into `bands`, so the Edge between
 * band *i* and band *i + 1* sits at the integer *i* and band *k* fills the
 * interval from *k − 1* to *k*. The scale therefore runs from
 * {@link BAND_SCALE_FLOOR} to `bands.length - 1`. Evenly spaced contour levels
 * draw unevenly spaced Edges, and a boundary falls where the model's value
 * really crosses one instead of at the nearest grid line. `null` is "no band"
 * — the model classified nothing there.
 *
 * `hoverText[yIndex][xIndex]` is the band name the pointer reads at that cell,
 * empty where there is no band. It is carried rather than derived from `z`:
 * which side of an Edge a value falls on is the library's rule, per
 * classifier, and it is applied in the spec builder.
 */
export interface BandTrace {
  readonly kind: "bands";
  readonly hover: HoverMode;
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly (readonly (number | null)[])[];
  readonly hoverText: readonly (readonly string[])[];
  readonly bands: readonly { readonly label: string; readonly color: string }[];
}

/** Drawn in order, so the first trace is at the bottom. */
export type Trace = PathTrace | PointTrace | BandTrace;

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

/** What both spec builders need. The selected axes are the dynamic chart's alone. */
export interface ChartRequest {
  readonly model: RegisteredModel;
  readonly slot: SlotInputs;
  /** Slot name, for the marker's hover text. */
  readonly slotLabel: string;
  readonly unitSystem: UnitSystem;
}

/** An axis title in the currently displayed unit. */
export function axisTitle(quantity: Quantity, symbol: string): string {
  return symbol ? `${quantity.label} (${symbol})` : quantity.label;
}
