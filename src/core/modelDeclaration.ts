import type { PsychrometricZoneOptions } from "jsthermalcomfort/charts";
import type { Outcome, Quantity } from "jsthermalcomfort/io";
import type { ApplicabilityLimit, IntervalScale, StandardRef } from "jsthermalcomfort/reference";
import { chartType } from "./chartType";

/**
 * The metadata a library model function carries (`pmv_ppd_iso.label`,
 * `.standard`, `.limits`, …). Structural, so the model function itself
 * satisfies it; the declaration file reads from here and never writes copy or
 * transcribes numbers (ADR §4.1.3).
 */
export interface LibraryModel {
  readonly label: string;
  readonly description: string;
  /** Membership in a standard; absent for Explore-only models such as UTCI. */
  readonly standard?: StandardRef;
  /** Classification scale of the primary output, when the model has one. */
  readonly tsv?: IntervalScale;
  /** Applicability limits, the single source for range checks. */
  readonly limits?: readonly ApplicabilityLimit[];
}

/**
 * What `toLibraryInputs` produces and `run` consumes: SI values keyed by
 * `Quantity.key`, plus the two call options the app always sets.
 */
export interface LibraryInit {
  readonly units: "SI";
  readonly limit_inputs: boolean;
  readonly [quantityKey: string]: number | string | boolean;
}

/** A closed interval, in SI. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * How far one quantity is drawn wherever it carries an axis, in SI:
 * `[quantity, min, max]`, the same tuple shape as `inputs`.
 *
 * A viewport, not a threshold. ADR §4.4: axis ranges are declared, never
 * derived from `model.limits` — the limits validate what the user typed, and
 * conflating the two clipped the ISO chart to 10–30 °C and left `rh`, which no
 * standard limits, unable to carry an axis at all.
 */
export type AxisRange = readonly [Quantity, number, number];

/**
 * Exact band geometry a model supplies instead of the scanned grid, in SI.
 * `x` and `y` run along the dynamic chart's own axes and close the polygon.
 */
export interface ZonePolygon {
  readonly label: string;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** What a `zones` source is given: the slot's resolved SI inputs and the x extent being drawn. */
export interface ZoneRequest {
  readonly values: ReadonlyMap<Quantity, number>;
  readonly xRange: Range;
}

/**
 * A chart a model offers (ADR §4.4). A discriminated union rather than one wide
 * object: the psychrometric chart's axes are fixed by the temperature entry
 * mode, and only the dynamic chart has a scanned output.
 */
export type ChartDeclaration =
  | {
      readonly type: typeof chartType.psychrometric;
      /**
       * Which PMV variant the comfort zone is solved with — the library's
       * calculation-variant selector, not standard membership. `"ISO"` is
       * Fanger unmodified, `"ASHRAE"` adds the elevated-air-speed cooling
       * effect.
       */
      readonly pmvVariant: PsychrometricZoneOptions["standard"];
    }
  | {
      readonly type: typeof chartType.dynamic;
      /** Starting axes; the user may pick any entered quantity that has a declared range. */
      readonly axes: { readonly x: Quantity; readonly y: Quantity };
      /** The output whose bands colour the surface. */
      readonly output: Quantity;
      /**
       * Exact band polygons, for a model whose geometry the library already
       * traces — Adaptive's `charts.adaptiveAshraeZone`. When present the grid
       * scan is not run at all, because the polygons are the answer rather than
       * an approximation of it (ADR §4.4).
       */
      readonly zones?: (request: ZoneRequest) => readonly ZonePolygon[];
    };

/** The psychrometric member of {@link ChartDeclaration}. */
export type PsychrometricDeclaration = Extract<ChartDeclaration, { type: typeof chartType.psychrometric }>;
/** The dynamic member of {@link ChartDeclaration}. */
export type DynamicDeclaration = Extract<ChartDeclaration, { type: typeof chartType.dynamic }>;

export interface RegisteredModel {
  /** The library's io wrapper. Called only by state/compute (Phase 3: only in the worker). */
  readonly run: (init: LibraryInit) => Outcome;
  readonly model: LibraryModel;
  /** Route segment, e.g. `"pmv-iso"`. App-owned. */
  readonly pathSegment: string;
  /** Panel order and SI default values. */
  readonly inputs: readonly (readonly [Quantity, number])[];
  /** `true`: the library takes `vr`, derived as `v_relative(v, met)` from the entered `v`. */
  readonly relativeAirSpeed: boolean;
  /**
   * How far each quantity is drawn. One table per model rather than one per
   * chart: the deployed tool draws its psychrometric x axis and its field
   * charts' temperature axis over the same 10–40 °C, and nothing in v1 wants
   * two extents for one quantity.
   */
  readonly axisRanges: readonly AxisRange[];
  /** Result table columns, in order. Required (ADR §4.3). */
  readonly table: readonly Quantity[];
  /** Charts, in offering order; the first is the default. Every model has at least one. */
  readonly charts: readonly [ChartDeclaration, ...ChartDeclaration[]];
}

// The union is discriminated by an object identity, which TypeScript does not
// narrow on `===` the way it narrows a literal, so each lookup carries its own
// predicate. Comparing `type.id` strings instead would be the string-keyed
// closed set ADR §4.0 rules out.

export function psychrometricChartOf(model: RegisteredModel): PsychrometricDeclaration | undefined {
  return model.charts.find((chart): chart is PsychrometricDeclaration => chart.type === chartType.psychrometric);
}

export function dynamicChartOf(model: RegisteredModel): DynamicDeclaration | undefined {
  return model.charts.find((chart): chart is DynamicDeclaration => chart.type === chartType.dynamic);
}

/** The declared extent of `quantity`, or `undefined` when it may not carry an axis. */
export function axisRangeFor(model: RegisteredModel, quantity: Quantity): Range | undefined {
  const declared = model.axisRanges.find(([entry]) => entry === quantity);
  return declared ? { min: declared[1], max: declared[2] } : undefined;
}

/** The same, for an axis the chart is already drawing: a missing range is a declaration bug. */
export function requireAxisRange(model: RegisteredModel, quantity: Quantity): Range {
  const range = axisRangeFor(model, quantity);
  if (!range) {
    throw new Error(`${model.model.label} declares no axis range for ${quantity.label}, so it cannot carry an axis`);
  }
  return range;
}

export function defineModel<Init extends object>(
  declaration: Omit<RegisteredModel, "run"> & { readonly run: (init: Init) => Outcome },
): RegisteredModel {
  // The declaration promises that `inputs`, after the entry-group derivations
  // in core/libraryInputs.ts, cover every key `run` requires. TypeScript
  // cannot check that across the Map → init conversion, so this is the one
  // cast of its kind in the app; libraryInputs.test.ts exercises it.
  return { ...declaration, run: declaration.run as unknown as RegisteredModel["run"] };
}

export function limitFor(model: RegisteredModel, quantity: Quantity): ApplicabilityLimit | undefined {
  return model.model.limits?.find((limit) => limit.quantity === quantity);
}
