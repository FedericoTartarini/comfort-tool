import type { PlotlyChartSpec } from "../../../plotlyTypes";
import type { InputId as InputIdType } from "../../../../catalog/inputSlots";
import type {
  ChartBuildContext,
  ModelOutput,
} from "../../../../catalog/modelCapabilities";
import {
  ChartType,
  type ChartInstanceCapabilities,
} from "../../../../catalog/chartTypes";
import type { ChartAxisQuantityId } from "../../../../catalog/quantities";
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
) => PlotlyChartSpec | null;

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

export type DynamicFieldChartEngineSpec<TResult, ChartSourceType = unknown> =
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

export type BandScalarChartEngineSpec<TResult, ChartSourceType = unknown> =
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

export type BoundaryRegionChartEngineSpec<TResult, ChartSourceType = unknown> =
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

export type TimeSeriesLineChartEngineSpec<TResult, ChartSourceType = unknown> =
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

export interface CustomChartEngineSpec<TResult, ChartSourceType> {
  readonly build: FrontendChartBuild<TResult, ChartSourceType>;
}

/**
 * Closed ChartType bind-spec map. defineModel may only use data-only Dynamic.
 */
export interface ModelChartTypeSpecMap<TResult> {
  readonly [ChartType.Dynamic]: DynamicFieldGridSpec<TResult>;
}

export type ModelChartDeclaration<TResult = unknown> = ChartCommonFields & {
  readonly type: typeof ChartType.Dynamic;
  readonly spec: ModelChartTypeSpecMap<TResult>[typeof ChartType.Dynamic];
};

/**
 * Closed ChartType spec union for frontend registrations.
 */
export type RegisteredChartBindSpec<TResult, ChartSourceType> =
  | {
      type: typeof ChartType.Dynamic;
      spec: DynamicFieldChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.Adaptive;
      spec: BoundaryRegionChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.HeatLoss;
      spec: ParametricLineDataSpec<TResult>;
    }
  | {
      type: typeof ChartType.Set;
      spec: ParametricLineDataSpec<TResult>;
    }
  | {
      type: typeof ChartType.Utci;
      spec: BandScalarChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.BodyTemperature;
      spec: TimeSeriesLineChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.WaterLoss;
      spec: TimeSeriesLineChartEngineSpec<TResult, ChartSourceType>;
    }
  | {
      type: typeof ChartType.Psychrometric;
      spec: CustomChartEngineSpec<TResult, ChartSourceType>;
    };

interface ChartCommonFields {
  readonly id: string;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly capabilities?: Partial<ChartInstanceCapabilities>;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
}

/** Family / ComfortModelBuilder chart entry. */
export type FrontendChartDeclaration<
  TResult = unknown,
  ChartSourceType = unknown,
> = ChartCommonFields & RegisteredChartBindSpec<TResult, ChartSourceType>;

/** Family / ComfortModelBuilder chart entry. Alias of FrontendChartDeclaration. */
export type ChartDeclarationInput<
  TResult = unknown,
  ChartSourceType = unknown,
> = FrontendChartDeclaration<TResult, ChartSourceType>;

export interface ChartEngineRegistration<TResult, ChartSourceType> {
  readonly instanceId: string;
  readonly type: ChartType;
  readonly emptyMessage: string;
  readonly note?: string;
  readonly supportedExploreOutputs?: readonly ModelOutput["key"][];
  readonly defaultExploreOutput?: ModelOutput["key"];
  readonly registration: RegisteredChartBindSpec<TResult, ChartSourceType>;
}

export type RegisteredChartEngineSpec<TResult, ChartSourceType> =
  RegisteredChartBindSpec<TResult, ChartSourceType>;

export function modelChartSpecMatchesEngine(chart: {
  readonly type: ChartType;
  readonly spec: object;
}): boolean {
  return modelChartSpecMatchesType(chart);
}

export function modelChartSpecMatchesType(chart: {
  readonly type: ChartType;
  readonly spec: object;
}): boolean {
  switch (chart.type) {
    case ChartType.Dynamic:
      return isDynamicFieldGridSpec(chart.spec) || specHasPlotlyBuild(chart.spec);
    case ChartType.Utci:
      return isBandScalarDataSpec(chart.spec) || specHasPlotlyBuild(chart.spec);
    case ChartType.Adaptive:
      return isBoundaryRegionDataSpec(chart.spec) || specHasPlotlyBuild(chart.spec);
    case ChartType.HeatLoss:
    case ChartType.Set:
      return isParametricLineDataSpec(chart.spec);
    case ChartType.BodyTemperature:
    case ChartType.WaterLoss:
      return isTimeSeriesLineDataSpec(chart.spec) || specHasPlotlyBuild(chart.spec);
    case ChartType.Psychrometric:
      return specHasPlotlyBuild(chart.spec);
  }
}
