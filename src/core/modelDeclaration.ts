import type { ClassifierBins, ModelInfo, Standard } from "jsthermalcomfort";
import { chartType } from "./chartType";
import { clothingCorrectionFor, type ClothingCorrection } from "./clothingCorrection";
import { temperatureMode } from "./entryModes";
import { quantities, quantityFor, type Quantity } from "./quantities";

/**
 * The model's own result object, keyed by the same strings as its `_INFO`:
 * a number for a physical output, or the category label (or NaN) a classified
 * output returns. `run` returns this directly (ADR-0002 decision 3) — the app
 * reads it by key rather than transcribing a shape of its own.
 *
 * Deliberately widened to `object` rather than an indexed `Record`: a library
 * result declared as a plain `interface` (`HeatIndexResult`) carries no index
 * signature and TypeScript never infers one for it, so a `Record` type here
 * would reject every such model at its declaration. `core/modelRun.ts` casts
 * it in two places: `resultValue` reads it by key, `resultWarnings` reads its
 * `warnings`.
 */
export type ModelResult = object;

/**
 * How a declaration reads its slot's values: one number per Quantity, under
 * the quantity table's own key, so `values.tdb` type-checks and `values.tbd`
 * does not (ADR-0002 decision 34). Reading a quantity the slot does not hold
 * throws, naming it; there is no key that answers `undefined`.
 */
export type Values = { readonly [K in keyof typeof quantities]: number };

/**
 * A switch a model takes beside its quantities (`airspeed_control`): no unit,
 * no range, never on an axis. Declared in the model's own file and referred to
 * by identity, as a `Quantity` is (ADR-0002 decision 36). `key` is what the
 * share link will carry, `label` what the panel shows, `default` what a slot
 * starts from. A boolean only; a kind field waits for a second kind of option.
 */
export interface OptionSpec {
  readonly key: string;
  readonly label: string;
  readonly default: boolean;
}

/**
 * How a declaration reads its slot's options: the boolean for the option
 * asked, so it lands in the library's params where the compiler checks it
 * (ADR-0002 decision 36).
 */
export type OptionsReader = (option: OptionSpec) => boolean;

/** A closed interval, in SI. */
export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * How far one quantity is drawn wherever it carries an axis, in SI.
 *
 * A viewport, not a gate: Applicability says which entered values the model
 * answers for, an axis range how much of a quantity a chart shows. A declared
 * range wins; {@link axisRangeFor} falls back to the applicability bound only
 * for a quantity declared without one (ADR-0002 decision 5).
 */
export interface AxisRange extends Range {
  readonly quantity: Quantity;
}

/** The two quantities a chart is drawn on, one per axis. */
export interface ChartAxes {
  readonly x: Quantity;
  readonly y: Quantity;
}

/**
 * One exact Comfort zone a model supplies instead of the scanned grid, in SI.
 * `x` and `y` run along the dynamic chart's own axes and close the polygon.
 */
export interface ZonePolygon {
  readonly label: string;
  readonly x: readonly number[];
  readonly y: readonly number[];
}

/** What a `comfortZones` source is given: the slot's resolved SI inputs, read as `run` reads them, and the x axis range being drawn. */
export interface ZoneRequest {
  readonly values: Values;
  readonly xRange: Range;
}

/**
 * One Comfort zone of the model: where |PMV| < `limit`, or |PMV| ≤ `limit`
 * when `inclusive`, as the library object it was read from says (a
 * classifier's `right`, the strict compliance interval). `label` names it in
 * the legend. Written through `core/comfortZones`, so a declaration copies no
 * limit.
 */
export interface ComfortZone {
  readonly label: string;
  readonly limit: number;
  readonly inclusive: boolean;
}

/**
 * What the model scans, declared once for every chart that scans it
 * (ADR-0002 decision 61): the dynamic chart that is not polygons and the
 * psychrometric chart both scan {@link output}; on Explore both paint the
 * Band list copied from {@link classifier}, on Standard both draw
 * {@link comfortZones} (decision 58). Each field is named for the CONTEXT.md
 * term it holds, not for the page that paints it.
 */
export interface DeclaredScan {
  /**
   * The numeric output a scan keeps at each grid cell, so a boundary lands
   * where the value really crosses an Edge or a limit (ADR-0002 decisions 27
   * and 58). A classified output would be the wrong handle: a category per
   * cell says nothing about where inside the cell the crossing is.
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
   * object either way, and never a cast or a `!`. The model's default
   * Band list is a copy of it (`core/bands.ts`), and the library's own
   * `classifyFromBins` against that list answers Explore's hover readout,
   * so the app holds no Edge, no label and no inclusivity rule of its own.
   */
  readonly classifier: ClassifierBins;
  /**
   * The Comfort zones Standard draws on {@link output}, nested, one per
   * limit: one for a standard with one interval, one per category for a
   * category standard. `core/comfortZones` builds |PMV| limits
   * ({@link ComfortZone}), so a model declaring them scans `pmv`. Absent for
   * a model whose standard draws no limit on it. A model declaring the
   * psychrometric chart has them, which a registry-wide test holds
   * (`core/modelDeclaration.test.ts`).
   */
  readonly comfortZones?: readonly [ComfortZone, ...ComfortZone[]];
}

/**
 * A chart a model offers (ADR §4.4). A discriminated union rather than one wide
 * object: the psychrometric chart's axes are fixed by the temperature entry
 * mode, and the dynamic chart comes in two shapes, scanned or drawn from
 * declared polygons (ADR-0002 decision 37). What a chart scans is the model's
 * {@link DeclaredScan}, so no chart names an output or a classifier
 * (decision 61).
 *
 * The members' types are object identities, which discriminate nothing for
 * the compiler, and an object literal checked against a union has only the
 * keys no member knows reported as excess. So each member marks the others'
 * fields `never`: without that the compiler would take a psychrometric chart
 * with axes, or a scanned chart with an invented `comfortZones`.
 */
export type DeclaredChart =
  | {
      /**
       * What it paints on Standard is the model's scan's Comfort zones, so the
       * model must declare some (ADR-0002 decision 61); a registry-wide test
       * holds it (`core/modelDeclaration.test.ts`).
       */
      readonly type: typeof chartType.psychrometric;
      readonly axes?: never;
      readonly comfortZones?: never;
    }
  | {
      readonly type: typeof chartType.dynamic;
      /** Starting axes; the user may pick any entered quantity that has an axis range ({@link axisRangeFor}). */
      readonly axes: ChartAxes;
      readonly comfortZones?: never;
    }
  | {
      readonly type: typeof chartType.dynamic;
      /**
       * Locked: the chart is drawn on these two quantities whatever the entry
       * mode, and the picker is not offered. An operative-temperature axis
       * stays operative under separate entry, marked at the library's `t_o` of
       * the entered temperatures and air speed by the model's standard
       * (`slot.operativeTemperatureOf`).
       */
      readonly axes: ChartAxes;
      /**
       * Exact Comfort zone polygons, for a model whose geometry is traced
       * rather than scanned — Adaptive's acceptability zones. No grid is run
       * at all, because the polygons are the answer rather than an
       * approximation of it (ADR §4.4). The zones are nested and returned
       * largest first, the order the chart draws them in.
       */
      readonly comfortZones: (request: ZoneRequest) => readonly ZonePolygon[];
    };

/** The psychrometric member of {@link DeclaredChart}. */
export type DeclaredPsychrometricChart = Extract<DeclaredChart, { type: typeof chartType.psychrometric }>;
/** Either dynamic member of {@link DeclaredChart}. */
export type DeclaredDynamicChart = Extract<DeclaredChart, { type: typeof chartType.dynamic }>;
/** The dynamic chart drawn from declared polygons on locked axes. */
export type DeclaredPolygonsChart = Extract<DeclaredDynamicChart, { readonly comfortZones: unknown }>;

/** What every registered model declares, whatever it scans: {@link RegisteredModel} adds the scan and the charts. */
interface CommonDeclaration {
  /**
   * The library's own `_INFO` object: name, label, description, inputs,
   * outputs, derived quantities, applicability bounds and classifiers. Its
   * `name` is the library's function name and the model's one name (ADR-0002
   * decision 30): the share link will carry it as written, the route spells
   * it with hyphens, and the declaration's own file and constant spell it in
   * camelCase.
   * The pre-call gate reads its applicability bounds in
   * `core/applicability.ts` (ADR-0002 decision 4), and {@link axisRangeFor}
   * reads them for a quantity with no declared axis range (decision 5).
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
   * Whether the model has a Time-series page (`core/page.ts`). No registered
   * model writes it; PHS will (ADR-0002 decision 57).
   */
  readonly timeSeries?: true;
  /**
   * The library's model function, called by the declaration itself with the
   * library's one params object, every quantity written by name (ADR-0002
   * decision 34):
   *
   * ```ts
   * run: (values) =>
   *   pmv_ppd_iso({ tdb: values.tdb, tr: values.tr, vr: values.vr, rh: values.rh, met: values.met, clo: values.clo, … })
   * ```
   *
   * The compiler checks every key against the library's params: a misspelt
   * key is an excess property, a forgotten quantity a missing required one.
   * What it cannot see is two quantities in each other's place
   * (`tdb: values.tr`), and a registry-wide test checks that every quantity key
   * the library receives carries that quantity's own number.
   *
   * A model with {@link options} reads them through the second reader, each
   * written inline under its library key:
   * `airspeed_control: options(airSpeedControl)`. Never through a spread: a
   * spread into an object literal is exempt from the excess-property check,
   * so a misspelt optional key inside one compiles silently (verified
   * 2026-09-25 by a compiler probe), and the option-key test only proves the
   * key and the property agree. A model without options leaves the reader
   * unnamed (ADR-0002 decision 36).
   *
   * The contract: the model's own result object, carrying the model's numbers
   * unrounded (ADR-0002 decision 18), with the library's `round_output`
   * written off in the call (decision 35). A registry-wide test samples the
   * table's first column and fails when it was left on (decision 38). Called by
   * `state/compute` and by the chart spec builders.
   */
  readonly run: (values: Values, options: OptionsReader) => ModelResult;
  /** Panel order and SI default values. */
  readonly inputs: readonly { readonly quantity: Quantity; readonly value: number }[];
  /**
   * The model's options, in panel order; empty for a model with none. Every
   * one is shown as a checkbox under the quantity rows, and a slot holds its
   * value beside the quantities' (ADR-0002 decision 36).
   */
  readonly options: readonly OptionSpec[];
  /**
   * How far each quantity is drawn. One table per model rather than one per
   * chart: the deployed tool draws its psychrometric x axis and its field
   * charts' temperature axis over the same 10–40 °C, and nothing in v1 wants
   * two ranges for one quantity.
   */
  readonly axisRanges: readonly AxisRange[];
  /** Result table columns, in order. Required (ADR §4.3). */
  readonly table: readonly Quantity[];
}

/**
 * One model's declaration. Charts are in offering order, the first the
 * default, and every model has at least one. A model with a
 * {@link DeclaredScan} may offer any chart; a model without one scans nothing,
 * so it offers only polygons charts (ADR-0002 decision 61).
 */
export type RegisteredModel = CommonDeclaration &
  (
    | {
        readonly scan: DeclaredScan;
        readonly charts: readonly [DeclaredChart, ...DeclaredChart[]];
      }
    | {
        readonly scan?: never;
        readonly charts: readonly [DeclaredPolygonsChart, ...DeclaredPolygonsChart[]];
      }
  );

// The union is discriminated by an object identity, which TypeScript does not
// narrow on `===` the way it narrows a literal, so each lookup carries its own
// predicate. Comparing `type.id` strings instead would be the string-keyed
// closed set ADR §4.0 rules out. `find` on {@link RegisteredModel}'s two
// tuple types drops the predicate's overload, so it is called on the charts
// widened to one array type.

export function psychrometricChartOf(model: RegisteredModel): DeclaredPsychrometricChart | undefined {
  const charts: readonly DeclaredChart[] = model.charts;
  return charts.find((chart): chart is DeclaredPsychrometricChart => chart.type === chartType.psychrometric);
}

export function dynamicChartOf(model: RegisteredModel): DeclaredDynamicChart | undefined {
  const charts: readonly DeclaredChart[] = model.charts;
  return charts.find((chart): chart is DeclaredDynamicChart => chart.type === chartType.dynamic);
}

/** A dynamic chart drawn from declared polygons, whose axes are therefore locked (ADR-0002 decision 37). */
export function isPolygonsChart(chart: DeclaredDynamicChart): chart is DeclaredPolygonsChart {
  return chart.comfortZones !== undefined;
}

/**
 * The declared axis range of `quantity`, else `info.inputs`' own applicability
 * bound when it has both a `min` and a `max`, else `undefined` when `quantity`
 * may not carry an axis at all (ADR-0002 decision 5).
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

/** What `model` scans, for a scanned chart already being drawn: a model without a scan is a declaration bug. */
export function requireScan(model: RegisteredModel): DeclaredScan {
  if (!model.scan) {
    throw new Error(`${model.info.label} declares no scan, so it has no scanned chart`);
  }
  return model.scan;
}

/**
 * Entry groups are read from `inputs`, not declared (ADR §4.2, 2026-09-08):
 * a model has the humidity group when it takes `rh`, and the temperature
 * group when it takes every quantity the separate entry mode shows; a model
 * with only some of them has none.
 */
export function hasHumidityGroup(model: RegisteredModel): boolean {
  return model.inputs.some((entry) => entry.quantity === quantities.rh);
}

export function hasTemperatureGroup(model: RegisteredModel): boolean {
  const entered = model.inputs.map((entry) => entry.quantity);
  return temperatureMode.separate.panel.every((quantity) => entered.includes(quantity));
}

/**
 * Whether the model takes `vr`, and so has the air-speed entry group: the app
 * derives `vr` as `v_relative(v, met)` from the entered `v`, or is entered it
 * (ADR-0002 decision 54). Read from whether `info.inputs` names it, each key
 * reconciled through `quantityFor` (decision 48).
 */
export function takesRelativeAirSpeed(model: RegisteredModel): boolean {
  return Object.keys(model.info.inputs).some((key) => quantityFor(key) === quantities.vr);
}

/**
 * The rule by which `model` is given the dynamic clothing insulation: its
 * standard's row in `core/clothingCorrection.ts`, when its info names `clo`.
 * `undefined` for a model that takes no clothing, and for one whose standard
 * corrects none, which is given the clothing insulation as entered (ADR-0002
 * decision 54).
 */
export function clothingCorrectionOf(model: RegisteredModel): ClothingCorrection | undefined {
  const takesClothing = Object.keys(model.info.inputs).some((key) => quantityFor(key) === quantities.clo);
  return takesClothing ? clothingCorrectionFor(model.standard) : undefined;
}

/** Whether the model has the clothing entry group: it takes the clothing, and its standard corrects it. */
export function hasClothingGroup(model: RegisteredModel): boolean {
  return clothingCorrectionOf(model) !== undefined;
}
