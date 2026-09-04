import type { Quantity } from "jsthermalcomfort/io";
import type { SlotInputs } from "$lib/core/libraryInputs";
import type { RegisteredModel } from "$lib/core/modelDeclaration";
import type { UnitSystem } from "$lib/core/unitSystem";

/**
 * The restricted chart description `ui/charts/` consumes (ADR §4.4). Every
 * number is already in display units and every colour is already resolved, so
 * the chart component converts nothing and imports no model.
 */

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
  /** Hover text; the trace is unhoverable without one. */
  readonly label?: string;
}

/** A single point — one slot's current inputs. */
export interface PointTrace {
  readonly kind: "point";
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly label: string;
}

/**
 * A banded surface. `z[yIndex][xIndex]` is an index into `bands`, or `null`
 * where the model classified nothing.
 */
export interface BandTrace {
  readonly kind: "bands";
  readonly x: readonly number[];
  readonly y: readonly number[];
  readonly z: readonly (readonly (number | null)[])[];
  readonly bands: readonly { readonly label: string; readonly color: string }[];
}

/** Drawn in order, so the first trace is at the bottom. */
export type Trace = PathTrace | PointTrace | BandTrace;

export interface ChartSpec {
  readonly traces: readonly Trace[];
  readonly layout: { readonly x: AxisSpec; readonly y: AxisSpec };
  /** The chart's one legend (ADR §4.4). Plotly's own is switched off. */
  readonly legend: readonly LegendEntry[];
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
