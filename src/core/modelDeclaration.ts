import type { ClassifierBins, ModelInfo, Standard } from "jsthermalcomfort";
import { chartType } from "./chartType";
import { quantities, type Quantity } from "./quantities";

/**
 * The model's own result object, keyed by the same strings as its `_INFO`:
 * a number for a physical output, or the category label (or NaN) a classified
 * output returns. `run` returns this directly (ADR-0002 decision 3) — the app
 * reads it by key rather than transcribing a shape of its own.
 *
 * Deliberately widened to `object` rather than an indexed `Record`: a library
 * result declared as a plain `interface` (`HeatIndexResult`) carries no index
 * signature and TypeScript never infers one for it, so a `Record` type here
 * would reject every such model at its declaration. `libraryInputs.resultValue`
 * is the one place that indexes into it.
 */
export type ModelResult = object;

/** A closed interval, in SI. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * How far one quantity is drawn wherever it carries an axis, in SI.
 *
 * A viewport, not a threshold. ADR §4.4: axis ranges are declared, never
 * derived from the model's applicability bounds — those validate what the
 * user typed, and conflating the two clipped the ISO chart to 10–30 °C and
 * left `rh`, which no standard bounds, unable to carry an axis at all.
 */
export interface AxisRange {
  readonly quantity: Quantity;
  readonly min: number;
  readonly max: number;
}

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
      /**
       * The comfort zone is solved on `run`'s own `pmv`, so the model's result
       * must carry one, unrounded (ADR-0002 decision 9, revised 2026-09-18).
       */
      readonly type: typeof chartType.psychrometric;
    }
  | {
      readonly type: typeof chartType.dynamic;
      /** Starting axes; the user may pick any entered quantity that has a declared range. */
      readonly axes: { readonly x: Quantity; readonly y: Quantity };
      /**
       * The numeric output the chart scans. Each grid cell keeps this number,
       * and the surface is contoured at {@link bands}' Edges (ADR-0002
       * decision 27), so a boundary lands where the value really crosses one.
       * A classified output would be the wrong handle: a category per cell
       * says nothing about where inside the cell the crossing is.
       */
      readonly output: Quantity;
      /**
       * The library classifier that cuts {@link output}, as a reference to the
       * library's own object. Nothing in `_INFO` says which quantity a
       * classifier cuts and no key string pairs the two, so the pairing is the
       * object identity itself (ADR-0002 decision 27).
       *
       * Written as `<MODEL>_INFO.outputs.<key>.classifier` where that types as
       * defined, else as the library's exported bins constant — the same
       * object either way, and never a cast or a `!`. The band list is its
       * `labels` in order, and the library's own `classifyFromBins` against it
       * answers the hover readout, so the app holds no Edge, no label and no
       * inclusivity rule of its own.
       */
      readonly bands: ClassifierBins;
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
  /**
   * The library's own `_INFO` object: label, description, inputs, outputs,
   * derived quantities, applicability bounds and classifiers.
   * `core/applicability.ts` owns every read of the applicability bounds
   * (ADR-0002 decision 4).
   */
  readonly info: ModelInfo;
  /**
   * The standard `run` pins, named beside the results. Absent for an
   * Explore-only model such as Heat Index. The declaration passes the same
   * constant to `run`, so the label and the call cannot disagree (rewrite
   * plan, Phase 3.6 item 3: pinned, never offered as an option while editions
   * share a kernel).
   */
  readonly standard?: Standard;
  /**
   * The library's model function, bound positionally by the declaration. Takes
   * SI values keyed by `Quantity.key` and returns the model's own result
   * object. Called only by state/compute (Phase 3: only in the worker).
   */
  readonly run: (init: Record<string, number>) => ModelResult;
  /**
   * The library's function name for this model, as the library spells it
   * (`"pmv_ppd_iso"`). The model's one name (ADR-0002 decision 30): the share
   * link will carry it as written, the route spells it with hyphens, and the
   * declaration's own file and constant spell it in camelCase. Proved against
   * the package's exports by a registry-wide test, so a typo or an upstream
   * rename fails a test rather than drifting.
   */
  readonly name: string;
  /** Panel order and SI default values. */
  readonly inputs: readonly { readonly quantity: Quantity; readonly value: number }[];
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

/**
 * The declared extent of `quantity`, else `info.inputs`' own applicability
 * bound when it has both a `min` and a `max`, else `undefined` when `quantity`
 * may not carry an axis at all (ADR-0002 decision 7).
 */
export function axisRangeFor(model: RegisteredModel, quantity: Quantity): Range | undefined {
  const declared = model.axisRanges.find((range) => range.quantity === quantity);
  if (declared) {
    return { min: declared.min, max: declared.max };
  }
  const bound = model.info.inputs[quantity.key]?.applicability;
  if (bound?.min !== undefined && bound.max !== undefined) {
    return { min: bound.min, max: bound.max };
  }
  return undefined;
}

/** The same, for an axis the chart is already drawing: a missing range is a declaration bug. */
export function requireAxisRange(model: RegisteredModel, quantity: Quantity): Range {
  const range = axisRangeFor(model, quantity);
  if (!range) {
    throw new Error(`${model.info.label} declares no axis range for ${quantity.label}, so it cannot carry an axis`);
  }
  return range;
}

/**
 * Entry groups are read from `inputs`, not declared (ADR §4.2, 2026-09-08):
 * a model has the humidity group when it takes `rh`, and the temperature
 * group when it takes both `tdb` and `tr`.
 */
export function hasHumidityGroup(model: RegisteredModel): boolean {
  return model.inputs.some((entry) => entry.quantity === quantities.rh);
}

export function hasTemperatureGroup(model: RegisteredModel): boolean {
  const entered = model.inputs.map((entry) => entry.quantity);
  return entered.includes(quantities.tdb) && entered.includes(quantities.tr);
}
