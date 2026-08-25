import type { PlotlyChartResponseDto } from "../../../../models/comfortDtos";
import type { InputId as InputIdType } from "../../../../models/inputSlots";
import type {
  ChartBuildContext,
  ModelOutput,
} from "../../../../models/modelCapabilities";
import {
  ChartKind,
  type ChartInstanceCapabilities,
  type ModelChartKind,
} from "../../../../models/output/chartKinds";
import type { ChartAxisQuantityId } from "../../../../models/physicalQuantities";
import type { GridModelChartSpec } from "../gridModelCharts";
import type { ChartRange } from "../types";

export interface DynamicFieldLockedAxes {
  readonly xField: ChartAxisQuantityId;
  readonly yField: ChartAxisQuantityId;
  readonly xRangeSi: ChartRange;
  readonly yRangeSi: ChartRange;
}

/**
 * Authoring-facing grid spec. Payload parameters use `never` so a model-specific
 * `GridModelChartSpec<TPayload, TResult>` remains assignable (contravariance).
 */
export type DynamicFieldResolvedGridSpec<TResult> = Omit<
  GridModelChartSpec<never, TResult>,
  "instanceId" | "dynamicTitle"
>;

/** Data-only DynamicField spec. Geometry stays in the DynamicField engine. */
export interface DynamicFieldGridSpec<TResult> {
  readonly title: string;
  readonly axisFields: readonly ChartAxisQuantityId[];
  readonly lockedAxes?: DynamicFieldLockedAxes;
  readonly resolveGridSpec: (
    context: ChartBuildContext,
  ) => DynamicFieldResolvedGridSpec<TResult>;
}

type FrontendChartBuild<TResult, ChartSourceType> = (
  chartSource: ChartSourceType | null,
  resultsByInput: Record<InputIdType, TResult | null>,
  context: ChartBuildContext,
) => PlotlyChartResponseDto | null;

/**
 * Frontend-internal DynamicField geometry. Not part of the model-declaration
 * chart union. Used for PMV Dynamic, which is a field chart but not the shared
 * grid engine.
 */
export interface DynamicFieldGeometrySpec<TResult, ChartSourceType> {
  readonly title: string;
  readonly axisFields: readonly ChartAxisQuantityId[];
  readonly lockedAxes?: DynamicFieldLockedAxes;
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

export type DynamicFieldChartKindSpec<TResult, ChartSourceType = unknown> =
  | DynamicFieldGridSpec<TResult>
  | DynamicFieldGeometrySpec<TResult, ChartSourceType>;

export function isDynamicFieldGridSpec<TResult = never>(
  spec: object,
): spec is DynamicFieldGridSpec<TResult> {
  return "resolveGridSpec" in spec && !specHasPlotlyBuild(spec);
}

export function specHasPlotlyBuild(spec: object): boolean {
  return "build" in spec;
}

/** Data-only BandScalar spec. Geometry stays in the BandScalar engine. */
export interface BandScalarDataSpec<TResult> {
  readonly title: string;
  readonly getOutputValue: (result: TResult) => number;
}

export interface BandScalarGeometrySpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

export type BandScalarChartKindSpec<TResult, ChartSourceType = unknown> =
  | BandScalarDataSpec<TResult>
  | BandScalarGeometrySpec<TResult, ChartSourceType>;

export function isBandScalarDataSpec<TResult>(
  spec: object,
): spec is BandScalarDataSpec<TResult> {
  return (
    "getOutputValue" in spec &&
    !("getSeries" in spec) &&
    !("getGeometry" in spec) &&
    !specHasPlotlyBuild(spec)
  );
}

/** Data-only BoundaryRegion spec. Geometry stays in the BoundaryRegion engine. */
export interface BoundaryRegionDataSpec {
  readonly title: string;
  readonly axisFields: readonly ChartAxisQuantityId[];
}

export interface BoundaryRegionGeometrySpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

export type BoundaryRegionChartKindSpec<TResult, ChartSourceType = unknown> =
  | BoundaryRegionDataSpec
  | BoundaryRegionGeometrySpec<TResult, ChartSourceType>;

export function isBoundaryRegionDataSpec(
  spec: object,
): spec is BoundaryRegionDataSpec {
  if (
    !("axisFields" in spec) ||
    !("title" in spec) ||
    "resolveGridSpec" in spec ||
    specHasPlotlyBuild(spec)
  ) {
    return false;
  }
  const { axisFields } = spec as BoundaryRegionDataSpec;
  return Array.isArray(axisFields) && axisFields.length >= 2;
}

/** Data-only TimeSeriesLine spec. Geometry stays in the TimeSeriesLine engine. */
export interface TimeSeriesLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface TimeSeriesLineDataSpec<TResult> {
  readonly title: string;
  readonly yLabel: string;
  readonly getSeries: (result: TResult) => readonly TimeSeriesLinePoint[];
}

export interface TimeSeriesLineGeometrySpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

export type TimeSeriesLineChartKindSpec<TResult, ChartSourceType = unknown> =
  | TimeSeriesLineDataSpec<TResult>
  | TimeSeriesLineGeometrySpec<TResult, ChartSourceType>;

export function isTimeSeriesLineDataSpec<TResult>(
  spec: object,
): spec is TimeSeriesLineDataSpec<TResult> {
  return (
    "getSeries" in spec &&
    !("getGeometry" in spec) &&
    !specHasPlotlyBuild(spec)
  );
}

export const ParametricYUnit = {
  Temperature: "temperature",
  HeatFlux: "heat-flux",
  Identity: "identity",
} as const;

export type ParametricYUnit =
  (typeof ParametricYUnit)[keyof typeof ParametricYUnit];

export interface ParametricLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface ParametricPolyline {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly ParametricLinePoint[];
  readonly yUnit: ParametricYUnit;
  readonly yAxis?: "y" | "y2";
  readonly visible?: boolean;
  readonly dash?: "solid" | "dot" | "dash";
}

export interface ParametricLimitBand {
  readonly label: string;
  readonly color: string;
  readonly min: number;
  readonly max: number;
  readonly yUnit: ParametricYUnit;
  readonly yAxis?: "y" | "y2";
}

export interface ParametricLineGeometry {
  readonly polylines: readonly ParametricPolyline[];
  readonly limitBands?: readonly ParametricLimitBand[];
  readonly comparePoints?: Partial<
    Record<InputIdType, { x: number; y: number }>
  >;
}

/** Data-only ParametricLine spec. Geometry stays in the ParametricLine engine. */
export interface ParametricLineDataSpec<TResult> {
  readonly title: string;
  readonly xField: ChartAxisQuantityId;
  readonly yLabel: string;
  readonly y2Label?: string;
  readonly getGeometry: (
    chartSource: unknown,
    resultsByInput: Record<InputIdType, TResult | null>,
    context: ChartBuildContext,
  ) => ParametricLineGeometry | null;
}

export function isParametricLineDataSpec<TResult>(
  spec: object,
): spec is ParametricLineDataSpec<TResult> {
  return "getGeometry" in spec && !specHasPlotlyBuild(spec);
}

export interface CustomChartKindSpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

/**
 * Closed model-declaration engine→data-spec map. Extended types must pick a key here.
 * Custom is omitted. ParametricLine interchange is polylines and optional limit bands.
 */
export interface ModelChartKindSpecMap<TResult> {
  readonly [ChartKind.DynamicField]: DynamicFieldGridSpec<TResult>;
  readonly [ChartKind.BoundaryRegion]: BoundaryRegionDataSpec;
  readonly [ChartKind.ParametricLine]: ParametricLineDataSpec<TResult>;
  readonly [ChartKind.BandScalar]: BandScalarDataSpec<TResult>;
  readonly [ChartKind.TimeSeriesLine]: TimeSeriesLineDataSpec<TResult>;
}

export type ModelChartKindSpec<TResult> = {
  [K in ModelChartKind]: {
    readonly kind: K;
    readonly spec: ModelChartKindSpecMap<TResult>[K];
  };
}[ModelChartKind];

/**
 * Closed ChartEngine spec union for frontend registrations.
 * Custom is PMV psychrometric geometry only.
 * ParametricLine is data-only (polylines and optional limit bands).
 */
export type RegisteredChartKindSpec<TResult, ChartSourceType> =
  | {
      kind: typeof ChartKind.DynamicField;
      spec: DynamicFieldChartKindSpec<TResult, ChartSourceType>;
    }
  | {
      kind: typeof ChartKind.BoundaryRegion;
      spec: BoundaryRegionChartKindSpec<TResult, ChartSourceType>;
    }
  | {
      kind: typeof ChartKind.ParametricLine;
      spec: ParametricLineDataSpec<TResult>;
    }
  | {
      kind: typeof ChartKind.BandScalar;
      spec: BandScalarChartKindSpec<TResult, ChartSourceType>;
    }
  | {
      kind: typeof ChartKind.TimeSeriesLine;
      spec: TimeSeriesLineChartKindSpec<TResult, ChartSourceType>;
    }
  | {
      kind: typeof ChartKind.Custom;
      spec: CustomChartKindSpec<TResult, ChartSourceType>;
    };

interface OutputChartCommonFields {
  readonly instanceId: string;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
  /**
   * Named chart type (built-in or model-declaration extension). Must keep this
   * entry's existing engine; extended types cannot escape the model-declaration
   * spec union.
   */
  readonly type?: string;
}

/**
 * `defineModel` chart entry. Data-only discriminated union over existing
 * engines. No Custom, no Plotly `build`.
 */
export type ModelChartDeclaration<TResult = unknown> = OutputChartCommonFields &
  ModelChartKindSpec<TResult>;

/** Family / ComfortModelBuilder chart entry. May include frontend-owned Plotly geometry. */
export type FrontendChartDeclaration<
  TResult = unknown,
  ChartSourceType = unknown,
> = OutputChartCommonFields & RegisteredChartKindSpec<TResult, ChartSourceType>;

/** Family / ComfortModelBuilder chart entry. Alias of FrontendChartDeclaration. */
export type OutputChartDeclarationInput<
  TResult = unknown,
  ChartSourceType = unknown,
> = FrontendChartDeclaration<TResult, ChartSourceType>;

export interface ChartKindRegistration<TResult, ChartSourceType> {
  readonly instanceId: string;
  readonly name: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
  readonly registration: RegisteredChartKindSpec<TResult, ChartSourceType>;
}

export function modelChartSpecMatchesKind(chart: {
  readonly kind: ModelChartKind;
  readonly spec: object;
}): boolean {
  switch (chart.kind) {
    case ChartKind.DynamicField:
      return isDynamicFieldGridSpec(chart.spec);
    case ChartKind.BandScalar:
      return isBandScalarDataSpec(chart.spec);
    case ChartKind.BoundaryRegion:
      return isBoundaryRegionDataSpec(chart.spec);
    case ChartKind.ParametricLine:
      return isParametricLineDataSpec(chart.spec);
    case ChartKind.TimeSeriesLine:
      return isTimeSeriesLineDataSpec(chart.spec);
  }
}
